"""Small shared pipeline contracts: identity, committed runs and fenced cursors.

No daemon, provider, scheduler, implicit checkpoint commit, or schema bootstrap.
Writers use the same target transaction for data and advance_checkpoint. Object
storage publication is a separate boundary and does not claim a distributed
transaction with PostgreSQL/Kafka.
"""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import re
from uuid import uuid4

VERSION = '3.4.0'
MAX_MANIFEST_BYTES = 1_000_000
MAX_ARTIFACT_BYTES = 64_000_000
_RUN_ID = re.compile(r'^[A-Za-z0-9_-]{1,100}$')
_DATASET = re.compile(r'^[A-Za-z][A-Za-z0-9_.-]{0,150}$')
_SHA = re.compile(r'^[a-f0-9]{64}$')


class PipelineContractError(ValueError):
    pass


def private_database_profile():
    """Explicit private pipeline credential; never log or return it to clients."""
    import os,stat
    from pathlib import Path
    path=Path(os.environ.get('DATA_PLATFORM_WAREHOUSE_PROFILE_PATH','/run/secrets/warehouse-pipeline.json'))
    if not path.is_absolute():raise PipelineContractError('Absolute private database profile required')
    try:
        with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW)) as handle:
            attributes=os.fstat(handle.fileno())
            if (not stat.S_ISREG(attributes.st_mode) or attributes.st_uid!=os.getuid()
                    or attributes.st_mode&0o077 or attributes.st_size>4096):
                raise ValueError()
            profile=json.load(handle)
            if (set(profile)!={'user','password'} or any(not isinstance(v,str) or not v or len(v)>1024 for v in profile.values())):
                raise ValueError()
            return profile['user'],profile['password']
    except Exception:
        raise PipelineContractError('Private pipeline database profile unavailable or unsafe') from None


class CheckpointConflict(PipelineContractError):
    pass


def canonical_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False,
                      separators=(',', ':')).encode('utf-8')


def fingerprint(value):
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def start_run(dataset_id, contract_fingerprint, source_runs, *, run_id=None, now=None):
    identity = 'run_' + uuid4().hex if run_id is None else run_id
    if (not isinstance(identity, str) or not isinstance(dataset_id, str) or not isinstance(contract_fingerprint, str)
            or not _RUN_ID.fullmatch(identity) or not _DATASET.fullmatch(dataset_id) or not _SHA.fullmatch(contract_fingerprint)):
        raise PipelineContractError('Invalid governed run identity')
    if not isinstance(source_runs, dict) or not source_runs:
        raise PipelineContractError('Explicit source generations are required')
    if any(not isinstance(key, str) or not _DATASET.fullmatch(key) or not isinstance(value, str) or not value
           for key, value in source_runs.items()):
        raise PipelineContractError('Invalid source generation references')
    return {'version': VERSION, 'run_id': identity, 'dataset_id': dataset_id, 'status': 'staged',
            'contract_fingerprint': contract_fingerprint, 'source_runs': dict(sorted(source_runs.items())),
            'started_at': (now or datetime.now(timezone.utc)).isoformat(), 'outputs': {}}


def finalize_run(manifest, outputs, required, *, now=None):
    """Only verified, current-run required outputs authorize a committed run."""
    if (manifest.get('status') != 'staged' or not isinstance(required, (list, tuple)) or not required
            or any(not isinstance(name, str) or not _DATASET.fullmatch(name) for name in required)):
        raise PipelineContractError('A staged run and required output contract are necessary')
    missing = set(required) - set(outputs)
    if missing:
        raise PipelineContractError('Required dataset output missing')
    for name, output in outputs.items():
        prefix = 'runs/' + manifest['run_id'] + '/' + name + '.'
        key = output.get('key', '')
        if (not _DATASET.fullmatch(name) or output.get('run_id') != manifest['run_id']
                or output.get('status') != 'verified' or not isinstance(output.get('content_hash'), str)
                or not _SHA.fullmatch(output['content_hash']) or type(output.get('rows')) is not int
                or output['rows'] < 0 or output.get('quality_status') not in {'passed', 'no_data'}
                or output.get('quality_status') == 'no_data' and output['rows'] != 0
                or not isinstance(key, str) or not key.startswith(prefix)
                or not re.fullmatch(r'[a-z0-9]{1,12}', key[len(prefix):])
                or type(output.get('bytes')) is not int or not 0 <= output['bytes'] <= MAX_ARTIFACT_BYTES):
            raise PipelineContractError('Unverified or different-run output cannot be published')
    result = deepcopy(manifest)
    result.update(status='committed', outputs=deepcopy(outputs), required_outputs=sorted(set(required)),
                  finished_at=(now or datetime.now(timezone.utc)).isoformat())
    result['manifest_fingerprint'] = fingerprint(result)
    return result


def verify_manifest(manifest, *, expected_run=None, contract_fingerprint=None):
    value = deepcopy(manifest)
    if value.get('version') != VERSION:
        raise PipelineContractError('Unsupported run contract version')
    start_run(value.get('dataset_id', ''), value.get('contract_fingerprint', ''),
              value.get('source_runs', {}), run_id=value.get('run_id', ''))
    expected_hash = value.pop('manifest_fingerprint', None)
    if (value.get('status') != 'committed' or not isinstance(expected_hash, str)
            or expected_hash != fingerprint(value) or expected_run and value.get('run_id') != expected_run
            or contract_fingerprint and value.get('contract_fingerprint') != contract_fingerprint):
        raise PipelineContractError('Committed manifest identity does not match')
    staged = {**value, 'status': 'staged'}
    # Recheck the complete contract instead of trusting an existing hash/status.
    finalize_run(staged, value.get('outputs', {}), value.get('required_outputs', []))
    return manifest


def put_verified_artifact(s3, bucket, manifest, name, body, *, rows, quality_status='passed', suffix='parquet'):
    if (manifest.get('status') != 'staged' or not _RUN_ID.fullmatch(manifest.get('run_id', ''))
            or not _DATASET.fullmatch(name) or not re.fullmatch(r'[a-z0-9]{1,12}', suffix)
            or not isinstance(body, bytes) or type(rows) is not int or rows < 0
            or quality_status not in {'passed', 'no_data'} or len(body) > MAX_ARTIFACT_BYTES
            or quality_status == 'no_data' and rows != 0):
        raise PipelineContractError('Invalid staged artifact')
    key = 'runs/' + manifest['run_id'] + '/' + name + '.' + suffix
    digest = hashlib.sha256(body).hexdigest()
    try:
        s3.put_object(Bucket=bucket, Key=key, Body=body, Metadata={'sha256': digest, 'run_id': manifest['run_id']}, IfNoneMatch='*')
    except Exception as error:
        if getattr(error, 'response', {}).get('Error', {}).get('Code') not in {'PreconditionFailed', '412'}:
            raise
        # A retry may reuse exactly the acknowledged bytes, never overwrite a
        # different artifact under an already-published run identity.
    observed = s3.head_object(Bucket=bucket, Key=key)
    if observed.get('ContentLength') != len(body) or observed.get('Metadata', {}).get('sha256') != digest:
        raise PipelineContractError('Stored artifact size/hash verification failed')
    return {'run_id': manifest['run_id'], 'key': key, 'content_hash': digest, 'bytes': len(body),
            'rows': rows, 'quality_status': quality_status, 'status': 'verified'}


def publish_manifest(s3, bucket, manifest):
    verify_manifest(manifest)
    key = 'runs/' + manifest['run_id'] + '/manifest.json'
    body = canonical_bytes(manifest)
    if len(body) > MAX_MANIFEST_BYTES:
        raise PipelineContractError('Manifest exceeds capacity')
    try:
        s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType='application/json', IfNoneMatch='*')
    except Exception as error:
        if getattr(error, 'response', {}).get('Error', {}).get('Code') not in {'PreconditionFailed', '412'}:
            raise
    # Readers use the exact committed run, never independent latest table keys.
    stored = s3.get_object(Bucket=bucket, Key=key)['Body'].read(MAX_MANIFEST_BYTES+1)
    if len(stored) > MAX_MANIFEST_BYTES:
        raise PipelineContractError('Manifest exceeds capacity')
    verified = json.loads(stored)
    verify_manifest(verified, expected_run=manifest['run_id'], contract_fingerprint=manifest['contract_fingerprint'])
    if verified['manifest_fingerprint'] != manifest['manifest_fingerprint']:
        raise PipelineContractError('Publication readback differs from committed run')
    return key


def read_manifest(s3, bucket, run_id, contract_fingerprint=None):
    if not isinstance(run_id, str) or not _RUN_ID.fullmatch(run_id):
        raise PipelineContractError('An explicit governed run is required')
    body = s3.get_object(Bucket=bucket, Key='runs/'+run_id+'/manifest.json')['Body'].read(MAX_MANIFEST_BYTES+1)
    if len(body) > MAX_MANIFEST_BYTES:
        raise PipelineContractError('Manifest exceeds capacity')
    value = json.loads(body)
    return verify_manifest(value, expected_run=run_id, contract_fingerprint=contract_fingerprint)


def read_verified_artifact(s3, bucket, manifest, name):
    verify_manifest(manifest)
    output = manifest['outputs'][name]
    body = s3.get_object(Bucket=bucket, Key=output['key'])['Body'].read(MAX_ARTIFACT_BYTES+1)
    if len(body) != output['bytes'] or hashlib.sha256(body).hexdigest() != output['content_hash']:
        raise PipelineContractError('Artifact bytes do not match committed manifest')
    return body


def read_checkpoint(connection, dataset_id):
    with connection.cursor() as cursor:
        cursor.execute('SELECT cursor_time, cursor_keys, source_upper_bound, generation, schema_fingerprint, '
                       'last_success_at, last_full_reconcile_at, completeness, observed_rows FROM analytics.ingestion_checkpoints '
                       'WHERE dataset_id=%s', (dataset_id,))
        row = cursor.fetchone()
    if row is None:
        return {'cursor_time': None, 'cursor_keys': [], 'source_upper_bound': None, 'generation': 0,
                'schema_fingerprint': None, 'last_success_at': None, 'last_full_reconcile_at': None,
                'completeness': 'unknown', 'observed_rows': None}
    if isinstance(row, dict):
        return dict(row)
    return dict(zip(('cursor_time', 'cursor_keys', 'source_upper_bound', 'generation', 'schema_fingerprint',
                     'last_success_at', 'last_full_reconcile_at', 'completeness', 'observed_rows'), row))


def quote_identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', value):
        raise PipelineContractError('Invalid governed SQL identifier')
    return '"' + value + '"'


def quote_table(value):
    parts = value.split('.') if isinstance(value, str) else []
    if len(parts) != 2:
        raise PipelineContractError('Source/target requires a qualified table identity')
    return '.'.join(quote_identifier(p) for p in parts)


def validate_data_contract(contract, actual_columns, actual_primary_keys):
    """Typed physical contract; new columns cannot silently carry new secrets."""
    quote_table(contract['source_table'])
    quote_table(contract['target_table'])
    if contract.get('mode') not in {'incremental', 'full_snapshot'} or contract.get('completeness_default') != 'unknown':
        raise PipelineContractError('Unsupported extraction/completeness contract')
    declared = contract['columns']
    if not declared or list(contract['primary_key']) != list(actual_primary_keys):
        raise PipelineContractError('Source key contract drift')
    for name, definition in declared.items():
        quote_identifier(name)
        actual = actual_columns.get(name)
        if actual is None or any(actual.get(field) != definition.get(field) for field in ('data_type', 'udt_name', 'nullable')):
            raise PipelineContractError('Source column/type/nullability contract drift')
        if definition.get('classification') not in {'internal', 'pii', 'restricted'}:
            raise PipelineContractError('Unclassified source column')
        if definition.get('projection') not in {'source', 'redacted'}:
            raise PipelineContractError('Unsupported source projection')
        if definition['classification'] == 'restricted' and definition['projection'] != 'redacted':
            raise PipelineContractError('Credential material cannot be replicated')
        if name in contract['primary_key'] or name == contract.get('update_clock'):
            if definition['projection'] != 'source':
                raise PipelineContractError('Source identity/clock cannot be synthesized')
    extras = set(actual_columns) - set(declared)
    if any(not actual_columns[name].get('nullable') for name in extras):
        raise PipelineContractError('New required source column needs contract review')
    clock = contract.get('update_clock')
    if contract['mode'] == 'incremental' and (not contract['primary_key'] or clock not in declared
            or declared[clock]['nullable'] or declared[clock]['data_type'] not in
            {'timestamp with time zone', 'timestamp without time zone'}):
        raise PipelineContractError('Incremental source needs a real non-null update clock and stable keys')
    for field in ('overlap_seconds', 'full_reconcile_seconds', 'expected_load_interval_seconds'):
        if type(contract.get(field)) is not int or contract[field] <= 0:
            raise PipelineContractError('Extraction interval must be governed')
    return {'schema_fingerprint': fingerprint({'columns': {name: actual_columns[name] for name in declared},
                                             'primary_key': actual_primary_keys}),
            'unreplicated_nullable_columns': sorted(extras)}


def source_projection(contract):
    """Explicit source fields or typed redaction constants; never SELECT *."""
    casts = {'character varying': 'text', 'text': 'text', 'integer': 'integer', 'bigint': 'bigint',
             'smallint': 'smallint', 'numeric': 'numeric', 'boolean': 'boolean',
             'timestamp with time zone': 'timestamptz', 'timestamp without time zone': 'timestamp',
             'date': 'date', 'jsonb': 'jsonb', 'json': 'json', 'uuid': 'uuid'}
    expressions, parameters = [], []
    for name, definition in contract['columns'].items():
        identifier = quote_identifier(name)
        if definition['projection'] == 'source':
            expressions.append(identifier)
        else:
            if definition['classification'] != 'restricted' or definition['data_type'] not in casts:
                raise PipelineContractError('Redacted source column has no safe typed projection')
            expressions.append('%s::' + casts[definition['data_type']] + ' AS ' + identifier)
            parameters.append(definition['placeholder'])
    return ', '.join(expressions), parameters


def advance_checkpoint(connection, dataset_id, *, cursor_time, cursor_keys, source_upper_bound,
                       schema_fingerprint, observed_rows, expected_generation, full_reconcile=False):
    """Fenced write in the caller's data transaction. NEVER commits on its own."""
    if (not _DATASET.fullmatch(dataset_id) or not _SHA.fullmatch(schema_fingerprint)
            or not isinstance(cursor_keys, list) or type(expected_generation) is not int or expected_generation < 0
            or type(observed_rows) is not int or observed_rows < 0):
        raise PipelineContractError('Invalid source checkpoint contract')
    keys = canonical_bytes(cursor_keys).decode()
    values = (cursor_time, keys, source_upper_bound, schema_fingerprint, observed_rows, full_reconcile)
    with connection.cursor() as cursor:
        if expected_generation == 0:
            cursor.execute('INSERT INTO analytics.ingestion_checkpoints '
                '(cursor_time,cursor_keys,source_upper_bound,schema_fingerprint,observed_rows,last_full_reconcile_at,'
                'dataset_id,generation,last_attempt_at,last_success_at) '
                'VALUES (%s,%s::jsonb,%s,%s,%s,CASE WHEN %s THEN clock_timestamp() END,%s,1,clock_timestamp(),clock_timestamp()) '
                'ON CONFLICT (dataset_id) DO UPDATE SET cursor_time=EXCLUDED.cursor_time,'
                'cursor_keys=EXCLUDED.cursor_keys,source_upper_bound=EXCLUDED.source_upper_bound,'
                'schema_fingerprint=EXCLUDED.schema_fingerprint,observed_rows=EXCLUDED.observed_rows,'
                'last_full_reconcile_at=COALESCE(EXCLUDED.last_full_reconcile_at,ingestion_checkpoints.last_full_reconcile_at),'
                'generation=1,last_attempt_at=clock_timestamp(),last_success_at=clock_timestamp(),'
                "completeness='unknown',certificate=NULL,error_code=NULL "
                'WHERE ingestion_checkpoints.generation=0 RETURNING generation', (*values, dataset_id))
        else:
            cursor.execute('UPDATE analytics.ingestion_checkpoints SET cursor_time=%s,cursor_keys=%s::jsonb,'
                'source_upper_bound=%s,schema_fingerprint=%s,observed_rows=%s,'
                'last_full_reconcile_at=CASE WHEN %s THEN clock_timestamp() ELSE last_full_reconcile_at END,'
                'generation=generation+1,last_attempt_at=clock_timestamp(),last_success_at=clock_timestamp(),'
                "completeness='unknown',certificate=NULL,error_code=NULL "
                'WHERE dataset_id=%s AND generation=%s RETURNING generation', (*values, dataset_id, expected_generation))
        result = cursor.fetchone()
    if not result:
        raise CheckpointConflict('Concurrent checkpoint changed; caller must roll back data writes')
    return result['generation'] if isinstance(result, dict) else result[0]
