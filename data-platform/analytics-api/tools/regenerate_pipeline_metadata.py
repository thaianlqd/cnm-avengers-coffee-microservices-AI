"""Generate the API's packaged registry from the pipeline's canonical metadata.

Run from the repository, then commit both metadata artifacts together. --check
is offline and fails on drift without rewriting files.
"""
import argparse
import json
from pathlib import Path


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    platform=Path(__file__).resolve().parents[2]
    contracts=json.loads((platform/'metadata/data_contracts.json').read_text())
    projected={'version':contracts['version'],'datasets':{name:{key:definition[key] for key in
        ('dataset_id','source_table','target_table','primary_key','columns','source_business_owner',
         'expected_load_interval_seconds','maximum_acceptable_load_lag_seconds')}
        for name,definition in contracts['datasets'].items()}}
    artifacts={'warehouse_views.json':(platform/'metadata/warehouse_views.json').read_bytes(),
               'data_health_contracts.json':(json.dumps(projected,ensure_ascii=False,indent=2)+'\n').encode()}
    for name,body in artifacts.items():
        target=platform/'analytics-api/metadata'/name
        if args.check:
            if not target.exists() or body!=target.read_bytes():
                raise SystemExit('Packaged pipeline metadata differs; regenerate_pipeline_metadata.py required')
        else: target.write_bytes(body)


if __name__=='__main__': main()
