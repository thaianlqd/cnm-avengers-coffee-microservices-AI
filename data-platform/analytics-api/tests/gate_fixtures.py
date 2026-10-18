"""Isolation only for tests of provider-declared outcomes, below the canonical input gate.

Public gate behavior is tested separately through production API/job paths.
This does not introduce a production bypass flag.
"""
from unittest.mock import patch
from services.semantic_preflight_contract import CapabilityDecision


def interpreted_input():
    return patch('services.preflight_service.decision_from_findings',
                 return_value=CapabilityDecision(decision='READY',stage='input'))
