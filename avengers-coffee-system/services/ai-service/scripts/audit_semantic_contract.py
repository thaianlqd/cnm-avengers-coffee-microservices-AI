"""Static, provider-free schema/context/default inventory. No credentials or DB."""
import ast
import argparse
from copy import deepcopy
import json
import subprocess
import sys
from types import ModuleType
from pathlib import Path
from src.agents.semantic_registry import operation_registry, operations_for_context
from src.agents.tool_capabilities import capabilities_for_context, CAPABILITIES
from src.agents.llm_tool_orchestrator import SYSTEM_PROMPT, LEGACY_SYSTEM_PROMPT
from src.agents.agent_context import model_projection

ROOT = Path(__file__).resolve().parents[1]


def representative_states():
    base = {'semantic_control': True, 'session_id': 'static-authenticated', 'business': {
        'authenticated': True, 'cart_verified': True, 'cart': {'items': []}, 'checkout': {},
        'pending': None, 'pending_products': []}, 'visible': {}, 'focus': {}, 'recent': []}
    product = {'product_id': 'fixture-product', 'product_name': 'Fixture product', 'quantity': 1, 'size': 'M', 'unit_price': 30000}
    states = {'browsing': deepcopy(base)}
    for name in ('products', 'pending_product', 'cart', 'voucher', 'location', 'summary', 'order_change'):
        ctx = deepcopy(base)
        ctx['visible']['products'] = [product]
        if name == 'pending_product':
            ctx['business']['pending_products'] = [product]
        if name in {'cart', 'voucher', 'location', 'summary', 'order_change'}:
            ctx['business']['cart']['items'] = [{**product, 'cart_item_id': 'fixture-line'}]
        checkout = ctx['business']['checkout']
        if name == 'voucher':
            checkout.update(flow_stage='VOUCHER', voucher_offer_pending=True)
            ctx['visible']['vouchers'] = [{'ma_voucher': 'fixture-voucher'}]
        if name in {'location', 'summary'}:
            checkout.update(delivery_type='GIAO_TAN_NOI', voucher_decided=True, checkout_requested=True)
            ctx['visible']['branches'] = [{'branch_id': 'fixture-branch'}]
            ctx['visible']['location_candidates'] = [{'candidate_id': 'fixture-candidate'}]
        if name == 'summary':
            checkout.update(payment_method='NGAN_HANG_QR', delivery_address='Fixture address', address_confirmed=True,
                            checkout_action_id='fixture-action')
            ctx['business']['cart']['branch_id'] = 'fixture-branch'
        if name == 'order_change':
            checkout['order_management_action'] = {'order_id': 'fixture-order', 'kind': 'update_order'}
            ctx['visible']['orders'] = [{'order_id': 'fixture-order'}]
        states[name] = ctx
    return states


def default_inventory():
    rows = []
    paths = [*ROOT.glob('src/agents/*.py'), *ROOT.glob('src/common/*.py'),
             *ROOT.glob('src/function_calling/tools/*.py'), *ROOT.glob('src/rag/*.py')]
    for path in sorted(paths):
        tree = ast.parse(path.read_text())
        sites = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for arg, default in zip(node.args.args[-len(node.args.defaults):], node.args.defaults):
                    sites.append({'line': node.lineno, 'kind': 'parameter', 'function': node.name,
                                  'field': arg.arg, 'value': ast.unparse(default)})
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'get' and len(node.args) == 2:
                sites.append({'line': node.lineno, 'kind': 'get_default', 'expression': ast.unparse(node)})
            if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
                sites.append({'line': node.lineno, 'kind': 'or_fallback', 'expression': ast.unparse(node)})
        rows.append({'path': str(path.relative_to(ROOT)), 'lines': len(path.read_text().splitlines()), 'sites': sites})
    return rows


def baseline_schema_builder(source_dir=None):
    prefix = '60a88e37822c02715b9f177a40bf5a20c7d3e1ff:avengers-coffee-system/services/ai-service/'
    modules = []
    for filename in ('tool_capabilities', 'semantic_control'):
        source = (Path(source_dir, filename + '.py').read_text() if source_dir else
            subprocess.run(['git', 'show', prefix + 'src/agents/' + filename + '.py'],
                cwd=ROOT, check=True, text=True, capture_output=True).stdout)
        module = ModuleType('_static_baseline_' + filename)
        sys.modules[module.__name__] = module
        exec(compile(source, '<immutable starting HEAD>', 'exec'), module.__dict__)
        modules.append(module)
    return lambda allowed: modules[1].customer_actions_schema(allowed,
        modules[0].tool_schemas(allowed), model_facing=True)


def audit(source_dir=None):
    sizes = []
    baseline = baseline_schema_builder(source_dir)
    for name, ctx in representative_states().items():
        allowed = capabilities_for_context(ctx, entry_action=ctx['business']['checkout'].get('checkout_action_id'))
        operations = operations_for_context(ctx, allowed)
        old = [baseline(allowed)]
        new = [op.schema() for op in operations]
        _, encoded = model_projection(ctx)
        sizes.append({'state': name, 'legacy_flat_schema_chars': len(json.dumps(old, ensure_ascii=False)),
                      'exact_schema_chars': len(json.dumps(new, ensure_ascii=False)), 'exposed_functions': len(new),
                      'context_chars': len(encoded)})
    return {'live_provider_requests': 0, 'legacy_system_prompt_chars': len(LEGACY_SYSTEM_PROMPT),
            'semantic_system_prompt_chars': len(SYSTEM_PROMPT), 'states': sizes,
            'worst_case_exact_schema_chars': len(json.dumps([op.schema() for op in operation_registry().values()], ensure_ascii=False)),
            'registry': [{'operation': op.name, 'function': op.function_name, 'executor': op.executor, 'access': op.access,
                          'namespace': op.namespace, 'facet': op.facet, 'required': op.parameters()['required'],
                          'allowed_commitments': op.allowed_commitments, 'omissions': op.omissions,
                          'optional_field_policies': op.omission_policies(),
                          'preconditions': op.preconditions} for op in operation_registry().values()],
            'default_inventory': default_inventory()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-source-dir', help='Read immutable starting-HEAD sources exported by git show (for offline containers without git).')
    report = audit(parser.parse_args().baseline_source_dir)
    path = ROOT / 'docs' / 'SEMANTIC_CONTRACT_STATIC_AUDIT.json'
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key not in {'registry', 'default_inventory'}}, ensure_ascii=False))
