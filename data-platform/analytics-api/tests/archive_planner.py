"""V2.4–V2.7 implementation reference, never selected by production routes.

Historical graph fixtures intentionally test the retired model-authored contract.
V2.8 production qualification lives in test_hybrid_v28.py and evals/run_eval_v28.py.
"""
import os
from unittest.mock import patch
from copy import deepcopy
from services.agent_pipeline import AnalysisPipeline as ProductionPipeline


def historical_catalog(catalog):
    """The archived planner sends one global manifest; it is qualified against the
    pre-round-3 business scope (PLAN 20/10 added 26 sources/domains it never served).
    Production (HybridAnalystPlanner) always uses the full governed catalog."""
    from services.analysis_catalog import AnalysisCatalog
    from pathlib import Path
    from tools.deploy_business_coverage_round3 import MODIFIED_VIEWS, plan
    added = set(plan(Path(__file__).resolve().parents[1])['views']) - set(MODIFIED_VIEWS)
    overlay = deepcopy(catalog.overlay); r = overlay['analysis_registry']
    keep = {'metrics': {i for i, d in r['metrics'].items() if d['source'] not in added},
            'dimensions': {i for i, d in r['dimensions'].items() if d['table'] not in added},
            'subjects': {i for i, d in r['subjects'].items() if d['source'] not in added}}
    for k in keep:
        r[k] = {i: d for i, d in r[k].items() if i in keep[k]}
    for s in r['subjects'].values():
        s['metrics'] = [m for m in s['metrics'] if m in keep['metrics']]
    profiles = r['domain_intelligence']['profiles']
    for p in profiles.values():  # a legacy domain that gained a round-3 subject keeps its legacy subjects
        p['primary_subjects'] = [s for s in p['primary_subjects'] if s in keep['subjects']]
    for id in [i for i, p in profiles.items() if not p['primary_subjects'] or not set(p['metric_refs']) & keep['metrics']]:
        profiles.pop(id)
    for p in profiles.values():
        p['lens_axes'] = [d for d in p.get('lens_axes', []) if d in keep['dimensions']]
        p['metric_refs'] = [m for m in p['metric_refs'] if m in keep['metrics']]
        p['dimension_refs'] = [d for d in p['dimension_refs'] if d in keep['dimensions']]
        p['analytical_lenses'] = [l for l in p['analytical_lenses'] if set(l['metric_refs']) <= keep['metrics']]
        p['supporting_analysis_capabilities'] = [i for i in p.get('supporting_analysis_capabilities', []) if i in {l['id'] for l in p['analytical_lenses']}]
        p['related_domains'] = [d for d in p.get('related_domains', []) if d in profiles]
    for c in r['domain_intelligence'].get('topic_concepts', []):
        c['targets'] = [t for t in c['targets'] if t['domain_id'] in profiles]
    workspace = r.get('workspace', {})
    if 'dashboard_templates' in workspace:  # D17+ cover round-3 domains
        workspace['dashboard_templates'] = [t for t in workspace['dashboard_templates'] if int(t['id'][1:]) <= 16]
    for u in [*r.get('unsupported_capabilities', {}).values(), *workspace.get('unsupported_concepts', {}).values()]:
        if 'nearest_metrics' in u:
            u['nearest_metrics'] = [m for m in u['nearest_metrics'] if m in keep['metrics']]
    for id, refs in workspace.get('unsupported_nearest', {}).items():
        workspace['unsupported_nearest'][id] = [m for m in refs if m in keep['metrics']]
    historical = AnalysisCatalog({'table_map': catalog.tables}, overlay=overlay)
    historical.historical_scope = True
    return historical


def archived_catalog_loading():
    """Saved-report checks that load the catalog themselves (export) see the archived scope."""
    from services import analysis_catalog
    real = analysis_catalog.AnalysisCatalog

    def make(metadata, overlay=None):
        return real(metadata, overlay=overlay) if overlay is not None else historical_catalog(real(metadata))
    return patch('services.analysis_catalog.AnalysisCatalog', side_effect=make)


class ArchivedGraphPipeline(ProductionPipeline):
    def validate_input(self,question,catalog,context=None,**kwargs):
        """Historical transport/algebra fixtures deliberately use opaque text.

        Their subject/metric oracle is the scripted historical tool contract,
        not today's NL input gate. Only this test subclass bypasses that gate;
        production legacy/one-shot paths still enforce it (test_input_integrity).
        There is no environment flag, request field or API route for this adapter.
        """
        return {'version':'historical-fixture','policy_fingerprint':'historical-fixture',
                'fingerprint':'historical-fixture','required_filters':[],'lookup_queries':0,
                'can_submit':True,'findings':[],'slots':[]}

    def guided_context(self,*args,**kwargs):
        # The retired fixtures qualify their scripted contract, including the
        # old preflight path, rather than today's free-text intake grammar.
        with patch('services.input_integrity_service.validate',side_effect=self.validate_input):
            return super().guided_context(*args,**kwargs)

    def refine(self,*args,**kwargs):
        with patch('services.input_integrity_service.validate',side_effect=self.validate_input):
            return super().refine(*args,**kwargs)

    def catalog(self):
        # One catalog per archived run: proposal, execution and saved-report checks share its fingerprint.
        full = super().catalog()
        if self.planning_mode == "legacy":
            return full
        self._active_catalog = historical_catalog(full)
        return self._active_catalog

    def agent(self,catalog,reference,proposal=False,previous=None,known_concepts=None):
        if self.planning_mode == "legacy":
            return super().agent(catalog,reference,proposal,previous,known_concepts)
        from services.one_shot_planner import OneShotPlanner
        if not getattr(catalog, 'historical_scope', False):
            catalog = historical_catalog(catalog)
        config = {}
        if "DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN" not in os.environ:
            config = {"DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN":"1","DATA_ANALYST_ENABLE_CONTRACT_REPAIR":"0"}
        with patch.dict(os.environ,config):
            agent = OneShotPlanner(catalog,self.provider,self.executor,self.value_lookup,reference,self.semantic_info,self.budget,proposal,previous)
        for ref in known_concepts or []:
            kind,_,id = ref.partition(":")
            if kind in {"subject","metric","dimension"} and id in catalog.registry[kind+"s"]:
                agent.semantic.discovered.add((kind,id))
        self._last_agent = agent
        return agent
