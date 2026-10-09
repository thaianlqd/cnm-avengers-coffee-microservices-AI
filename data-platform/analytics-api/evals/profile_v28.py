"""Matched archived/current context measurements; no provider or warehouse I/O."""
import json
import os
from pathlib import Path
from unittest.mock import Mock,patch
from datetime import date
from common import AiTextToReportRequest
from services.analyst_decision import decision_tool
from services.analysis_intent import intent_tool
from services.semantic_manifest_service import compact
from tests.archive_planner import ArchivedGraphPipeline
from tests.test_one_shot_v24 import scripted as old_scripted, decision
from tests.test_hybrid_v28 import HybridTests,scripted
from evals.manual_v28 import meanings


def main():
    harness=HybridTests();harness.setUp();rows=[]
    try:
        for id,question,meaning in meanings():
            request=harness.request(question)
            old=ArchivedGraphPipeline(metadata_loader=harness.pipeline().metadata_loader,provider=old_scripted(decision()),executor=Mock(),value_lookup=Mock(return_value=[]))
            with patch.dict(os.environ,{'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'1','DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'0'}):
                try:old.propose(request)
                except Exception:pass  # baseline graph rejection is not a live result
            new=harness.pipeline(scripted(meaning));proposal=new.propose(request)
            row={'scenario':id,'old_total_body_chars':old.semantic_info.get('total_context_chars'),
                 'new_total_body_chars':proposal['diagnostics']['total_context_chars'],
                 'old_decision_schema_chars':len(compact(decision_tool(natural=True,refinement=False))),
                 'new_decision_schema_chars':len(compact(intent_tool()))}
            row['body_reduction_pct']=round(100*(1-row['new_total_body_chars']/row['old_total_body_chars']),2)
            row['schema_reduction_pct']=round(100*(1-row['new_decision_schema_chars']/row['old_decision_schema_chars']),2)
            rows.append(row)
    finally:harness.doCleanups()
    output=Path('/app/evals/v28-artifacts');output.mkdir(exist_ok=True)
    (output/'context_profile.json').write_text(json.dumps(rows,indent=2)+'\n')
    print(json.dumps(rows))


if __name__=='__main__':main()
