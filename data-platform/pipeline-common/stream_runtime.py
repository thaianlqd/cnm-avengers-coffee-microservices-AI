"""At-least-once stream boundary: durable Bronze first, replayable projection.

Broker-position singleton ranges keep object identities stable even if a replay
has different batch boundaries. This event stream does not update Silver facts.
"""
import base64
import hashlib
import json
import re
import time

from pipeline_runtime import canonical_bytes, PipelineContractError

MAX_EVENT_BYTES = 1_000_000
_TOPIC = re.compile(r'^[A-Za-z0-9_-]{1,100}$')


def broker_record(topic, partition, offset, value, key=None):
    if (not isinstance(topic, str) or not _TOPIC.fullmatch(topic)
            or type(partition) is not int or partition < 0 or type(offset) is not int or offset < 0
            or not isinstance(value, bytes) or key is not None and not isinstance(key, bytes)):
        raise PipelineContractError('Invalid broker record identity')
    identity = {'topic': topic, 'partition': partition, 'offset': offset}
    result = {**identity, 'event_id': hashlib.sha256(canonical_bytes(identity)).hexdigest(),
              'key': base64.b64encode(key).decode() if key is not None else None,
              'source_hash': hashlib.sha256(value).hexdigest()}
    reason = None
    try:
        if len(value) > MAX_EVENT_BYTES:
            reason = 'event_too_large'
            raise ValueError
        def object_pairs(pairs):
            values = {}
            for name, item in pairs:
                if name in values:
                    raise ValueError('duplicate key')
                values[name] = item
            return values
        payload = json.loads(value.decode('utf-8'), object_pairs_hook=object_pairs,
                             parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite')))
        if not isinstance(payload, dict) or not isinstance(payload.get('event_type'), str) or not 1 <= len(payload['event_type']) <= 100:
            reason = 'invalid_event_shape'
            raise ValueError
        if payload.get('producer_version') == '3.4.0' and re.fullmatch(r'[a-f0-9]{64}', str(payload.get('event_id', ''))):
            result['event_id'] = payload['event_id']
        result.update(status='accepted', payload=payload)
    except (ValueError, UnicodeError, RecursionError):
        result.update(status='quarantined', reason=reason or 'invalid_json',
                      raw_base64=base64.b64encode(value[:MAX_EVENT_BYTES]).decode(),
                      original_bytes=len(value), raw_truncated=len(value) > MAX_EVENT_BYTES)
    return result


def bronze_key(record):
    return ('streaming/' if record['status'] == 'accepted' else 'quarantine/') + \
        f"{record['topic']}/{record['partition']}/{record['offset']}-{record['offset']}.json"


def persist_bronze(s3, bucket, record):
    if s3 is None:
        raise PipelineContractError('Bronze is the required durable sink')
    body = canonical_bytes(record)
    digest = hashlib.sha256(body).hexdigest()
    key = bronze_key(record)
    try:
        s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType='application/json',
                      Metadata={'sha256': digest, 'event_id': record['event_id']}, IfNoneMatch='*')
    except Exception as error:
        if getattr(error, 'response', {}).get('Error', {}).get('Code') not in {'PreconditionFailed', '412'}:
            raise
    stored = s3.get_object(Bucket=bucket, Key=key)['Body'].read(2*MAX_EVENT_BYTES+4096)
    if hashlib.sha256(stored).hexdigest() != digest:
        raise PipelineContractError('Bronze retry differs from acknowledged broker bytes')
    return key


def read_bronze_record(s3, bucket, topic, partition, offset, *, quarantined=False):
    # Validate the position before forming a path. Only explicit, bounded
    # positions are replayed; there is no unbounded bucket scan.
    identity = broker_record(topic, partition, offset, b'')
    identity['status'] = 'quarantined' if quarantined else 'accepted'
    response = s3.get_object(Bucket=bucket, Key=bronze_key(identity))
    body = response['Body'].read(2*MAX_EVENT_BYTES+4096)
    if hashlib.sha256(body).hexdigest() != response.get('Metadata', {}).get('sha256'):
        raise PipelineContractError('Replay Bronze checksum differs from durable object metadata')
    record = json.loads(body)
    if any(record.get(name) != identity[name] for name in ('topic','partition','offset','status')):
        raise PipelineContractError('Replay Bronze position differs from requested broker position')
    return record


def project_records(connection, records):
    """Optional PostgreSQL projection. Migration027 supplies the unique index."""
    if connection is None:
        raise PipelineContractError('Projection connection unavailable')
    try:
        with connection.cursor() as cursor:
            for record in records:
                if record['status'] != 'accepted':
                    continue
                cursor.execute('INSERT INTO public.realtime_events '
                    '(topic,event_key,event_type,payload,kafka_partition,kafka_offset,event_id) '
                    'VALUES (%s,%s,%s,%s::jsonb,%s,%s,%s) '
                    'ON CONFLICT DO NOTHING',
                    (record['topic'], record['key'], record['payload']['event_type'],
                     canonical_bytes(record['payload']).decode(), record['partition'], record['offset'], record['event_id']))
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def flush_records(records, s3, bucket, commit_offsets, *, project=None, deadline=None):
    """Commit after every accepted/quarantined record is durably verified.

    Projection failure is disclosed and recoverable from Bronze; it does not
    change the required sink or pretend to be an atomic two-sink write.
    """
    deadline = time.monotonic()+60 if deadline is None else deadline
    positions = {}
    for record in records:
        if time.monotonic() >= deadline:
            raise TimeoutError('Bronze batch deadline exhausted; offsets remain uncommitted')
        persist_bronze(s3, bucket, record)
        tp = (record['topic'], record['partition'])
        positions[tp] = max(positions.get(tp, 0), record['offset']+1)
    projection_status = 'not_attempted'
    if project is not None and records:
        try:
            project(records)
            projection_status = 'completed'
        except Exception:
            projection_status = 'failed_replay_required'
    if positions:
        commit_offsets(positions)
    return {'bronze': 'durable', 'records': len(records), 'projection': projection_status,
            'quarantined': sum(r['status'] == 'quarantined' for r in records)}
