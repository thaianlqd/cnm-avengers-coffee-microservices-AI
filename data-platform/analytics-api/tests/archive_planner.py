"""V2.4–V2.7 implementation reference, never selected by production routes.

Historical graph fixtures intentionally test the retired model-authored contract.
V2.8 production qualification lives in test_hybrid_v28.py and evals/run_eval_v28.py.
"""
import os
from unittest.mock import patch
from services.agent_pipeline import AnalysisPipeline as ProductionPipeline


class ArchivedGraphPipeline(ProductionPipeline):
    def agent(self,catalog,reference,proposal=False,previous=None,known_concepts=None):
        if self.planning_mode == "legacy":
            return super().agent(catalog,reference,proposal,previous,known_concepts)
        from services.one_shot_planner import OneShotPlanner
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
