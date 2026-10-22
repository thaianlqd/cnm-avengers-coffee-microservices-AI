"""Generate the API's packaged registry from the pipeline's canonical metadata.

Run from the repository, then commit both metadata artifacts together. --check
is offline and fails on drift without rewriting files.
"""
import argparse
from copy import deepcopy
import json
from pathlib import Path


def compiled_contracts(platform):
    """Resolve references into one deterministic runtime contract artifact."""
    contracts = json.loads((platform/'metadata/data_contracts.json').read_text())
    catalog = json.loads((platform/'analytics-api/metadata/semantic_catalog.json').read_text())
    projected = deepcopy(contracts)
    for definition in projected['datasets'].values():
        for rule in definition.get('quality_checks', []):
            reference = rule.get('semantic_enum_ref')
            if reference:
                values = catalog['enums'].get(reference)
                if not isinstance(values, list) or not values or not all(isinstance(v, str) for v in values):
                    raise ValueError('Unresolved semantic enum reference')
                rule['values'] = deepcopy(values)
    for definition in projected['datasets'].values():
        for period in definition.get('closed_periods', []):
            clock_owner = projected['datasets'].get(period.get('parent_table'), definition)
            period['clock_data_type'] = clock_owner['columns'][period['clock']]['data_type']
    return projected


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    platform=Path(__file__).resolve().parents[2]
    compiled=(json.dumps(compiled_contracts(platform),ensure_ascii=False,indent=2)+'\n').encode()
    artifacts={platform/'analytics-api/metadata/warehouse_views.json':(platform/'metadata/warehouse_views.json').read_bytes(),
               platform/'analytics-api/metadata/data_health_contracts.json':compiled,
               platform/'metadata/runtime_data_contracts.json':compiled}
    for target,body in artifacts.items():
        if args.check:
            if not target.exists() or body!=target.read_bytes():
                raise SystemExit('Packaged pipeline metadata differs; regenerate_pipeline_metadata.py required')
        else: target.write_bytes(body)


if __name__=='__main__': main()
