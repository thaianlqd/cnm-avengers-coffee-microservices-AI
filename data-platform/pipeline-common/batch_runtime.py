"""Explicit-run, bounded batch publication utilities for the existing jobs."""
from datetime import datetime, timezone
import io
import resource

from pipeline_runtime import (PipelineContractError, canonical_bytes, fingerprint, start_run, finalize_run,
    put_verified_artifact, publish_manifest, read_manifest, read_verified_artifact)

MAX_ROWS = 200_000
MAX_FRAME_BYTES = 256_000_000


class DataQualityFailure(PipelineContractError):
    def __init__(self, dataset, checks):
        self.dataset, self.checks = dataset, checks
        super().__init__('Required dataset quality checks failed: '+dataset)


def checked_frame(frame, name, *, keys=(), numeric=(), dates=(), reference=None):
    """Required invalid values block; they never silently become zero."""
    import pandas as pd
    frame = frame.copy()
    bound_frame(frame)
    required = set(keys) | set(numeric) | set(dates)
    missing = required-set(frame.columns)
    if missing:
        raise DataQualityFailure(name, {'missing_columns': len(missing)})
    checks = {}
    for key in keys:
        checks['null_key.'+key] = int(frame[key].isna().sum())
    if keys:
        checks['duplicate_keys'] = int(frame.duplicated(list(keys), keep=False).sum())
    for column, minimum in numeric.items() if isinstance(numeric, dict) else ():
        values = pd.to_numeric(frame[column], errors='coerce')
        invalid = values.isna() | ~values.map(lambda value: __import__('math').isfinite(value))
        if minimum is not None: invalid |= values < minimum
        checks['invalid_numeric.'+column] = int(invalid.sum())
        frame[column] = values
    for column in dates:
        values = pd.to_datetime(frame[column], errors='coerce', utc=True)
        checks['invalid_date.'+column] = int(values.isna().sum())
        frame[column] = values
    if reference is not None:
        column, values = reference
        checks['orphan_reference.'+column] = int((frame[column].isna() | ~frame[column].isin(values)).sum())
    if any(checks.values()):
        raise DataQualityFailure(name, checks)
    return frame, {'status': 'no_data' if frame.empty else 'passed', 'rows': len(frame),
                   'rejects': 0, 'rejected_fraction': 0.0, 'checks': checks,
                   'schema_fingerprint': fingerprint({str(c): str(t) for c, t in frame.dtypes.items()})}


def bound_frame(frame):
    if len(frame) > MAX_ROWS or int(frame.memory_usage(index=True, deep=True).sum()) > MAX_FRAME_BYTES:
        raise PipelineContractError('Dataset exceeds the bounded local batch capacity')


def bounded_read_sql(query, connection, *, chunksize=5000):
    import pandas as pd
    import sqlalchemy
    parts, rows, size = [], 0, 0
    for part in pd.read_sql(sqlalchemy.text(query), connection, chunksize=chunksize):
        rows += len(part)
        size += int(part.memory_usage(index=True, deep=True).sum())
        if rows > MAX_ROWS or size > MAX_FRAME_BYTES:
            raise PipelineContractError('Source exceeds the bounded local batch capacity')
        parts.append(part)
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()


def frame_bytes(frame):
    bound_frame(frame)
    buffer = io.BytesIO()
    frame.to_parquet(buffer, index=False, engine='pyarrow')
    return buffer.getvalue()


def read_frame(s3, bucket, manifest, name):
    import pandas as pd
    output = manifest['outputs'][name]
    if output['rows'] > MAX_ROWS:
        raise PipelineContractError('Input manifest exceeds batch row capacity')
    body = read_verified_artifact(s3, bucket, manifest, name)
    # Validate the Parquet footer before materializing a compressed bomb.
    import pyarrow.parquet as parquet
    metadata = parquet.ParquetFile(io.BytesIO(body)).metadata
    if metadata.num_rows != output['rows'] or metadata.num_rows > MAX_ROWS or sum(
            metadata.row_group(i).total_byte_size for i in range(metadata.num_row_groups)) > MAX_FRAME_BYTES:
        raise PipelineContractError('Parquet footer differs from bounded manifest')
    result = pd.read_parquet(io.BytesIO(body), engine='pyarrow')
    bound_frame(result)
    return result


def parse_as_of(value):
    if isinstance(value, datetime): result = value
    elif isinstance(value, str): result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    else: raise PipelineContractError('Explicit aware run as_of is required')
    if result.tzinfo is None:
        raise PipelineContractError('Run as_of requires an explicit timezone')
    return result.astimezone(timezone.utc)


def existing_run(s3, bucket, run_id, as_of, contract):
    # Validate identities before constructing an object key or reading a source.
    start_run('batch.identity', fingerprint(contract), {'identity': 'explicit'}, run_id=run_id)
    expected = parse_as_of(as_of).isoformat()
    try:
        result = read_manifest(s3, bucket, run_id, fingerprint(contract))
    except Exception as error:
        if getattr(error, 'response', {}).get('Error', {}).get('Code') in {'NoSuchKey', '404'}: return None
        raise
    if result.get('requested_as_of') != expected:
        raise PipelineContractError('Run identity was already used for another as_of')
    return result


class LayerRun:
    def __init__(self, s3, bucket, dataset, run_id, as_of, contract, source_runs):
        self.s3, self.bucket, self.contract = s3, bucket, contract
        self.as_of = parse_as_of(as_of)
        self.manifest = start_run(dataset, fingerprint(contract), source_runs, run_id=run_id, now=self.as_of)
        self.manifest.update(requested_as_of=self.as_of.isoformat(),
            snapshot_semantics='Observed current inputs; requested_as_of is not database time travel',
            source_completeness='unknown')
        self.outputs = {}

    def existing(self):
        try:
            result = read_manifest(self.s3, self.bucket, self.manifest['run_id'], self.manifest['contract_fingerprint'])
        except Exception as error:
            if getattr(error, 'response', {}).get('Error', {}).get('Code') in {'NoSuchKey', '404'}: return None
            raise
        if result.get('requested_as_of') != self.manifest['requested_as_of']:
            raise PipelineContractError('Run identity was already used for another as_of')
        return result

    def frame(self, name, frame, quality):
        self.outputs[name] = {**put_verified_artifact(self.s3, self.bucket, self.manifest, name,
            frame_bytes(frame), rows=len(frame), quality_status=quality['status']), 'quality': quality}

    def json(self, name, data):
        rows = len(data) if isinstance(data, list) else 1
        self.outputs[name] = put_verified_artifact(self.s3, self.bucket, self.manifest, name,
            canonical_bytes(data), rows=rows, quality_status='no_data' if rows == 0 else 'passed', suffix='json')

    def finish(self, *, optional=(), errors=()):
        result = finalize_run(self.manifest, self.outputs, self.contract['required_outputs'])
        missing = sorted(set(optional)-set(self.outputs))
        result.update(optional_missing=missing, publication_quality='partial' if missing or errors else 'passed',
                      error_classes=sorted(set(errors)), peak_rss_kib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        result.pop('manifest_fingerprint')
        result['manifest_fingerprint'] = fingerprint(result)
        publish_manifest(self.s3, self.bucket, result)
        return result


def run_arguments(description):
    import argparse
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--as-of', required=True)
    parser.add_argument('--input-run')
    return vars(parser.parse_args())


def publish_gold_database(connection, s3, bucket, manifest, *, pipeline='daily_medallion'):
    """Versioned data and active pointer commit in one DB transaction.

    The object manifest is already committed independently. A DB failure leaves
    the prior DB pointer intact; retry reads those exact immutable artifacts.
    This never replaces canonical Silver views or current Gold tables.
    """
    import json
    from pipeline_runtime import verify_manifest
    verify_manifest(manifest)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout='30s'")
            cursor.execute("SET LOCAL lock_timeout='3s'")
            for name, output in manifest['outputs'].items():
                body = read_verified_artifact(s3, bucket, manifest, name)
                payload = json.loads(body)
                cursor.execute('INSERT INTO analytics.gold_dataset_versions '
                    '(pipeline,run_id,dataset_id,content_hash,row_count,payload) VALUES (%s,%s,%s,%s,%s,%s::jsonb) '
                    'ON CONFLICT DO NOTHING', (pipeline, manifest['run_id'], name, output['content_hash'],
                                              output['rows'], canonical_bytes(payload).decode()))
                cursor.execute('SELECT content_hash FROM analytics.gold_dataset_versions '
                    'WHERE pipeline=%s AND run_id=%s AND dataset_id=%s', (pipeline, manifest['run_id'], name))
                if cursor.fetchone()[0] != output['content_hash']:
                    raise PipelineContractError('Existing database generation differs from committed object run')
            cursor.execute('INSERT INTO analytics.pipeline_runs '
                '(run_id,dataset_id,pipeline,status,contract_fingerprint,manifest_fingerprint,started_at,finished_at,manifest) '
                "VALUES (%s,%s,%s,'committed',%s,%s,%s,%s,%s::jsonb) ON CONFLICT (run_id) DO NOTHING",
                (manifest['run_id'], manifest['dataset_id'], pipeline, manifest['contract_fingerprint'],
                 manifest['manifest_fingerprint'], manifest['started_at'], manifest['finished_at'], canonical_bytes(manifest).decode()))
            cursor.execute('SELECT manifest_fingerprint FROM analytics.pipeline_runs WHERE run_id=%s', (manifest['run_id'],))
            if cursor.fetchone()[0] != manifest['manifest_fingerprint']:
                raise PipelineContractError('Database run identity was already used by another publication')
            cursor.execute('INSERT INTO analytics.pipeline_publications '
                '(pipeline,run_id,manifest_fingerprint,requested_as_of) VALUES (%s,%s,%s,%s) '
                'ON CONFLICT (pipeline) DO UPDATE SET run_id=EXCLUDED.run_id,manifest_fingerprint=EXCLUDED.manifest_fingerprint,'
                'requested_as_of=EXCLUDED.requested_as_of,published_at=clock_timestamp() '
                'WHERE pipeline_publications.requested_as_of < EXCLUDED.requested_as_of '
                'OR pipeline_publications.run_id=EXCLUDED.run_id RETURNING run_id',
                (pipeline,manifest['run_id'],manifest['manifest_fingerprint'],manifest['requested_as_of']))
            if cursor.fetchone() is None:
                raise PipelineContractError('A newer database publication is already active')
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    return {'database': 'committed', 'object_manifest': manifest['manifest_fingerprint'], 'run_id': manifest['run_id']}


def verify_publication(s3, bucket, run_id, expected_hash, contract, connection=None):
    manifest = read_manifest(s3, bucket, run_id, fingerprint(contract))
    if manifest['manifest_fingerprint'] != expected_hash:
        raise PipelineContractError('Health check must match the expected run hash')
    for name in manifest['outputs']:
        read_verified_artifact(s3, bucket, manifest, name)
    if connection is not None:
        with connection.cursor() as cursor:
            cursor.execute('SELECT run_id,manifest_fingerprint FROM analytics.pipeline_publications '
                           "WHERE pipeline='daily_medallion'")
            row = cursor.fetchone()
        if row != (run_id, expected_hash):
            raise PipelineContractError('Database publication does not match the expected object generation')
    return {'status': manifest.get('publication_quality', 'unknown'), 'run_id': run_id,
            'manifest_fingerprint': expected_hash, 'optional_missing': manifest.get('optional_missing', []),
            'source_completeness': manifest.get('source_completeness', 'unknown')}
