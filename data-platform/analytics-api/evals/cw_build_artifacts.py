"""Build reproducible UI/Word QA fixtures using the real pipeline and independent raw fixture.

All execution is offline; use an isolated image with the output paths mounted writable.
"""
import argparse
import json
from pathlib import Path
from tests import cw_harness as h
from evals import comparison_fixture as cf
from services.view_mode_service import apply_view_choices
from services.docx_service import generate_report_docx


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--fixtures',required=True)
    parser.add_argument('--evidence',required=True)
    args=parser.parse_args()
    fixtures=Path(args.fixtures);fixtures.mkdir(parents=True,exist_ok=True)
    evidence=Path(args.evidence);evidence.mkdir(parents=True,exist_ok=True)
    report,_,_=h.run([h.envelope()],data=cf.warehouse_data())
    (fixtures/'cw-compare-report.json').write_text(json.dumps(report,ensure_ascii=False,default=str))
    choices={}
    for chart in report['charts']:
        modes=chart.get('view_modes') or {}
        chosen=next((v for v in modes.get('variants',[]) if v.get('availability')=='available'
                     and v['spec']['mode']=='single' and v['spec']['member']==cf.CITIES['Beta']
                     and not v['spec'].get('value_mode')),None)
        if chosen:choices[chart['id']]=chosen['id']
    active=apply_view_choices(report,choices)
    (evidence/'selected-view-report.json').write_text(json.dumps(active,ensure_ascii=False,default=str))
    (evidence/'selected-view.docx').write_bytes(generate_report_docx(active).getvalue())
    req=h.requirement(metric_ids=['order_completion_rate'],filters=[],derived_features=[],analysis_kind='ranking',
        ranking=dict(direction='top',metric_id='order_completion_rate',limit=2))
    ranked,_,_=h.run([h.envelope(req)],data=cf.warehouse_data(),mission=None,
                     question='top 2 tỉnh có tỷ lệ hoàn thành đơn cao nhất')
    (fixtures/'cw-ranking-report.json').write_text(json.dumps(ranked,ensure_ascii=False,default=str))
    (evidence/'ranking-exposure.docx').write_bytes(generate_report_docx(ranked).getvalue())
    print(json.dumps(dict(charts=len(report['charts']),choices=choices,ranking_charts=len(ranked['charts'])),ensure_ascii=False))


if __name__=='__main__':main()
