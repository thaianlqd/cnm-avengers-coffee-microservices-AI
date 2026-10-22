"""User-added problems on the Báo cáo & Phân tích hub (no provider at view time).

A verified AI report already carries a validated semantic intent. Publishing it
stores only that governed meaning (metrics, dimensions, filters, operations) as a
dashboard template; viewers re-run it through the same deterministic dashboard
path as curated templates, so no API key is used when the hub is opened.
"""
from copy import deepcopy
import re

from services.analysis_catalog import AnalysisError

PREFIX = 'U'
KINDS = {'aggregate', 'ranking', 'trend', 'distribution', 'comparison'}
FIELDS = ('id', 'goal', 'metric_ids', 'dimension_ids', 'analysis_kind', 'filters', 'ranking', 'granularity',
          'derived_features', 'feature_metrics')
CATEGORY = 'hub_problem'


def is_custom(identity):
    return bool(re.fullmatch(PREFIX + r'_[a-z0-9_]{6,40}', identity or ''))


def requirements_from_report(catalog, report):
    """Governed panels from a saved verified report; never free text or SQL."""
    from services.analysis_intent import AnalysisIntentEnvelope
    intent = (report or {}).get('semantic_intent') or {}
    try:
        envelope = AnalysisIntentEnvelope.model_validate(intent)
    except Exception:
        raise AnalysisError('dashboard_unavailable', 'Saved report has no verified analysis meaning') from None
    metrics, dimensions = catalog.registry['metrics'], catalog.registry['dimensions']
    panels = []
    for req in envelope.requirements:
        data = req.model_dump(mode='json', exclude_none=True)
        if data.get('availability', 'requested') != 'requested' or data.get('analysis_kind') not in KINDS:
            continue
        if not data.get('metric_ids') or not set(data['metric_ids']) <= metrics.keys():
            continue
        if not set(data.get('dimension_ids', [])) <= dimensions.keys():
            continue
        panel = {k: deepcopy(data[k]) for k in FIELDS if k in data and data[k] not in (None, [], {})}
        panel.setdefault('dimension_ids', [])
        panels.append(panel)
    if not panels:
        raise AnalysisError('dashboard_unavailable', 'Saved report has no reusable governed view')
    return panels[:6]


def suggest(catalog, report, title=''):
    """Suggested hub problem: title, description and the best-fitting feature group."""
    from services.domain_intelligence_service import DomainIntelligence
    panels = requirements_from_report(catalog, report)
    profiles = DomainIntelligence(catalog).available()
    used = {m for p in panels for m in p['metric_ids']}
    domains = [d for d, p in profiles.items() if used & set(p['metric_refs'])]
    templates = catalog.registry.get('workspace', {}).get('dashboard_templates', [])
    scores, similar = {}, []
    for t in templates:
        t_metrics = {m for q in t['requirements'] for m in q['metric_ids']}
        t_domains = {d for d, p in profiles.items() if t_metrics & set(p['metric_refs'])}
        overlap = len(t_domains & set(domains))
        if overlap:
            scores[t['category']] = scores.get(t['category'], 0) + overlap
        jaccard = len(t_metrics & used) / len(t_metrics | used) if t_metrics | used else 0
        if jaccard:
            similar.append({'id': t['id'], 'title': t['title'], 'category': t['category'], 'similarity': round(jaccard, 2)})
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    categories = sorted({t['category'] for t in templates})
    labels = [profiles[d]['business_label'] for d in domains]
    goals = [p.get('goal') for p in panels if p.get('goal')]
    names = [catalog.registry['metrics'][m]['business_name'] for m in dict.fromkeys(m for p in panels for m in p['metric_ids'])]
    return {
        'eligible': True,
        'suggested_title': (title or (goals[0] if goals else 'Bài toán phân tích')).strip()[:120],
        'suggested_description': ('Theo dõi ' + ', '.join(names[:4]).lower() + (' theo ' + ', '.join(labels[:2]).lower() if labels else '') + '.')[:300],
        'suggested_category': ranked[0][0] if ranked else (categories[0] if categories else 'Kinh doanh'),
        'category_reasons': [{'category': c, 'score': s, 'reason': f'Cùng miền dữ liệu với {s} góc nhìn sẵn có trong nhóm này'} for c, s in ranked[:3]],
        'categories': categories,
        'domains': [{'id': d, 'label': profiles[d]['business_label']} for d in domains],
        'panels': [{'id': p['id'], 'goal': p.get('goal', ''), 'analysis_kind': p['analysis_kind'], 'metrics': p['metric_ids'],
                    'dimensions': p.get('dimension_ids', [])} for p in panels],
        'similar_dashboards': sorted(similar, key=lambda x: -x['similarity'])[:3],
        'provider_calls': 0,
    }


def template(catalog, report_id, report, title, category, description):
    title, category, description = (title or '').strip(), (category or '').strip(), (description or '').strip()
    if not 3 <= len(title) <= 120 or not 2 <= len(category) <= 40 or len(description) > 300:
        raise AnalysisError('invalid_analysis_contract', 'Hub problem needs a title, a group and a short description')
    panels = requirements_from_report(catalog, report)
    for panel in panels:
        panel.pop('time', None)
    timed = any(catalog.registry['metrics'][m].get('time_column') for p in panels for m in p['metric_ids'])
    return {'id': PREFIX + '_' + re.sub(r'[^a-z0-9_]', '', report_id.lower())[:40], 'version': '1.0.0', 'title': title,
            'category': category, 'description': description or 'Bài toán do người dùng thêm từ báo cáo đã kiểm chứng.',
            'limitation': 'Dựng từ ý nghĩa đã kiểm chứng của báo cáo gốc; chạy lại trên dữ liệu hiện tại, không dùng AI.',
            'default_time': '30d' if timed else 'all_time', 'requirements': panels, 'custom': True}


def owned_templates():
    """Hub problems visible to the current account (owner-scoped like saved reports)."""
    from db import get_report_writer_conn as get_db_conn  # same store and owner predicate as saved reports
    from routers.reports import _owned_where
    clause, params = _owned_where(allow_legacy=False)
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT id, module_config FROM analytics.saved_reports WHERE category = %s AND ' + clause +
                            ' ORDER BY created_at DESC LIMIT 60', [CATEGORY, *params])
                rows = cur.fetchall()
    except Exception:
        return []
    out = []
    for row in rows:
        value = (row.get('module_config') or {}).get('hub_template')
        if isinstance(value, dict) and is_custom(value.get('id')):
            out.append(value)
    return out


def custom_template(identity, version):
    for value in owned_templates():
        if value['id'] == identity and value['version'] == version:
            return deepcopy(value)
    raise AnalysisError('dashboard_unavailable', 'Dashboard version is unavailable; refresh the catalog')
