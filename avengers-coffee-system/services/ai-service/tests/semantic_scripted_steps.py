"""Dependency-free synthetic typed provider response, never a network client."""
import json
from copy import deepcopy


def provider_pair(name, fields):
    """Migrate positive scripted meaning to the minimal public wire contract.

    Private legacy tests still call semantic_calls directly. Invalid semantic
    commitments are deliberately retained as forbidden fields for negative tests.
    """
    name = name if name.startswith('semantic_') else 'semantic_' + name.lower()
    data = deepcopy(fields)
    commitment = data.get('commitment')
    variants = {
        ('semantic_use_product_defaults', 'CORRECTION'): 'semantic_reset_product_defaults',
        ('semantic_select_profile_address', 'REJECTED'): 'semantic_decline_profile_address',
        ('semantic_select_profile_address', 'CORRECTION'): 'semantic_change_profile_address',
    }
    name = variants.get((name, commitment), name)
    if commitment in {'SELECTED', 'AFFIRMED', 'CORRECTION', 'REJECTED'}:
        data.pop('commitment', None)
    data.pop('evidence', None)
    if name == 'semantic_select_product':
        name, data = 'semantic_select_products', {'selections': [data]}
    return name, data


def step(name, fields):
    name, fields = provider_pair(name, fields)
    return {'tool_calls': [{'id': 'fixture', 'type': 'function', 'function': {
        'name': name, 'arguments': json.dumps(fields, ensure_ascii=False)}}]}
