"""Offline regression: one module per process, durable logs and manifest.

Run in an isolated container/snapshot (not the serving API). No provider credentials or network needed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',required=True)
    parser.add_argument('--modules',nargs='*')
    parser.add_argument('--module-timeout',type=int,default=300,
                        help='Wall-clock timeout per offline module; use a larger value under an explicit CPU quota.')
    args=parser.parse_args()
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    modules=args.modules or ['tests.'+p.stem for p in sorted(Path('tests').glob('test_*.py'))]
    config={k:v for k,v in os.environ.items() if k not in {
        'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN','DATA_ANALYST_ENABLE_CONTRACT_REPAIR','DATA_ANALYST_GEMINI_SECONDARY_KEY'}}
    config.update(AI_OFFLINE='1',DATA_ANALYST_ENV='development',DATA_ANALYST_ALLOW_BROWSER_OWNER='1',
                  DATA_ANALYST_SESSION_STORE='memory',DATA_ANALYST_ARTIFACT_STORE='memory',PYTHONDONTWRITEBYTECODE='1')
    files={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['services','routers','tests','metadata','evals','tools']
           for p in sorted(Path(folder).rglob('*')) if p.is_file() and p.suffix in {'.py','.json'} and '__pycache__' not in p.parts}
    manifest=dict(started_at=time.time(),source_hashes=files,module_timeout=args.module_timeout,modules=[])
    code="""import json,sys,unittest
from tools.run_tests_v29 import IsolatedResult
result=unittest.TextTestRunner(verbosity=1,resultclass=IsolatedResult).run(unittest.defaultTestLoader.loadTestsFromName(sys.argv[1]))
print('RESULT_JSON '+json.dumps(dict(tests=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped))))
raise SystemExit(not result.wasSuccessful())
"""
    for module in modules:
        started=time.perf_counter()
        try:
            result=subprocess.run([sys.executable,'-c',code,module],env=config,capture_output=True,text=True,timeout=args.module_timeout)
            log=result.stdout+result.stderr;returncode=result.returncode
        except subprocess.TimeoutExpired as exc:
            log=str(exc.stdout or '')+str(exc.stderr or '')+'\nTIMEOUT';returncode=124
        (out/(module+'.log')).write_text(log)
        summary=next((json.loads(line.removeprefix('RESULT_JSON ')) for line in log.splitlines() if line.startswith('RESULT_JSON ')),{})
        record=dict(module=module,returncode=returncode,seconds=round(time.perf_counter()-started,2),**summary)
        manifest['modules'].append(record)
        (out/'manifest.json').write_text(json.dumps(manifest,indent=2))
        print(module,returncode,summary,flush=True)
    manifest['finished_at']=time.time()
    manifest['passed']=all(r['returncode']==0 for r in manifest['modules'])
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2))
    return not manifest['passed']


if __name__=='__main__':
    raise SystemExit(main())
