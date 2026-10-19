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


def quality_rules(contract):
    """Contract-derived integrity rules; no guessed numerical or enum domains."""
    rules = [{'id': 'primary_key', 'kind': 'primary_key'}]
    for name, definition in contract['columns'].items():
        if not definition.get('nullable', True) and definition.get('projection', 'source') == 'source':
            rules.append({'id': 'required.' + name, 'kind': 'not_null', 'column': name})
    if contract.get('update_clock'):
        rules.append({'id': 'clock_bound', 'kind': 'clock_bound', 'column': contract['update_clock']})
    known = {rule['id'] for rule in rules}
    for rule in contract.get('quality_checks', []):
        if (rule.get('id') in known or rule.get('kind') not in {'numeric_range', 'enum', 'not_null'}
                or rule.get('column') not in contract['columns']):
            raise PipelineContractError('Invalid or duplicate quality rule')
        if rule['kind'] == 'enum' and (not isinstance(rule.get('values'), list) or not rule['values']):
            raise PipelineContractError('Enum check requires a governed finite vocabulary')
        if rule['kind'] == 'numeric_range' and not any(k in rule for k in ('minimum', 'maximum', 'exclusive_minimum')):
            raise PipelineContractError('Numeric check requires a governed bound')
        known.add(rule['id'])
        rules.append(deepcopy(rule))
    return rules


def _projection_value(value, definition):
    """Stable typed digest input, never a value exported in certificate evidence."""
    from decimal import Decimal
    from datetime import date
    import math
    if value is None:
        return ['null']
    kind = definition.get('data_type', '')
    if kind in {'json', 'jsonb'}:
        def normalized(item):
            if isinstance(item, dict):
                return ['object', [[key, normalized(item[key])] for key in sorted(item)]]
            if isinstance(item, list):
                return ['array', [normalized(value) for value in item]]
            if isinstance(item, (int, float, Decimal)) and not isinstance(item, bool):
                return _projection_value(item, {'data_type': 'numeric'})
            return ['scalar', item]
        try:
            parsed = json.loads(value, parse_float=Decimal, parse_int=Decimal,
                parse_constant=lambda _value: (_ for _ in ()).throw(ValueError())) if isinstance(value, str) else value
            return ['json', normalized(parsed)]
        except (ValueError, TypeError):
            raise PipelineContractError('Invalid JSON projection') from None
    if kind in {'numeric', 'decimal', 'money'}:
        number = Decimal(str(value))
        if not number.is_finite():
            raise PipelineContractError('Nonfinite numeric value cannot be certified')
        text = format(number, 'f')
        if '.' in text:
            text = text.rstrip('0').rstrip('.')
        return ['numeric', text if number else '0']
    if kind in {'real', 'double precision'}:
        number = float(value)
        if not math.isfinite(number):
            raise PipelineContractError('Nonfinite float value cannot be certified')
        return ['float', number.hex()]
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return ['local_datetime', value.isoformat(timespec='microseconds')]
        return ['instant', value.astimezone(timezone.utc).isoformat(timespec='microseconds')]
    if isinstance(value, date):
        return ['date', value.isoformat()]
    if isinstance(value, (bytes, bytearray, memoryview)):
        return ['bytes', bytes(value).hex()]
    if isinstance(value, (dict, list)):
        return ['json', canonical_bytes(value).decode()]
    if isinstance(value, bool):
        return ['boolean', value]
    if isinstance(value, int):
        return ['integer', str(value)]
    return ['text', str(value)]


class ProjectionEvidence:
    """One-pass ordered projection digests and bounded per-rule observations.

    Caller orders both source and target by the same stable primary-key text
    collation. Only the immediately previous key is retained to detect ties.
    Output contains no keys, values or rejected rows.
    """
    def __init__(self, contract, *, source_upper_bound=None, source_timezone="UTC"):
        self.contract = contract
        self.upper = source_upper_bound
        self.source_timezone = source_timezone
        if contract.get("update_clock") and source_upper_bound is None:
            raise PipelineContractError("Update-clock evidence requires a measured source upper bound")
        self.rules = quality_rules(contract)
        self.rows = 0
        self.key_hash = hashlib.sha256()
        self.content_hash = hashlib.sha256()
        self.previous_key = None
        self.counts = {rule['id']: 0 for rule in self.rules}

    def observe(self, row):
        from decimal import Decimal, InvalidOperation
        keys = self.contract['primary_key']
        key = canonical_bytes([_projection_value(row[name], self.contract['columns'][name]) for name in keys])
        payload = canonical_bytes([_projection_value(row[name], definition)
                                   for name, definition in self.contract['columns'].items()])
        for digest, raw in ((self.key_hash, key), (self.content_hash, payload)):
            digest.update(len(raw).to_bytes(8, 'big'))
            digest.update(raw)
        for rule in self.rules:
            kind = rule['kind']
            value = row.get(rule.get('column'))
            bad = False
            if kind == 'primary_key':
                bad = not keys or any(row.get(name) is None for name in keys) or key == self.previous_key
            elif kind == 'not_null':
                bad = value is None
            elif kind == 'clock_bound':
                from zoneinfo import ZoneInfo
                if isinstance(value, datetime):
                    instant = value if value.tzinfo else value.replace(tzinfo=ZoneInfo(self.source_timezone))
                    bad = instant > self.upper
                else:
                    bad = True
            elif kind == 'enum':
                bad = value is not None and value not in rule['values']
            elif kind == 'numeric_range':
                try:
                    number = Decimal(str(value))
                    bad = not number.is_finite()
                    bad |= 'minimum' in rule and number < Decimal(str(rule['minimum']))
                    bad |= 'maximum' in rule and number > Decimal(str(rule['maximum']))
                    bad |= 'exclusive_minimum' in rule and number <= Decimal(str(rule['exclusive_minimum']))
                except (InvalidOperation, TypeError, ValueError):
                    bad = True
            self.counts[rule['id']] += int(bad)
        self.previous_key = key
        self.rows += 1

    def summary(self):
        checks = [{'rule_id': rule['id'], 'kind': rule['kind'], 'column': rule.get('column'),
                   'checked': self.rows, 'violations': self.counts[rule['id']],
                   'status': 'failed' if self.counts[rule['id']] else 'passed' if self.rows else 'no_data'}
                  for rule in self.rules]
        return {'rows': self.rows, 'key_sha256': self.key_hash.hexdigest(),
                'content_sha256': self.content_hash.hexdigest(),
                'quality': {'status': 'failed' if any(self.counts.values()) else 'passed' if self.rows else 'empty_measured',
                            'checks': checks}}


def quality_manifest(contract):
    refs = []
    for reference in contract.get('reference_checks', []):
        quote_table(reference['reference_table'])
        for name in reference['columns'] + reference['reference_columns']:
            quote_identifier(name)
        if (not reference['columns'] or len(reference['columns']) != len(reference['reference_columns'])
                or any(name not in contract['columns'] for name in reference['columns'])):
            raise PipelineContractError('Invalid reference check contract')
        refs.append({'id': reference['id'], 'kind': 'reference', **reference})
    result = quality_rules(contract) + refs
    if len({rule['id'] for rule in result}) != len(result):
        raise PipelineContractError('Duplicate quality rule identity')
    return result


def _validate_quality(contract, observed):
    rows = observed['rows']
    definitions = {rule['id']: rule for rule in quality_manifest(contract)}
    checks = observed['quality']['checks']
    if (type(rows) is not int or rows < 0 or len(checks) != len(definitions)
            or {rule['rule_id'] for rule in checks} != set(definitions)):
        raise PipelineContractError('Required quality observation missing')
    for check in checks:
        checked, violations = check['checked'], check['violations']
        definition = definitions[check['rule_id']]
        expected_status = 'failed' if violations else 'passed' if checked else 'no_data'
        if (type(checked) is not int or type(violations) is not int
                or not 0 <= violations <= checked <= rows or check['status'] != expected_status
                or (definition['kind'] != 'reference' and checked != rows)):
            raise PipelineContractError('Quality observation count/status is inconsistent')
    status = 'failed' if any(check['violations'] for check in checks) else 'passed' if rows else 'empty_measured'
    if observed['quality']['status'] != status:
        raise PipelineContractError('Quality summary differs from its measured checks')


def attach_reference_evidence(contract, observed, measurements):
    value = deepcopy(observed)
    for definition in quality_manifest(contract):
        if definition['kind'] != 'reference':
            continue
        measurement = measurements.get(definition['id'])
        if not isinstance(measurement, dict):
            raise PipelineContractError('Reference integrity has not been measured')
        checked, violations = measurement.get('checked'), measurement.get('violations')
        if type(checked) is not int or type(violations) is not int or not 0 <= violations <= checked <= observed['rows']:
            raise PipelineContractError('Reference observation is outside its population')
        value['quality']['checks'].append({'rule_id': definition['id'], 'kind': 'reference',
            'checked': checked, 'violations': violations,
            'status': 'failed' if violations else 'passed' if checked else 'no_data'})
    value['quality']['status'] = ('failed' if any(c['violations'] for c in value['quality']['checks'])
                                  else 'passed' if value['rows'] else 'empty_measured')
    _validate_quality(contract, value)
    return value


def reference_observations(connection, contract, *, table=None, where_sql='', parameters=()):
    """Bounded counts; caller supplies an internally compiled period predicate."""
    result = {}
    for rule in quality_manifest(contract):
        if rule['kind'] != 'reference': continue
        present = ' AND '.join('r.'+quote_identifier(name)+' IS NOT NULL' for name in rule['columns'])
        links = ' AND '.join('p.'+quote_identifier(remote)+' = r.'+quote_identifier(local)
                             for local, remote in zip(rule['columns'], rule['reference_columns']))
        exists = 'EXISTS (SELECT 1 FROM '+quote_table(rule['reference_table'])+' p WHERE '+links+')'
        statement = ('SELECT COUNT(*) FILTER (WHERE '+present+') AS checked, '
                     'COUNT(*) FILTER (WHERE '+present+' AND NOT '+exists+') AS violations '
                     'FROM '+quote_table(table or contract['target_table'])+' r')
        if where_sql: statement += ' WHERE '+where_sql
        with connection.cursor() as cursor:
            cursor.execute(statement, parameters)
            row = cursor.fetchone()
        result[rule['id']] = dict(row) if isinstance(row, dict) else dict(zip(('checked','violations'),row))
    return result


def snapshot_certificate(contract, source, target, *, generation, schema_fingerprint,
                         source_upper_bound, snapshot_started_at, now=None):
    """Issue physical snapshot parity only; business-period closure is separate."""
    from datetime import timedelta
    now = now or datetime.now(timezone.utc)
    _validate_quality(contract, source)
    _validate_quality(contract, target)
    if (source != target or source.get('quality', {}).get('status') not in {'passed', 'empty_measured'}
            or not contract.get('primary_key') or type(generation) is not int or generation <= 0
            or not _SHA.fullmatch(schema_fingerprint)):
        raise PipelineContractError('Snapshot parity or required quality checks failed')
    for value in (now, source_upper_bound, snapshot_started_at):
        if not isinstance(value, datetime) or value.tzinfo is None:
            raise PipelineContractError('Snapshot proof requires explicit timezone')
    if snapshot_started_at > now or source_upper_bound > now + timedelta(seconds=2):
        raise PipelineContractError('Snapshot proof clock bounds are inconsistent')
    result = {'certificate_version': 1, 'kind': 'snapshot_parity', 'dataset_id': contract['dataset_id'],
        'contract_fingerprint': fingerprint(contract), 'generation': generation,
        'schema_fingerprint': schema_fingerprint, 'source_upper_bound': source_upper_bound.isoformat(),
        'snapshot_started_at': snapshot_started_at.isoformat(), 'snapshot_finished_at': now.isoformat(),
        'extraction_range': {'kind': 'full_snapshot'}, 'full_reconcile': True, 'delete_reconciled': True,
        'source': deepcopy(source), 'target': deepcopy(target), 'quality': deepcopy(target['quality']),
        'issued_at': now.isoformat(),
        'expires_at': (now+timedelta(seconds=contract.get('maximum_acceptable_load_lag_seconds', 900))).isoformat(),
        'closed_through': None, 'lateness_basis': 'not_certified', 'unresolved_failures': []}
    result['certificate_sha256'] = fingerprint(result)
    return result


def valid_certificate(value, contract, *, generation, schema_fingerprint, now=None):
    """Validate trusted-writer evidence; digest alone is not a client signature."""
    now = now or datetime.now(timezone.utc)
    try:
        proof = deepcopy(value)
        claimed = proof.pop('certificate_sha256')
        if (claimed != fingerprint(proof) or proof['certificate_version'] != 1
                or proof['kind'] not in {'snapshot_parity', 'closed_period'} or proof['dataset_id'] != contract['dataset_id']
                or proof['contract_fingerprint'] != fingerprint(contract)
                or proof['generation'] != generation or proof['schema_fingerprint'] != schema_fingerprint
                or proof['source'] != proof['target'] or not proof['full_reconcile'] or not proof['delete_reconciled']
                or proof['unresolved_failures']
                or proof['quality'] != proof['target']['quality']
                or proof['quality']['status'] not in {'passed', 'empty_measured'}
                or datetime.fromisoformat(proof['expires_at']) <= now
                or datetime.fromisoformat(proof['issued_at']) > now):
            raise ValueError()
        if proof['kind'] == 'snapshot_parity':
            if (proof['closed_through'] is not None or proof['lateness_basis'] != 'not_certified'
                    or proof['extraction_range'] != {'kind': 'full_snapshot'}):
                raise ValueError()
        else:
            period = next((p for p in contract.get('closed_periods', [])
                           if p.get('id') == proof['extraction_range'].get('period_id')), None)
            if (not period or not _valid_closure_attestation(period)
                    or proof.get('attestation_sha256') != fingerprint(period)
                    or proof['closed_through'] != period['end']
                    or proof['lateness_basis'] != 'admin_attested_closed_period'
                    or proof['extraction_range'] != _period_range(period)):
                raise ValueError()
        _validate_quality(contract, proof['source'])
        expected_rules = {rule['id'] for rule in quality_manifest(contract)}
        checks = proof['quality']['checks']
        if (len(checks) != len(expected_rules) or {rule['rule_id'] for rule in checks} != expected_rules
                or any(rule['violations'] != 0 for rule in checks)
                or type(proof['source']['rows']) is not int or proof['source']['rows'] < 0
                or any(not _SHA.fullmatch(proof['source'][name]) for name in ('key_sha256', 'content_sha256'))):
            raise ValueError()
        return True
    except (ValueError, KeyError, TypeError, AttributeError, OverflowError):
        raise PipelineContractError('Certificate missing, stale, incompatible or invalid') from None


def _valid_closure_attestation(period):
    from datetime import date
    try:
        return (period['attested_by'] == 'admin' and period['authority'] == 'user_confirmation_20261019'
                and period['must_revoke_before_mutation'] is True
                and date.fromisoformat(period['start']) <= date.fromisoformat(period['end'])
                and date.fromisoformat(period['end']) < date.fromisoformat(period['attested_on'])
                and period.get('enabled') is True)
    except (KeyError, ValueError, TypeError):
        return False


def _period_range(period):
    return {'kind': 'closed_period', 'period_id': period['id'], 'start': period['start'], 'end': period['end'],
            'clock': period['clock'], 'timezone': period['timezone']}


def closed_period_certificate(contract, source, target, *, period_id, **snapshot_arguments):
    period = next((p for p in contract.get('closed_periods', []) if p.get('id') == period_id), None)
    if not period or not _valid_closure_attestation(period):
        raise PipelineContractError('Closed period needs recorded business-owner attestation')
    certificate = snapshot_certificate(contract, source, target, **snapshot_arguments)
    certificate.update(kind='closed_period', extraction_range=_period_range(period),
                       closed_through=period['end'], lateness_basis='admin_attested_closed_period',
                       attestation_sha256=fingerprint(period))
    certificate.pop('certificate_sha256')
    certificate['certificate_sha256'] = fingerprint(certificate)
    return certificate


def closed_period_eligible(certificate, period_end, period_start=None):
    """Range check after DataHealth validated the trusted-writer certificate."""
    from datetime import date
    try:
        proof = certificate['extraction_range']
        end = period_end.date() if isinstance(period_end, datetime) else period_end
        start = period_start.date() if isinstance(period_start, datetime) else period_start
        if isinstance(end, str): end = date.fromisoformat(end)
        if isinstance(start, str): start = date.fromisoformat(start)
        return (certificate.get('kind') == 'closed_period'
                and certificate.get('lateness_basis') == 'admin_attested_closed_period'
                and date.fromisoformat(proof['start']) <= (start or end)
                and end <= date.fromisoformat(proof['end']))
    except (KeyError, ValueError, TypeError, AttributeError):
        return False


# Compatibility name for the initial snapshot-only proof consumers.
valid_snapshot_certificate = valid_certificate


def load_evidence(contract, target, *, generation, schema_fingerprint, snapshot=None,
                  closed_periods=(), previous=None, now=None):
    """Atomic checkpoint envelope: measured quality is not global completeness."""
    from statistics import median
    now = now or datetime.now(timezone.utc)
    _validate_quality(contract, target)
    if snapshot is not None:
        valid_certificate(snapshot, contract, generation=generation, schema_fingerprint=schema_fingerprint, now=now)
        if snapshot['kind'] != 'snapshot_parity' or snapshot['target'] != target:
            raise PipelineContractError('Snapshot does not describe this target projection')
    periods = list(closed_periods)
    for certificate in periods:
        valid_certificate(certificate, contract, generation=generation, schema_fingerprint=schema_fingerprint, now=now)
        if certificate['kind'] != 'closed_period':
            raise PipelineContractError('Period evidence must have a bounded attested range')
    contract_hash = fingerprint(contract)
    history = [row for row in (previous or {}).get('volume_history', [])
               if row.get('schema_fingerprint') == schema_fingerprint and row.get('contract_fingerprint') == contract_hash][-7:]
    volume = {'status': 'not_measured', 'baseline_samples': len(history), 'threshold': None,
              'reason': 'insufficient_comparable_reconciliations'}
    if len(history) >= 7:
        volume.update(status='observed', baseline_rows=median([row['rows'] for row in history]),
                      current_rows=target['rows'], reason='no_alert_threshold_configured')
    if snapshot is not None:
        history = (history+[{'generation': generation, 'rows': target['rows'], 'observed_at': now.isoformat(),
                            'schema_fingerprint': schema_fingerprint, 'contract_fingerprint': contract_hash}])[-7:]
    payload = {'evidence_version': 1, 'dataset_id': contract['dataset_id'], 'generation': generation,
        'contract_fingerprint': contract_hash, 'schema_fingerprint': schema_fingerprint,
        'observed_at': now.isoformat(), 'quality': deepcopy(target['quality']),
        'replica_rows': target['rows'], 'quality_basis': 'current_replica_projection',
        'snapshot': snapshot, 'closed_periods': periods,
        'completeness': 'complete' if snapshot else 'partial' if periods else 'unknown',
        'volume_history': history, 'volume': volume}
    payload['evidence_sha256'] = fingerprint(payload)
    if len(canonical_bytes(payload)) > 128000:
        raise PipelineContractError('Checkpoint evidence exceeds bounded capacity')
    return payload


def valid_load_evidence(payload, contract, *, generation, schema_fingerprint, now=None):
    now = now or datetime.now(timezone.utc)
    try:
        value = deepcopy(payload)
        digest = value.pop('evidence_sha256')
        if (digest != fingerprint(value) or value['evidence_version'] != 1
                or value['dataset_id'] != contract['dataset_id'] or value['generation'] != generation
                or value['schema_fingerprint'] != schema_fingerprint
                or value['contract_fingerprint'] != fingerprint(contract)):
            raise ValueError()
        from datetime import timedelta
        observed = datetime.fromisoformat(value['observed_at'])
        if (observed > now+timedelta(seconds=2)
                or (now-observed).total_seconds() > contract.get('maximum_acceptable_load_lag_seconds', 900)):
            raise ValueError()
        _validate_quality(contract, {'rows': value['replica_rows'], 'quality': value['quality']})
        certificates = ([value['snapshot']] if value['snapshot'] else []) + value['closed_periods']
        for certificate in certificates:
            valid_certificate(certificate, contract, generation=generation, schema_fingerprint=schema_fingerprint, now=now)
        snapshot = value['snapshot']
        if snapshot and (snapshot['kind'] != 'snapshot_parity'
                or snapshot['target']['rows'] != value['replica_rows']
                or snapshot['quality'] != value['quality']):
            raise ValueError()
        period_ids = [certificate['extraction_range'].get('period_id') for certificate in value['closed_periods']]
        if (any(certificate['kind'] != 'closed_period' for certificate in value['closed_periods'])
                or len(period_ids) != len(set(period_ids))):
            raise ValueError()
        expected = 'complete' if value['snapshot'] else 'partial' if value['closed_periods'] else 'unknown'
        if expected != value['completeness']:
            raise ValueError()
        return True
    except (ValueError, KeyError, TypeError, AttributeError):
        raise PipelineContractError('Invalid checkpoint evidence') from None


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
                       'last_success_at, last_full_reconcile_at, completeness, observed_rows, certificate FROM analytics.ingestion_checkpoints '
                       'WHERE dataset_id=%s', (dataset_id,))
        row = cursor.fetchone()
    if row is None:
        return {'cursor_time': None, 'cursor_keys': [], 'source_upper_bound': None, 'generation': 0,
                'schema_fingerprint': None, 'last_success_at': None, 'last_full_reconcile_at': None,
                'completeness': 'unknown', 'observed_rows': None, 'certificate': None}
    if isinstance(row, dict):
        return dict(row)
    return dict(zip(('cursor_time', 'cursor_keys', 'source_upper_bound', 'generation', 'schema_fingerprint',
                     'last_success_at', 'last_full_reconcile_at', 'completeness', 'observed_rows', 'certificate'), row))


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
            expressions.append(identifier+'::text AS '+identifier if definition['data_type'] in {'json','jsonb'} else identifier)
        else:
            if definition['classification'] != 'restricted' or definition['data_type'] not in casts:
                raise PipelineContractError('Redacted source column has no safe typed projection')
            expressions.append('%s::' + casts[definition['data_type']] + ' AS ' + identifier)
            parameters.append(definition['placeholder'])
    return ', '.join(expressions), parameters


def target_projection(contract):
    expressions = []
    for name, definition in contract['columns'].items():
        identifier = quote_identifier(name)
        expressions.append(identifier+'::text AS '+identifier if definition['data_type'] in {'json','jsonb'} else identifier)
    return ', '.join(expressions)


def period_predicate(contract, period, *, alias='r', target=False):
    from datetime import date, time, timedelta
    from zoneinfo import ZoneInfo
    if not _valid_closure_attestation(period):
        raise PipelineContractError('Closed period is not authorized')
    start = datetime.combine(date.fromisoformat(period['start']), time.min)
    end = datetime.combine(date.fromisoformat(period['end'])+timedelta(days=1), time.min)
    kind = period.get('clock_data_type', contract['columns'].get(period['clock'], {}).get('data_type'))
    if kind == 'timestamp with time zone':
        start, end = start.replace(tzinfo=ZoneInfo(period['timezone'])), end.replace(tzinfo=ZoneInfo(period['timezone']))
    elif kind != 'timestamp without time zone':
        raise PipelineContractError('Closed period needs its physical clock type')
    if period.get('parent_table'):
        parent = period.get('target_parent_table', period['parent_table']) if target else period['parent_table']
        clock = 'period_parent.' + quote_identifier(period['clock'])
        sql = ('EXISTS (SELECT 1 FROM '+quote_table(parent)+' period_parent WHERE '
               'period_parent.'+quote_identifier(period['parent_key'])+' = '+quote_identifier(alias)+'.'+quote_identifier(period['local_key'])
               +' AND '+clock+' >= %s AND '+clock+' < %s)')
    else:
        if period['clock'] not in contract['columns']:
            raise PipelineContractError('Closed period clock is outside source projection')
        clock = quote_identifier(alias)+'.'+quote_identifier(period['clock'])
        sql = clock+' >= %s AND '+clock+' < %s'
    return sql, [start, end]


def extraction_order(contracts):
    """Load referenced snapshots first; no scheduler or second pipeline owner."""
    graph = {name: {rule['reference_table'] for rule in contract.get('reference_checks', [])
                    if rule['reference_table'] in contracts and rule['reference_table'] != name}
             for name, contract in contracts.items()}
    ordered = []
    while graph:
        ready = sorted(name for name, dependencies in graph.items() if not dependencies)
        if not ready:
            raise PipelineContractError('Source reference contracts contain a dependency cycle')
        ordered.extend(ready)
        graph = {name: dependencies-set(ready) for name, dependencies in graph.items() if name not in ready}
    return ordered


def advance_checkpoint(connection, dataset_id, *, cursor_time, cursor_keys, source_upper_bound,
                       schema_fingerprint, observed_rows, expected_generation, full_reconcile=False,
                       evidence=None, contract=None, now=None):
    """Fenced data/checkpoint/evidence mutation; caller owns the transaction."""
    if (not _DATASET.fullmatch(dataset_id) or not _SHA.fullmatch(schema_fingerprint)
            or not isinstance(cursor_keys, list) or type(expected_generation) is not int or expected_generation < 0
            or type(observed_rows) is not int or observed_rows < 0):
        raise PipelineContractError('Invalid source checkpoint contract')
    completeness, encoded = 'unknown', None
    if evidence is not None:
        if contract is None or contract['dataset_id'] != dataset_id:
            raise PipelineContractError('Evidence requires its exact source contract')
        valid_load_evidence(evidence, contract, generation=expected_generation+1,
                            schema_fingerprint=schema_fingerprint, now=now)
        completeness = evidence['completeness']
        encoded = canonical_bytes(evidence).decode()
    keys = canonical_bytes(cursor_keys).decode()
    values = (cursor_time, keys, source_upper_bound, schema_fingerprint, observed_rows, full_reconcile,
              completeness, encoded)
    with connection.cursor() as cursor:
        if expected_generation == 0:
            cursor.execute('INSERT INTO analytics.ingestion_checkpoints '
                '(cursor_time,cursor_keys,source_upper_bound,schema_fingerprint,observed_rows,last_full_reconcile_at,'
                'completeness,certificate,dataset_id,generation,last_attempt_at,last_success_at) '
                'VALUES (%s,%s::jsonb,%s,%s,%s,CASE WHEN %s THEN clock_timestamp() END,%s,%s::jsonb,%s,1,clock_timestamp(),clock_timestamp()) '
                'ON CONFLICT (dataset_id) DO UPDATE SET cursor_time=EXCLUDED.cursor_time,'
                'cursor_keys=EXCLUDED.cursor_keys,source_upper_bound=EXCLUDED.source_upper_bound,'
                'schema_fingerprint=EXCLUDED.schema_fingerprint,observed_rows=EXCLUDED.observed_rows,'
                'last_full_reconcile_at=COALESCE(EXCLUDED.last_full_reconcile_at,ingestion_checkpoints.last_full_reconcile_at),'
                'generation=1,last_attempt_at=clock_timestamp(),last_success_at=clock_timestamp(),'
                'completeness=EXCLUDED.completeness,certificate=EXCLUDED.certificate,error_code=NULL '
                'WHERE ingestion_checkpoints.generation=0 RETURNING generation', (*values, dataset_id))
        else:
            cursor.execute('UPDATE analytics.ingestion_checkpoints SET cursor_time=%s,cursor_keys=%s::jsonb,'
                'source_upper_bound=%s,schema_fingerprint=%s,observed_rows=%s,'
                'last_full_reconcile_at=CASE WHEN %s THEN clock_timestamp() ELSE last_full_reconcile_at END,'
                'generation=generation+1,last_attempt_at=clock_timestamp(),last_success_at=clock_timestamp(),'
                'completeness=%s,certificate=%s::jsonb,error_code=NULL '
                'WHERE dataset_id=%s AND generation=%s RETURNING generation', (*values, dataset_id, expected_generation))
        result = cursor.fetchone()
    if not result:
        raise CheckpointConflict('Concurrent checkpoint changed; caller must roll back data writes')
    return result['generation'] if isinstance(result, dict) else result[0]
