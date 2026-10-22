"""Finalize frozen product run plus the documented legacy-test correction."""
import json,hashlib,shutil
from pathlib import Path
E=Path(__file__).resolve().parent;ROOT=E.parents[2];F=E/'codex-regression-policy33-final'
TEST='data-platform/analytics-api/tests/test_agent_v23.py'
frozen=json.loads((E/'codex-source-policy33-final.json').read_text())
changed=[name for name,value in frozen['files'].items() if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=value]
if changed!=[TEST]:raise SystemExit('Unexpected product/test source delta: '+str(changed))
records=json.loads((F/'modules.json').read_text());recheck=json.loads((F/'rechecks2/modules.json').read_text())
if json.loads((F/'source-drift.json').read_text()) or json.loads((F/'rechecks2/source-drift.json').read_text()):
    raise SystemExit('Source changed within a regression/recheck run')
by_module={r['module']:r for r in records};by_module.update({r['module']:r for r in recheck})
passed=all(r['returncode']==0 for r in by_module.values())
if (F/'effective-final.json').exists():shutil.copy2(F/'effective-final.json',F/'effective-before-fixture-correction.json')
correction=dict(path=TEST,before_sha256=frozen['files'][TEST],after_sha256=hashlib.sha256((ROOT/TEST).read_bytes()).hexdigest(),
    reason='Replace cosmetic non-repetition with actual scoped-evidence equality plus accepted canonical claim and rejected unsupported causal claim through production grounded_narrative. Legacy archived graph reports intentionally lack modern saved-report verifier metadata.',
    attempts=['original full run:cosmetic assertion failure','rechecks:first fixture mistakenly used modern saved-report verifier; StopIteration retained','rechecks2:legacy-compatible production narrative kernel positive/negative controls'])
result=dict(passed=passed,modules=len(by_module),expected_modules=107,unique_tests=sum(r['tests'] for r in by_module.values()),
    effective_failures=sum(r['failures'] for r in by_module.values()),effective_errors=sum(r['errors'] for r in by_module.values()),
    initial_full_run_failures=[i for r in records for i in r.get('failed_ids',[])+r.get('error_ids',[])],
    rechecked_modules=[r['module'] for r in recheck],rechecks_directory='rechecks2',test_only_correction=correction,
    product_source_drift=[],limits='Full107module/1704test product-source-frozen run had one obsolete assertion; entire24test module rechecked after strengthening that test. Original failures retained; no production source change after freeze. Not monolithic.')
(F/'effective-final.json').write_text(json.dumps(result,indent=2));(F/'test-only-correction-final.json').write_text(json.dumps(correction,indent=2))
updated={**frozen,'files':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in frozen['files']},'test_only_delta':correction}
if (E/'codex-source-policy33-final-tests-updated.json').exists():shutil.copy2(E/'codex-source-policy33-final-tests-updated.json',E/'codex-source-policy33-first-test-correction.json')
(E/'codex-source-policy33-final-tests-updated.json').write_text(json.dumps(updated,indent=2))
print(json.dumps(result,indent=2));raise SystemExit(not passed)
