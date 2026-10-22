"""Host runner: fresh offline Docker process per module, durable receipts."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / 'data-platform/analytics-api'
CHILD = '''
import json, sys, unittest
from tools.run_tests_v29 import IsolatedResult
class DurableResult(IsolatedResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.passed_ids = []
    def addSuccess(self, test):
        super().addSuccess(test)
        self.passed_ids.append(test.id())
suite = unittest.defaultTestLoader.loadTestsFromName(sys.argv[1])
result = unittest.TextTestRunner(verbosity=1, resultclass=DurableResult).run(suite)
print('AUDIT_RESULT '+json.dumps(dict(tests=result.testsRun,
 failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
 failed_ids=[t.id() for t,_ in result.failures], error_ids=[t.id() for t,_ in result.errors], passed_ids=result.passed_ids)), flush=True)
raise SystemExit(not result.wasSuccessful())
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--container', default='avengers_reliability_offline_codex')
    parser.add_argument('--out', default='codex-regression-isolated-20261021')
    parser.add_argument('--tests', nargs='+', help='Explicit module IDs for documented rechecks')
    args = parser.parse_args()
    OUT = Path(__file__).parent / args.out
    OUT.mkdir(exist_ok=True)
    runtime = subprocess.run(['docker', 'inspect', args.container, '--format',
        '{"image":"{{.Image}}","memory_bytes":{{.HostConfig.Memory}},"nano_cpus":{{.HostConfig.NanoCpus}},"network":"{{.HostConfig.NetworkMode}}"}'],
        capture_output=True, text=True, check=True)
    (OUT / 'environment.json').write_text(runtime.stdout)
    if json.loads(runtime.stdout)['network'] == 'none':
        # The writable evaluation tmpfs hides source fixtures. Seed only the
        # four captured test inputs; generated receipts remain in the tmpfs.
        for path in (API / 'evaluation').glob('one_click_captured_*.json'):
            subprocess.run(['docker', 'exec', '-i', args.container, 'python', '-c',
                'import pathlib,sys; pathlib.Path(sys.argv[1]).write_bytes(sys.stdin.buffer.read())',
                '/app/evaluation/' + path.name], input=path.read_bytes(), check=True)
    hashes = {str(p.relative_to(API)): hashlib.sha256(p.read_bytes()).hexdigest()
              for folder in ('services', 'tests', 'metadata', 'evals')
              for p in (API / folder).rglob('*') if p.is_file() and p.suffix in ('.py', '.json')}
    (OUT / 'source-start.json').write_text(json.dumps(hashes, indent=2))
    records = []
    modules = args.tests or ['tests.' + p.stem for p in sorted((API / 'tests').glob('test_*.py'))]
    for module in modules:
        start = time.monotonic()
        log = OUT / (module + '.log')
        command = ['docker', 'exec', args.container, 'env',
                   '-u', 'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN',
                   '-u', 'DATA_ANALYST_ENABLE_CONTRACT_REPAIR',
                   '-u', 'DATA_ANALYST_GEMINI_SECONDARY_KEY',
                   'AI_OFFLINE=1', 'DATA_ANALYST_ENV=development',
                   'DATA_ANALYST_ALLOW_BROWSER_OWNER=1',
                   'DATA_ANALYST_SESSION_STORE=memory', 'DATA_ANALYST_ARTIFACT_STORE=memory',
                   'python', '-c', CHILD, module]
        with log.open('w') as stream:
            try:
                done = subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, timeout=900)
                code = done.returncode
            except subprocess.TimeoutExpired:
                # Stop qualification instead of overlapping with an orphaned test.
                raise SystemExit('Module exceeded 900s; inspect Docker process before resuming: '+module)
        record = dict(module=module, returncode=code, seconds=round(time.monotonic()-start, 3))
        for line in log.read_text().splitlines():
            # unittest progress on stderr can share a line with stdout.
            if 'AUDIT_RESULT ' in line:
                record.update(json.loads(line.split('AUDIT_RESULT ', 1)[1]))
        records.append(record)
        (OUT / 'modules.json').write_text(json.dumps(records, indent=2))
        print(json.dumps(record), flush=True)
    changed = [name for name, digest in hashes.items()
               if hashlib.sha256((API / name).read_bytes()).hexdigest() != digest]
    (OUT / 'source-drift.json').write_text(json.dumps(changed, indent=2))
    raise SystemExit(bool(changed) or any(r['returncode'] for r in records))


if __name__ == '__main__':
    main()
