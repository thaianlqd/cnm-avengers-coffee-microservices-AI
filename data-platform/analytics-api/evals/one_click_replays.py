"""Captured primary drafts with independently authored, minimal repair patches.

Never imported by production. Replaying is not evidence of live model accuracy.
"""
import json
from pathlib import Path
from evals.one_click_cases import intent

REPAIRS = {
    'kiosks': [
        dict(id='overall_kpi', filters=[dict(dimension='store_type',operator='in',value=['KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH'])],feature_metrics={'scalar':['store_revenue','store_order_count','aov']}),
        dict(id='top_10_stores_revenue',dimension_ids=['store']),
        dict(id='top_10_stores_orders',dimension_ids=['store']),
        dict(id='revenue_by_city',dimension_ids=['city'],derived_features=['contribution_share'],feature_metrics={'contribution_share':['store_revenue']}),
        dict(id='revenue_by_store_type',dimension_ids=['store_type'],derived_features=['contribution_share'],feature_metrics={'contribution_share':['store_revenue']})],
    'vouchers': [dict(id='req_1',filters=[]),
        dict(id='req_2',filters=[],dimension_ids=['promotion'],ranking={'per_group':[]}),
        dict(id='req_3',dimension_ids=['promotion'],ranking={'per_group':[]}),
        dict(id='req_4',dimension_ids=[]),dict(id='req_5',dimension_ids=[]),dict(id='req_6',dimension_ids=['city'])]
}


def responses(case):
    if case['id'] not in REPAIRS:
        return [intent(case)]
    path=Path(__file__).resolve().parents[1]/'evaluation'/('one_click_captured_'+case['id']+'.json')
    return [json.loads(path.read_text()),dict(decision='analyze',requirements=REPAIRS[case['id']])]
