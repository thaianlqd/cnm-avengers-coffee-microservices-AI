"""Dependency-free synthetic typed provider response, never a network client."""
import json


def step(name, fields):
    return {'tool_calls': [{'id': 'fixture', 'type': 'function', 'function': {
        'name': 'semantic_' + name.lower(), 'arguments': json.dumps(fields, ensure_ascii=False)}}]}
