"""Generate the business data dictionary from the governed catalog + business registry (PLAN 20/10 deliverable).

Derived document only: never edited by hand, never a source of truth.
    python -m tools.business_data_dictionary --out /app/evaluation/business-data-dictionary.md
"""
import argparse
import json
from pathlib import Path

from services.analysis_catalog import CATALOG_PATH
from services.business_registry import coverage_report, load_registry


def render():
    catalog = json.loads(CATALOG_PATH.read_text())
    r = catalog['analysis_registry']
    profiles = r['domain_intelligence']['profiles']
    registry = load_registry()
    report = coverage_report(registry)
    lines = ['# Từ điển dữ liệu nghiệp vụ — AI Data Analyst', '',
             'Sinh tự động từ `metadata/semantic_catalog.json` và `metadata/business_feature_registry.json`. Không sửa tay.', '',
             f"Phạm vi: {len(profiles)} miền, {sum(1 for m in r['metrics'].values() if not m.get('component_only'))} chỉ số công khai, "
             f"{report['group_count']} nhóm nghiệp vụ, {report['classified_source_tables']}/{report['source_table_count']} bảng nguồn đã phân loại.", '']
    for id, p in sorted(profiles.items(), key=lambda kv: kv[1]['business_label']):
        lines += [f"## {p['business_label']} (`{id}`)", '', p['short_business_purpose'], '',
                  '| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |', '|---|---|---|---|---|---|']
        for m in p['metric_refs']:
            d = r['metrics'][m]
            limits = '; '.join(d.get('known_caveats', [])[:2]).replace('|', '/')
            lines.append(f"| {d['business_name']} (`{m}`) | {d['unit']} | {'có' if d.get('time_column') else 'hiện trạng'} | "
                         f"{(d.get('business_definition') or d.get('business_meaning', '')).replace('|', '/')} | {d.get('population_definition', '').replace('|', '/')} | {limits} |")
        caveats = [r['domain_intelligence']['caveat_labels'][c] for c in p['business_caveats']]
        if caveats:
            lines += ['', 'Lưu ý: ' + ' '.join(caveats)]
        lines.append('')
    lines += ['## Khái niệm chưa hỗ trợ (có giải thích)', '', '| Khái niệm | Lý do | Giải thích |', '|---|---|---|']
    for id, u in sorted(r['unsupported_capabilities'].items()):
        lines.append(f"| `{id}` | {u['reason']} | {u['limitation']} |")
    lines += ['', '## Nhóm nghiệp vụ B01–B34', '', '| Nhóm | Trạng thái | Miền | Mục còn mở |', '|---|---|---|---|']
    for g in registry['groups']:
        items = '; '.join(f"{i['state']}: {i['item']}" for i in g['open_items']).replace('|', '/')
        lines.append(f"| {g['group_id']} {g['title']} | {g['analytic_state']} | {', '.join(g['domain_ids']) or '—'} | {items} |")
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    Path(args.out).write_text(render(), encoding='utf-8')
    print('written', args.out)


if __name__ == '__main__':
    main()
