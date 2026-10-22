"""Isolation only for tests of provider-declared outcomes, below the canonical input gate.

Public gate behavior is tested separately through production API/job paths.
This does not introduce a production bypass flag.
"""
from unittest.mock import patch
from contextlib import contextmanager
from services.semantic_preflight_contract import CapabilityDecision


@contextmanager
def interpreted_input():
    # These tests begin after intake and exercise scripted provider outcomes.
    # Keep this adapter test-local; production intake is covered by HTTP spies.
    receipt={'version':'interpreted-fixture','policy_fingerprint':'interpreted-fixture',
             'fingerprint':'interpreted-fixture','required_filters':[],'lookup_queries':0}
    with patch('services.preflight_service.decision_from_findings',
               return_value=CapabilityDecision(decision='READY',stage='input')), \
         patch('services.agent_pipeline.AnalysisPipeline.validate_input',return_value=receipt):
        yield
