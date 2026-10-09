"""Small acceptance summary; never implies live semantic/model accuracy."""
import argparse
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch
from evals.golden_v28 import load_cases
from evals.run_eval_v28 import run_case
from tests.test_capacity_v29 import CapacityTests, SCENARIOS


STAGES = ['semantic_retrieval','semantic_interpretation','semantic_coverage','resolver',
          'capacity_planning','dry_run','sql_execution','result_validation','artifact','presentation']


def rates(cases, rows):
    supported = [r for c,r in zip(cases,rows) if c['expected']=='proposal_ready']
    successful = [r for r in supported if r['passed'] and r['status']=='proposal_ready' and r['provider_calls']<=3]
    fraction = lambda n,d: dict(status='measured' if d else 'not_exercised',numerator=n,denominator=d,rate=n/d if d else None)
    second=fraction(sum(r['provider_calls']==2 for r in successful),sum(r['provider_calls']>=2 for r in supported))
    return dict(first_click_success_rate=fraction(len(successful),len(supported)),
        primary_call_success_rate=fraction(sum(r['provider_calls']==1 for r in successful),len(supported)),
        second_attempt_recovery_rate=second, repair_recovery_rate=second,
        third_attempt_recovery_rate=fraction(sum(r['provider_calls']==3 for r in successful),sum(r['provider_calls']>=3 for r in supported)),
        semantic_intent_accuracy=dict(status='not_measured',reason='Scripted providers; live labeled semantic qualification required'),
        reference_value_accuracy=dict(status='fixture_checks_only',reason='Independent Python arithmetic on synthetic data; source oracle reported separately'))


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('/app/evaluation/v29'));args=parser.parse_args()
    with patch.dict(os.environ,{'AI_OFFLINE':'1','DATA_ANALYST_ENV':'development','DATA_ANALYST_SESSION_STORE':'memory',
            'DATA_ANALYST_ARTIFACT_STORE':'memory','DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'3'}),\
         patch('requests.sessions.Session.request',side_effect=AssertionError('Live provider forbidden')),\
         patch('psycopg2.connect',side_effect=AssertionError('Live warehouse forbidden')):
        cases=load_cases();rows=[run_case(c) for c in cases]
        suite=unittest.defaultTestLoader.loadTestsFromTestCase(CapacityTests)
        result=unittest.TextTestRunner(verbosity=1).run(suite)
    failed=[r for r in rows if not r['passed']]
    by_stage={s+'_failures':0 for s in STAGES}
    for r in failed:
        stage=(r.get('failure_stage') or 'SEMANTIC_INTERPRETATION').lower()
        key=stage+'_failures'
        if key in by_stage:by_stage[key]+=1
    summary=dict(version='2.9',case_count=len(rows),passed=len(rows)-len(failed),
        measurement_scope='OFFLINE_SCRIPTED_SERVER_QUALIFICATION', reliability= rates(cases,rows),
        failure_rates_by_stage=by_stage, failures=failed,
        large_scenarios=[name for name,_ in SCENARIOS],capacity_tests=result.testsRun,
        capacity_failures=len(result.failures)+len(result.errors),LIVE_PROVIDER_REQUESTS=0,WAREHOUSE_WRITES=0)
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'acceptance_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(summary,ensure_ascii=False))
    return bool(failed or not result.wasSuccessful())


if __name__=='__main__':raise SystemExit(main())
