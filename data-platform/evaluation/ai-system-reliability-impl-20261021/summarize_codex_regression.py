"""Compare fresh module receipts with immutable audit failures, never hide new IDs."""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def read_records(folder):
    path = folder / 'modules.json'
    records = json.loads(path.read_text()) if path.exists() else []
    for record in records:
        for line in (folder / (record['module'] + '.log')).read_text(errors='replace').splitlines():
            if 'AUDIT_RESULT ' in line:
                record.update(json.loads(line.split('AUDIT_RESULT ', 1)[1]))
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='codex-regression-isolated-20261021')
    args = parser.parse_args()
    current = HERE / args.out
    original = read_records(current)
    rechecks = read_records(current / 'rechecks')
    by_module = {r['module']: r for r in original}
    by_module.update({r['module']: {**r, 'evidence_subdirectory': 'rechecks'} for r in rechecks})
    records = list(by_module.values())
    (current / 'modules-parsed.json').write_text(json.dumps(records, indent=2) + '\n')
    baseline = set()
    for path in (HERE.parent / 'ai-system-audit-20261021/offline-modules').glob('*.log'):
        for line in path.read_text(errors='replace').splitlines():
            if 'AUDIT_RESULT ' in line:
                result = json.loads(line.split('AUDIT_RESULT ', 1)[1])
                baseline.update(result['failed_ids'] + result['error_ids'])
    issues = {identity for r in records for identity in r.get('failed_ids', []) + r.get('error_ids', [])}
    original_issues = {identity for r in original for identity in r.get('failed_ids', []) + r.get('error_ids', [])}
    expected = len(list((HERE.parents[1] / 'analytics-api/tests').glob('test_*.py')))
    incomplete = [r['module'] for r in records if 'tests' not in r]
    drift_path = current / 'source-drift.json'
    drift = json.loads(drift_path.read_text()) if drift_path.exists() else None
    recheck_drift = current / 'rechecks/source-drift.json'
    recheck_complete = not rechecks or (recheck_drift.exists() and json.loads(recheck_drift.read_text()) == []
        and json.loads((current / 'rechecks/source-start.json').read_text()) == json.loads((current / 'source-start.json').read_text()))
    summary = dict(
        modules_finished=len(records), modules_expected=expected,
        tests=sum(r.get('tests', 0) for r in records),
        failures=sum(r.get('failures', 0) for r in records),
        errors=sum(r.get('errors', 0) for r in records),
        new_failure_ids=sorted(issues - baseline),
        initial_new_failure_ids=sorted(original_issues - baseline),
        rechecked_modules=[r['module'] for r in rechecks],
        existing_failure_ids=sorted(issues & baseline),
        baseline_ids_passed_in_current_modules=sorted(
            i for i in baseline - issues if any(i.startswith(r['module'] + '.') for r in records)),
        incomplete_modules=incomplete, source_drift=drift,
        qualification='IN_PROGRESS' if len(records) != expected or drift is None or not recheck_complete else
        'NOT_QUALIFIED' if issues - baseline or incomplete or drift else
        'NO_NEW_REGRESSION_WITH_DOCUMENTED_BASELINE_FAILURES',
        isolation='Fresh process per module; monolithic suite not qualified.',
    )
    (current / 'comparison.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
