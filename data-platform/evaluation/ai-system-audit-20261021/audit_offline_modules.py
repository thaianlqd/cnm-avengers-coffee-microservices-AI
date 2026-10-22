"""Run every backend module in a fresh process with the official isolation.

Used after monolithic runs exited 137. Does not claim cross-module process
qualification. Intended for a separate, network-disabled test container.
"""
import json
import argparse
import os
from pathlib import Path
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--tests', nargs='+', help='Explicit modules or test method IDs; default every module')
args = parser.parse_args()
modules = args.tests or sorted('tests.' + p.stem for p in Path('/app/tests').glob('test_*.py'))
output = Path('/receipts')
output.mkdir(exist_ok=True)
records = []
child = '''
import os,unittest,sys,json
from unittest.mock import patch
from tools.run_tests_v29 import IsolatedResult
config={k:v for k,v in os.environ.items() if k not in {'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN','DATA_ANALYST_ENABLE_CONTRACT_REPAIR','DATA_ANALYST_GEMINI_SECONDARY_KEY'}}
config.update(AI_OFFLINE='1',DATA_ANALYST_ENV='development',DATA_ANALYST_ALLOW_BROWSER_OWNER='1',DATA_ANALYST_SESSION_STORE='memory',DATA_ANALYST_ARTIFACT_STORE='memory')
with patch.dict(os.environ,config,clear=True):
 suite=unittest.defaultTestLoader.loadTestsFromName(sys.argv[1])
 result=unittest.TextTestRunner(verbosity=1,resultclass=IsolatedResult).run(suite)
 print('AUDIT_RESULT '+json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'failed_ids':[t.id() for t,_ in result.failures],'error_ids':[t.id() for t,_ in result.errors]}),flush=True)
raise SystemExit(not result.wasSuccessful())
'''
for module in modules:
    started = time.monotonic()
    record = {'module': module}
    log = output / (module + '.log')
    with log.open('w') as stream:
        try:
            done = subprocess.run([sys.executable, '-c', child, module], stdout=stream, stderr=subprocess.STDOUT, timeout=240)
            record['returncode'] = done.returncode
        except subprocess.TimeoutExpired:
            record['returncode'] = 'timeout_240s'
    for line in log.read_text(errors='replace').splitlines():
        if line.startswith('AUDIT_RESULT '):
            record.update(json.loads(line.removeprefix('AUDIT_RESULT ')))
    record['seconds'] = round(time.monotonic() - started, 3)
    records.append(record)
    (output / 'modules.json').write_text(json.dumps(records, indent=2))
    print(json.dumps(record), flush=True)
raise SystemExit(any(r['returncode'] != 0 for r in records))
