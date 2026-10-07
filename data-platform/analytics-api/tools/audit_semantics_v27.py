"""Offline business-semantic and physical availability lint; no providers or DB."""
import argparse
import json
import sys
from pathlib import Path
from datetime import date
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from tests.analysis_fixtures import physical_metadata
from services.analysis_catalog import AnalysisCatalog
from services.domain_intelligence_service import DomainIntelligence
from services.analytical_blueprint_service import materialize
from services.analytical_query_service import AnalyticalQueries
from services.semantic_tools import SemanticTools


def audit(catalog):
    intelligence=DomainIntelligence(catalog);profiles=intelligence.available();r=catalog.registry;errors=[];domains=[]
    def forbidden(*args,**kwargs):raise AssertionError('Offline audit must not execute')
    queries=AnalyticalQueries(catalog,SemanticTools(catalog,forbidden),date(2026,10,7),forbidden,{},proposal=True);queries.enforce_discovery=False
    for id,m in r['metrics'].items():
        for field in ('business_definition','population_definition','grain','aggregation_semantics','aggregation_behavior','additivity_by_dimension','historical_capability','quality_direction','invalid_uses'):
            if not m.get(field):errors.append({'kind':'metric','id':id,'reason':'missing_'+field})
        if 'AVG(' in m['expression'].upper() or '/ NULLIF(COUNT(' in m['expression'].upper():
            if m.get('aggregation_semantics')!='average' or m.get('additive'):errors.append({'kind':'metric','id':id,'reason':'invalid_average_semantics'})
        if not m.get('time_column') and m.get('historical_capability') not in ('snapshot','snapshot_only','current_snapshot'):
            errors.append({'kind':'metric','id':id,'reason':'false_history'})
    for id,d in r['dimensions'].items():
        for field in ('business_meaning','grouping_semantics','filter_semantics','cardinality_hint'):
            if not d.get(field):errors.append({'kind':'dimension','id':id,'reason':'missing_'+field})
    for id,p in profiles.items():
        lenses=[]
        for l in p['analytical_lenses']:
            status='valid'
            try:
                if not l.get('example_intents'):raise ValueError('missing_examples')
                if not l['blueprint']['default_metric_refs']:status='needs_input'
                else:
                    raw,_=materialize({'id':'audit','lens_id':l['id']},catalog,intelligence)
                    queries.prepare({**raw,'role':'requested'})
            except (KeyError,ValueError) as error:
                status='invalid';errors.append({'kind':'lens','id':l['id'],'reason':getattr(error,'category',str(error))})
            lenses.append(dict(id=l['id'],status=status,operation=l['blueprint']['default_operation'],metrics=l['metric_refs'],history=l['supports_time_series'],examples=len(l.get('example_intents',[]))))
        domains.append(dict(id=id,metrics=len(p['metric_refs']),dimensions=len(p['dimension_refs']),lenses=lenses))
    return dict(version='2.7.1',source='synthetic_physical_metadata',domain_count=len(profiles),lens_count=sum(len(d['lenses']) for d in domains),
        metric_count=len(r['metrics']),dimension_count=len(r['dimensions']),relationship_count=len(r['domain_intelligence'].get('business_relationships',[])),
        unavailable_domains=sorted(set(intelligence.profiles)-set(profiles)),domains=domains,errors=errors,provider_calls=0,live_db_mutations=0)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path);args=parser.parse_args()
    with patch('requests.sessions.Session.request',side_effect=AssertionError('HTTP forbidden')),patch('psycopg2.connect',side_effect=AssertionError('Live DB forbidden')):
        report=audit(AnalysisCatalog(physical_metadata()))
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='domains'},ensure_ascii=False))
    return bool(report['errors'])

if __name__=='__main__':raise SystemExit(main())
