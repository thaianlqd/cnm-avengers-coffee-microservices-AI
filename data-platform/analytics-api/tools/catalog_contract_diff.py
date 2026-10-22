"""Offline semantic contract diff; no provider/warehouse/credential loading."""
import argparse
import json
from pathlib import Path

from services.semantic_catalog_validation import contract_diff


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before', required=True, type=Path)
    parser.add_argument('--after', required=True, type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--fail-on-meaning-change', action='store_true')
    args = parser.parse_args()
    result = contract_diff(json.loads(args.before.read_text()), json.loads(args.after.read_text()))
    wire = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(wire)
    else:
        print(wire, end='')
    return 1 if args.fail_on_meaning_change and result['requires_meaning_review'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
