"""All-operation provenance and grounding checks, entirely fake/server owned."""
from copy import deepcopy
from dataclasses import replace
from types import SimpleNamespace
import pytest
from src.agents.semantic_registry import (operation_registry, validate_operation,
    materialize_operation, validate_registry, operations_for_context, NAMESPACE_REFERENCES)
from src.agents.semantic_control import ground_action, ground_reference, NAMESPACES
from src.agents.tool_capabilities import tool_schemas, validate_args
from test_semantic_registry_contract import sample, assert_closed, calls
from test_semantic_control import runtime, compatibility_runtime, gateway_for

REGISTRY = operation_registry()
IDS = {'PRODUCT': '101', 'CART_LINE': '800', 'VOUCHER': 'CODE', 'ORDER': '11111111-1111-1111-1111-111111111111',
    'LOCATION': '17 Fixture Street', 'PROFILE_ADDRESS': '17 Saved Street', 'LOCATION_CANDIDATE': 'candidate',
    'PAYMENT': 'VNPAY', 'FULFILLMENT': 'GIAO_TAN_NOI', 'MENU_CATEGORY': 'category', 'BRANCH': 'branch'}


def minimal(op):
    """Only required schema fields, plus declared conditional requirements."""
    value = sample(op.parameters())
    if op.target_required:
        value['reference'] = {'kind': 'literal' if op.namespace == 'LOCATION' else 'id', 'value': IDS[op.namespace]}
    if op.require_any_fields:
        field = op.require_any_fields[0]
        value[field] = sample(op.fields[field])
    return value


def universe(rt):
    g = gateway_for(rt, 'Fixture authority roundtrip')
    product = deepcopy(rt.products[0])
    g.context['business']['pending_products'] = [product]
    g.entry_pending_products = [product]
    g.entry_products = [product]
    g.entry_cart_lines = [g.entry_cart_lines[0]]
    g.artifacts.product_candidates = {'101': product}
    g.artifacts.visible.update(vouchers=[{'ma_voucher': 'CODE', 'ten_voucher': 'Fixture voucher', 'so_tien_giam_du_kien': 100}],
        orders=[{'order_id': IDS['ORDER']}], branches=[{'branch_id': 'branch', 'branch_name': 'Fixture branch'}],
        location_candidates=[{'candidate_id': 'candidate', 'display_address': '17 Candidate Street'}],
        menu_categories=[{'category_id': 'category', 'category_name': 'Fixture category', 'menu_bucket': 'drink'}],
        payment_options=[{'code': 'VNPAY', 'label': 'VNPAY'}])
    g.entry_profile_offer = {'addresses': [{'full_address': IDS['PROFILE_ADDRESS'], 'label': 'Home'}]}
    return g


@pytest.mark.parametrize('name', REGISTRY)
@pytest.mark.parametrize('include_optional', [False, True])
def test_all_minimal_payloads_have_only_declared_mapping_provenance(name, include_optional):
    op = REGISTRY[name]
    value = minimal(op)
    if include_optional:
        value.update({key: sample(spec) for key, spec in op.parameters()['properties'].items()
            if key not in value and key != 'reference'})
    assert_closed(op.parameters())
    assert validate_operation(name, value)
    proposal = materialize_operation(name, value)
    expected = {k: deepcopy(v) for k, v in value.items() if k not in {
        'commitment', 'evidence', 'reference', 'exclude_previous', 'supplied_location', 'facet',
        *(source for source, _ in op.metadata_mappings)}}
    for source, dest in op.renames:
        if source in expected:
            expected[dest] = expected.pop(source)
    expected.update(dict(op.fixed_args))
    for source, dest in op.joined_args:
        expected[dest] = ' '.join(expected[source])
    for source, dest, mapping in op.value_mappings:
        expected[dest] = dict(mapping)[expected.pop(source)]
    assert proposal['args'] == expected
    assert proposal['semantic_payload'] == value
    assert proposal['commitment'] == value.get('commitment', 'QUESTION')
    assert proposal['facet'] == value.get('facet', op.facet)
    if 'reference' not in value and op.implicit_reference_kind is None:
        assert 'reference' not in proposal
    elif 'reference' not in value:
        assert proposal['reference'] == {'namespace': op.namespace, 'kind': op.implicit_reference_kind}
    else:
        assert proposal['reference'] == {'namespace': op.namespace, **value['reference']}
    allowed = {'tool', 'args', 'operation', 'semantic_payload', 'commitment', 'evidence', 'facet', 'reference',
        *(target for _, target in op.metadata_mappings), 'exclude_previous', 'supplied_location'}
    if op.option_intent:
        allowed.add('option_intent')
        assert proposal['option_intent'] == op.option_intent
    assert not proposal.keys() - allowed


@pytest.mark.parametrize('name', REGISTRY)
def test_every_operation_minimal_roundtrip_reaches_exact_business_schema(runtime, name):
    op = REGISTRY[name]
    value = minimal(op)
    assert validate_operation(name, value)
    args, row, error = ground_action(universe(runtime), materialize_operation(name, value))
    assert error is None, (name, error)
    spec = next(r['function']['parameters'] for r in tool_schemas() if r['function']['name'] == op.executor)
    assert validate_args(args, spec), (name, args, spec)
    assert not runtime.reads and not runtime.writes


@pytest.mark.parametrize('scope', ['drink', 'food', 'all'])
def test_family_discovery_has_no_category_target_even_with_stale_focus(runtime, scope):
    g = universe(runtime)
    value = {'scope': scope, 'product_family': 'Synthetic family'}
    assert validate_operation('semantic_discover_products', value)
    proposal = materialize_operation('semantic_discover_products', value)
    assert 'reference' not in proposal
    args, row, error = ground_action(g, proposal)
    assert not error and row is None
    assert args == {'category': scope, 'search_text': 'Synthetic family', 'sort_by': 'menu'}
    assert not runtime.reads and not runtime.writes


def test_explicit_category_discovery_uses_canonical_category(runtime):
    g = universe(runtime)
    args, row, error = ground_action(g, materialize_operation('semantic_discover_products', {
        'scope': 'all', 'reference': {'kind': 'ordinal', 'index': 1}}))
    assert not error and row['category_id'] == 'category'
    assert args == {'category': 'drink', 'category_id': 'category', 'sort_by': 'menu'}


@pytest.mark.parametrize('name', ['semantic_configure_product', 'semantic_use_product_defaults'])
@pytest.mark.parametrize('count', [0, 1, 2])
def test_implicit_pending_is_unique_selected_product_only(runtime, name, count):
    g = universe(runtime)
    # Focus/display is Alpha; pending, if unique, is Beta.
    g.context['business']['pending_products'] = deepcopy(runtime.products[1:2] if count == 1 else runtime.products[:count])
    value = minimal(REGISTRY[name])
    args, row, error = ground_action(g, materialize_operation(name, value))
    if count == 1:
        assert not error and args['product_id'] == '102'
    else:
        assert args is None and row is None
        assert error['status'] == ('pending_product_required' if not count else 'ambiguous_reference')
        assert error['unresolved_namespace'] == 'PRODUCT' and error['ambiguity_count'] == count
        if not count:
            assert error['error_class'] == 'BUSINESS_PRECONDITION'
    assert not runtime.writes


@pytest.mark.parametrize('name', REGISTRY)
def test_pending_requires_operation_and_namespace_policy(name):
    op = REGISTRY[name]
    value = minimal(op)
    if op.namespace:
        value['reference'] = {'kind': 'pending'}
        assert validate_operation(name, value) == (name in {'semantic_configure_product', 'semantic_use_product_defaults'})
        assert set(op.allowed_reference_kinds) <= set(NAMESPACE_REFERENCES[op.namespace])


def test_undocumented_implicit_policy_fails_registry_audit():
    op = REGISTRY['semantic_discover_products']
    for altered in [replace(op, implicit_reference_kind='pending'),
            replace(op, implicit_reference_kind='pending', implicit_reference_precondition='unique_selected_pending_product'),
            replace(op, allowed_reference_kinds=('pending',)), replace(op, exposure_policy='guess_from_text')]:
        with pytest.raises(AssertionError):
            validate_registry({altered.function_name: altered})
    assert {op.name for op in REGISTRY.values() if op.implicit_reference_kind} == {'CONFIGURE_PRODUCT', 'USE_PRODUCT_DEFAULTS'}


REFERENCE_CASES = [(ns, kind) for ns, kinds in NAMESPACE_REFERENCES.items() if ns != 'LOCATION' for kind in kinds]
@pytest.mark.parametrize('namespace,kind', REFERENCE_CASES)
def test_reference_policy_matrix_grounds_only_server_candidates(runtime, namespace, kind):
    g = universe(runtime)
    if namespace == 'FULFILLMENT':
        # Singleton requires an actually unique universe; canonical fulfillment
        # inventory has several methods, so ambiguity is genuine.
        if kind == 'singleton':
            _, error = ground_reference(g, namespace, {'kind': kind})
            assert error['status'] == 'ambiguous_reference'
            return
    key, fields, labels = NAMESPACES[namespace]
    from src.agents.semantic_control import candidates
    rows = candidates(g, namespace, {'kind': kind})
    chosen = next((r for r in rows if str(r.get(fields[0])) == IDS[namespace]), rows[0])
    reference = {'kind': kind}
    if kind == 'id': reference['value'] = IDS[namespace]
    if kind == 'name': reference['value'] = chosen[labels[0]]
    if kind == 'ordinal': reference['index'] = 1
    if kind == 'focus':
        g.artifacts.focus['location' if namespace == 'LOCATION_CANDIDATE' else namespace.lower()] = chosen
    row, error = ground_reference(g, namespace, reference)
    assert not error, (namespace, kind, error)
    assert row and not runtime.writes


@pytest.mark.parametrize('policy,positive', [
    ('draft_selection', {'business': {'cart_verified': True, 'authenticated': True}}),
    ('pending_product', {'business': {'pending_products': [{'product_id': '101'}]}}),
    ('saved_addresses', {'profile_address_candidates_available': True}),
    ('location_candidates', {'visible': {'location_candidates': [{'candidate_id': 'c'}]}}),
    ('branch_candidates', {'visible': {'branches': [{'branch_id': 'b'}]}}),
    ('owned_order', {'visible': {'orders': [{'order_id': IDS['ORDER']}]}}),
    ('order_preview', {'business': {'checkout': {'order_management_action': {'order_id': IDS['ORDER']}}}}),
    ('order_draft', {'business': {'checkout': {'order_management_focus': {'order_id': IDS['ORDER']}}}}),
])
def test_state_exposure_has_exact_negative_and_positive_gate(policy, positive):
    ops = [op for op in REGISTRY.values() if op.exposure_policy == policy]
    assert ops
    all_executors = {op.executor for op in REGISTRY.values()}
    absent = {op.function_name for op in operations_for_context({}, all_executors)}
    present = {op.function_name for op in operations_for_context(positive, all_executors)}
    for op in ops:
        assert op.function_name not in absent and op.function_name in present
    # Interrupting with safe discovery/review/order reads remains possible.
    assert {'semantic_discover_products', 'semantic_read_order_history', 'semantic_ask_product_options'} <= present


def test_neutral_menu_order_is_deterministic_name_then_id(monkeypatch):
    from src.function_calling.tools import product_tools
    queries = []
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, statement, params):
            queries.append(str(statement))
            return SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: []))
    monkeypatch.setattr(product_tools, '_get_engine', lambda: SimpleNamespace(connect=Connection))
    result = product_tools.execute_filter_catalog(category='drink', sort_by='menu')
    assert result['ordering_basis'] == 'canonical_menu_name_id'
    ordering = queries[0].split('ORDER BY')[-1].split('LIMIT')[0].strip()
    assert ordering == 'sp.ten_san_pham ASC, sp.ma_san_pham ASC'
    assert dict(REGISTRY['semantic_discover_products'].fixed_args)['sort_by'] == 'menu'
    assert REGISTRY['semantic_rank_by_price'].value_mappings == (
        ('direction', 'sort_by', (('ascending', 'price_asc'), ('descending', 'price_desc'))),)


@pytest.mark.parametrize('kind', ['id', 'name', 'ordinal', 'focus', 'pending', 'singleton', 'recent', 'best', 'literal'])
def test_each_reference_kind_requires_namespace_and_operation_permission(kind):
    for name, op in REGISTRY.items():
        if not op.namespace or kind in op.allowed_reference_kinds:
            continue
        reference = {'kind': kind}
        if kind in {'id', 'name', 'literal'}:
            reference['value'] = IDS[op.namespace]
        if kind == 'ordinal':
            reference['index'] = 1
        assert not validate_operation(name, {**minimal(op), 'reference': reference}), (name, kind)


@pytest.mark.parametrize('field', ['changes', 'add_items'])
def test_unknown_nested_order_field_is_protocol_error_before_preview(runtime, monkeypatch, field):
    from src.agents import order_management
    monkeypatch.setattr(order_management, 'prepare', lambda *a, **k: pytest.fail('malformed patch reached business preview'))
    value = minimal(REGISTRY['semantic_prepare_order_update'])
    value[field] = [{'order_line_id': 1, 'quantity': 2, 'override_total': 0}] if field == 'changes' else [
        {'product_id': '101', 'quantity': 1, 'override_total': 0}]
    assert not validate_operation('semantic_prepare_order_update', value)
    result = universe(runtime).semantic_calls(calls(('semantic_prepare_order_update', value)))[0]
    assert result['recovery_kind'] == 'model_repair' and not runtime.writes
