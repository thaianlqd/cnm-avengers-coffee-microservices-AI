"""Exact customer-meaning contracts. No provider chooses a business executor.

Schemas, mapping, commitment policy, exposure and repair hints derive from this
registry. Business schemas are a second, independent authority boundary.
"""
from copy import deepcopy
from dataclasses import dataclass
from functools import lru_cache
from src.agents.semantic_progress import PROGRESS_POLICIES, GOAL_FAMILIES, PROGRESS_ROLES

COMMITMENTS = ('SELECTED', 'AFFIRMED', 'REJECTED', 'NEGATED', 'QUESTION',
               'HYPOTHETICAL', 'CONDITIONAL', 'CORRECTION', 'UNKNOWN')
COMMITTING = ('SELECTED', 'AFFIRMED', 'CORRECTION')
STRING = {'type': 'string', 'minLength': 1}
SCOPE = {'type': 'string', 'enum': ['drink', 'food', 'all']}
COUNT = {'type': 'integer', 'minimum': 1, 'maximum': 16}
COMMON_REFERENCES = ('id', 'name', 'ordinal', 'focus', 'singleton')
NAMESPACE_REFERENCES = {name: COMMON_REFERENCES for name in (
    'CART_LINE', 'BRANCH', 'LOCATION_CANDIDATE', 'PROFILE_ADDRESS',
    'PAYMENT', 'FULFILLMENT', 'MENU_CATEGORY')}
NAMESPACE_REFERENCES.update(PRODUCT=COMMON_REFERENCES + ('pending',),
    ORDER=COMMON_REFERENCES + ('recent',), VOUCHER=COMMON_REFERENCES + ('best',),
    LOCATION=('literal',))


def exposure_facts(context):
    """Facts only: no user text or language interpretation enters exposure."""
    state = context.get('business') or {}
    checkout, visible = state.get('checkout') or {}, context.get('visible') or {}
    return {
        'always': True,
        'draft_selection': bool(state.get('cart_verified') and
            (state.get('authenticated') or state.get('guest_session_id')) and not checkout.get('checkout_submission')),
        'pending_product': bool(state.get('pending_products')),
        'saved_addresses': bool(checkout.get('profile_location_offer') or
            context.get('profile_address_candidates_available') or visible.get('profile_addresses')),
        'location_candidates': bool(visible.get('location_candidates')),
        'branch_candidates': bool(visible.get('branches')),
        'owned_order': bool(visible.get('orders') or checkout.get('order_management_focus') or checkout.get('order_management_action')),
        'order_preview': bool(checkout.get('order_management_action')),
        'order_draft': bool(checkout.get('order_management_action') or checkout.get('order_management_focus')),
    }


def closed(properties=None, required=()):
    return {'type': 'object', 'properties': deepcopy(properties or {}),
            'required': list(required), 'additionalProperties': False}


def semantic_fields(value):
    """Keep structural constraints, without copying executor instructions."""
    if isinstance(value, dict):
        return {key: semantic_fields(item) for key, item in value.items()
                if key not in {'description', 'default'}}
    if isinstance(value, list):
        return [semantic_fields(item) for item in value]
    return value


def reference_schema(namespace, kinds=None):
    props = {'kind': {'type': 'string', 'enum': list(kinds or NAMESPACE_REFERENCES[namespace])}, 'value': STRING,
             'index': {'type': 'integer', 'minimum': 1}}
    required = ['kind']
    if namespace == 'LOCATION':
        props.pop('index')
        required.append('value')
    if namespace == 'PRODUCT':
        props['scope'] = {'type': 'string', 'enum': ['drink', 'food']}
    return closed(props, required)


@dataclass(frozen=True)
class SemanticOperation:
    name: str
    executor: str
    access: str
    namespace: str | None
    facet: str
    fields: dict
    required: tuple = ()
    target_required: bool = False
    allowed_commitments: tuple = COMMITMENTS
    fixed_args: tuple = ()
    renames: tuple = ()
    option_intent: str | None = None
    description: str = ''
    omissions: str = 'Only optional neutral fields may be omitted; never invent a customer choice.'
    preconditions: str = 'State exposure and authoritative business gateway must both permit execution.'
    repair_classification: str = 'model_repair'
    implicit_reference_kind: str | None = None
    implicit_reference_precondition: str | None = None
    allowed_reference_kinds: tuple = ()
    exposure_policy: str = 'always'
    joined_args: tuple = ()
    value_mappings: tuple = ()
    metadata_mappings: tuple = ()
    require_any_fields: tuple = ()
    goal_family: str = ''
    progress_role: str = ''
    state_effect: str = ''
    terminal_for_goal: bool = False
    repair_prerequisites: tuple = ()
    repair_compatible_goals: tuple = ()

    def exposed(self, context):
        return exposure_facts(context)[self.exposure_policy]

    @property
    def function_name(self):
        return 'semantic_' + self.name.lower()

    def parameters(self):
        # A READ function already declares its nonmutating meaning; no model
        # commitment/evidence negotiation is needed. Writes quote current evidence.
        props = deepcopy(self.fields)
        required = list(self.required)
        if self.access != 'READ':
            props = {'commitment': {'type': 'string', 'enum': list(self.allowed_commitments)},
                     'evidence': {'type': 'string', 'minLength': 1}, **props}
            required = ['commitment', 'evidence', *required]
        if self.namespace:
            props['reference'] = reference_schema(self.namespace, self.allowed_reference_kinds)
            if self.target_required:
                required.append('reference')
        return closed(props, required)

    def schema(self):
        return {'type': 'function', 'function': {'name': self.function_name,
            'description': self.description,
            'parameters': self.parameters()}}

    def repair_hint(self):
        return (f'Repair only {self.function_name}; required fields: '
                f'{", ".join(self.parameters()["required"])}. Keep meaning/facet/target; '
                'server retains sibling actions and successful writes.')

    def omission_policies(self):
        """Document every optional wire field; required meaning has no default."""
        policies = {}
        for field in sorted(self.parameters()['properties'].keys() - set(self.parameters()['required'])):
            if field in {'requested_count', 'limit'}:
                policy = 'A: bounded read pagination (business default 5), never a selected quantity.'
            elif field == 'product_family':
                policy = 'A: no narrower family filter, within the REQUIRED explicit scope.'
            elif field in {'min_price', 'max_price', 'period_anchor'}:
                policy = 'A: no optional bound; period anchor uses current Vietnam calendar within REQUIRED period.'
            elif field in {'min_price_inclusive', 'max_price_inclusive'}:
                policy = 'A: inclusive optional price bound.'
            elif field in {'planned_discovery_reads', 'exclude_previous'}:
                policy = 'A: presentation planning only; no new semantic scope or selection.'
            elif field == 'reference':
                policy = ('A: unique selected pending product only; multiple/none cannot invent a target.'
                          if self.implicit_reference_kind == 'pending' else 'A: omission means NO entity target; retain explicit filter scope only.')
            elif field == 'quantity':
                policy = ('A: remove the explicitly targeted whole line.' if self.name == 'REMOVE_CART_LINE' else
                          'A: retain selected draft quantity; otherwise one unit of the explicitly selected product.'
                          if self.name in {'SELECT_PRODUCT', 'CONFIGURE_PRODUCT'} else 'A: quote one unit only; read cannot mutate quantity.')
            elif field in {'size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua'}:
                policy = 'A: retain selected values; only canonical Menu optional/fixed defaults fill gaps; required choices remain pending.'
            elif field == 'supplied_location':
                policy = 'A: may offer a saved address, never select/confirm it.'
            elif field == 'reuse_summary':
                policy = 'A: prepare fresh summary only; never confirm or place an order.'
            elif field in {'changes', 'add_items', 'delivery_address', 'delivery_slot', 'note', 'reason'}:
                policy = 'A: no change to omitted order facet; empty update is rejected by business preview policy.'
            else:
                policy = 'A: optional read question refinement; no consequential choice default.'
            policies[field] = policy
        return policies


def _strict(value, spec):
    from src.agents.tool_capabilities import validate_args
    if not validate_args(value, spec):
        return False
    kind = spec.get('type')
    if kind == 'integer' and type(value) is not int:
        return False
    if kind == 'number' and type(value) not in (int, float):
        return False
    if kind == 'string' and (len(value.strip()) < spec.get('minLength', 0) or len(value) > spec.get('maxLength', 2000)):
        return False
    if kind == 'object':
        return all(_strict(v, spec['properties'][k]) for k, v in value.items())
    if kind == 'array':
        return all(_strict(v, spec['items']) for v in value)
    return True


@lru_cache(maxsize=1)
def operation_registry():
    from src.agents.tool_capabilities import tool_schemas, CAPABILITIES
    from src.agents.semantic_control import provider_parameters
    business = {r['function']['name']: provider_parameters(r['function']['parameters'])
                for r in tool_schemas()}
    registry = {}

    def add(name, executor, *, fields=None, take=(), required=(), namespace=None,
            target=False, facet=None, access=None, fixed=(), renames=(), intent=None,
            decline=False, description='', omissions=None, implicit=None,
            reference_kinds=None, exposure='always', joined=(), values=(), metadata=(), require_any=()):
        actual_access = access or CAPABILITIES[executor].access
        commitments = (('AFFIRMED',) if actual_access == 'FINAL_WRITE' else
            COMMITTING + (('REJECTED',) if decline else ()) if actual_access == 'WRITE' else ('QUESTION',))
        data = {key: semantic_fields(business[executor]['properties'][key]) for key in take}
        data.update(deepcopy(fields or {}))
        op = SemanticOperation(name=name, executor=executor, access=actual_access,
            namespace=namespace, facet=facet or name.lower(), fields=data,
            required=tuple(required), target_required=target, allowed_commitments=commitments,
            fixed_args=tuple(fixed), renames=tuple(renames), option_intent=intent,
            description=description or name.replace('_', ' ').capitalize(),
            omissions=omissions or ('Optional read pagination uses bounded business limits; optional filters leave only the explicitly chosen scope unrestricted.' if actual_access == 'READ' else
                'Omitted optional fields preserve authoritative state. No implicit payment, fulfillment, voucher, address or branch choice.'),
            preconditions=CAPABILITIES[executor].preconditions,
            implicit_reference_kind=implicit,
            implicit_reference_precondition='unique_selected_pending_product' if implicit else None,
            allowed_reference_kinds=tuple(reference_kinds or (COMMON_REFERENCES if namespace == 'PRODUCT' and not implicit else NAMESPACE_REFERENCES.get(namespace, ()))),
            exposure_policy=exposure, joined_args=tuple(joined), value_mappings=tuple(values),
            metadata_mappings=tuple(metadata), require_any_fields=tuple(require_any),
            goal_family=PROGRESS_POLICIES[name].goal_family,
            progress_role=PROGRESS_POLICIES[name].progress_role,
            state_effect=PROGRESS_POLICIES[name].state_effect,
            terminal_for_goal=PROGRESS_POLICIES[name].terminal_for_goal,
            repair_prerequisites=tuple('semantic_' + n.lower() for n in PROGRESS_POLICIES[name].prerequisites),
            repair_compatible_goals=(PROGRESS_POLICIES[name].goal_family,))
        registry[op.function_name] = op

    discovery = {'scope': SCOPE, 'product_family': {'type': 'string'}, 'requested_count': COUNT,
                 'exclude_previous': {'type': 'boolean'},
                 'planned_discovery_reads': {'type': 'integer', 'minimum': 1, 'maximum': 16}}
    rename = (('scope', 'category'), ('product_family', 'search_text'), ('requested_count', 'limit'))
    add('DISCOVER_PRODUCTS', 'filter_catalog', fields=discovery, required=('scope',),
        take=('min_price', 'max_price', 'min_price_inclusive', 'max_price_inclusive'),
        namespace='MENU_CATEGORY', facet='discovery', renames=rename,
        fixed=(('sort_by', 'menu'),), description='Find named products/families in Menu with neutral name/ID ordering; optional category reference filters only. Never selects or ranks by price.')
    add('RECOMMEND_BY_PREFERENCE', 'get_recommendations', fields={**discovery,
        'concepts': {'type': 'array', 'minItems': 1, 'maxItems': 4,
                     'items': {**STRING, 'maxLength': 80}}}, required=('scope', 'concepts'),
        facet='preference', renames=(('scope', 'category'), ('product_family', 'search_text'),
        ('requested_count', 'top_k'), ('concepts', 'preference_concepts')),
        joined=(('preference_concepts', 'preference_query'),), fixed=(('criteria', 'preferences'),),
        description='Recommend using approved description evidence for every supplied preference concept; no sales fallback.')
    for name, sort in [('RANK_BY_SALES', 'sold_desc'), ('RANK_BY_PRICE', None), ('DISCOVER_NEW_PRODUCTS', 'new')]:
        fields = deepcopy(discovery)
        if sort is None:
            fields['direction'] = {'type': 'string', 'enum': ['ascending', 'descending']}
        take = ('period', 'period_anchor') if sort == 'sold_desc' else ()
        add(name, 'filter_catalog', fields=fields, take=take,
            required=('scope', 'direction') if sort is None else ('scope', 'period') if sort == 'sold_desc' else ('scope',),
            facet=name.lower(), renames=rename, fixed=(('sort_by', sort),) if sort else (),
            values=(('direction', 'sort_by', (('ascending', 'price_asc'), ('descending', 'price_desc'))),) if sort is None else ())
    add('RANK_BY_RATING', 'get_recommendations', fields=discovery, required=('scope',),
        renames=(('scope', 'category'), ('product_family', 'search_text'), ('requested_count', 'top_k')),
        fixed=(('criteria', 'rating'),))
    add('READ_MENU', 'get_menu_categories', facet='menu')
    add('SELECT_PRODUCT', 'get_product_options', namespace='PRODUCT', target=True,
        access='WRITE', fields={'quantity': {'type': 'integer', 'minimum': 1, 'maximum': 999}},
        facet='product_selection', intent='SELECT', description='Choose a canonical product and stage it; inspect Menu choices without committing cart.',
        exposure='draft_selection', metadata=(('quantity', 'selection_quantity'),),
        omissions='Quantity omitted: retain quantity for the same selected draft, otherwise one unit. Options are not default-authorized by selection.')
    add('ASK_PRODUCT_OPTIONS', 'get_product_options', namespace='PRODUCT', target=True,
        facet='product_options', description='Read Menu option groups only. Never select, configure or add.')
    options = {key: semantic_fields(value) for key, value in business['add_to_cart']['properties'].items()
               if key in {'size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua', 'quantity'}}
    add('CONFIGURE_PRODUCT', 'add_to_cart', fields=options, namespace='PRODUCT',
        facet='product_configuration', intent='CONFIGURE', implicit='pending',
        exposure='pending_product', require_any=tuple(options),
        description='Apply only options supplied or corrected now to the selected product. Omitted values retain prior choices; Menu validates options.',
        omissions='Omitted target means the unique selected pending product only. Supply only options corrected now; retain prior choices and quantity. Menu owns optional defaults.')
    add('USE_PRODUCT_DEFAULTS', 'add_to_cart', namespace='PRODUCT', intent='DEFAULTS',
        implicit='pending', exposure='pending_product', fixed=(('use_defaults', True),),
        metadata=(('evidence', 'defaults_evidence'),),
        facet='product_defaults', description='Explicitly accept canonical Menu defaults for the selected product.',
        omissions='Omitted target means the unique pending product; Menu owns defaults. CORRECTION resets draft options.')
    add('DISCARD_PRODUCT_SELECTION', 'discard_pending_product', namespace='PRODUCT', target=True, decline=True, exposure='pending_product')
    add('ASK_PRODUCT_FACT', 'get_product_description', namespace='PRODUCT', target=True,
        take=('query',), fields={'facet': {'type': 'string', 'enum': ['description', 'taste', 'ingredient', 'allergen']}},
        required=('facet',), facet='product_fact')
    add('ASK_PRODUCT_REVIEW', 'get_product_insights', namespace='PRODUCT', target=True, facet='review')
    add('ASK_PRODUCT_PRICE', 'check_price_and_stock', namespace='PRODUCT', target=True,
        take=tuple(key for key in business['check_price_and_stock']['properties']
                   if key in {'size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua', 'quantity'}), facet='price')
    add('ASK_KNOWLEDGE', 'search_knowledge_base', take=('query', 'domain'),
        required=('query', 'domain'), facet='knowledge')
    for name, executor, ns, take, required in [
        ('READ_CART', 'get_cart', None, (), ()),
        ('READ_CART_TOTAL', 'get_cart_quote', None, (), ()),
        ('UPDATE_CART_LINE', 'update_cart_item', 'CART_LINE', ('desired_state',), ('desired_state',)),
        ('REMOVE_CART_LINE', 'remove_cart_item', 'CART_LINE', ('quantity',), ()),
        ('FINISH_CART', 'finish_cart', None, (), ()),
        ('READ_ELIGIBLE_VOUCHERS', 'get_applicable_vouchers', None, (), ()),
        ('CHOOSE_VOUCHER', 'apply_voucher', 'VOUCHER', (), ()),
        ('SKIP_VOUCHER', 'skip_voucher', None, (), ()),
        ('REMOVE_VOUCHER', 'remove_voucher', None, (), ()),
        ('READ_PAYMENT_OPTIONS', 'get_payment_options', None, (), ()),
        ('SET_PAYMENT', 'set_payment_choice', 'PAYMENT', (), ()),
        ('SET_FULFILLMENT', 'set_fulfillment_choice', 'FULFILLMENT', (), ()),
        ('READ_PROFILE_ADDRESSES', 'get_user_profile', None, (), ()),
        ('RESOLVE_NEW_LOCATION', 'resolve_location', 'LOCATION', ('kind', 'for_checkout'), ('kind', 'for_checkout')),
        ('SELECT_PROFILE_ADDRESS', 'resolve_location', 'PROFILE_ADDRESS', ('kind', 'for_checkout'), ('kind', 'for_checkout')),
        ('SELECT_LOCATION_CANDIDATE', 'select_location_candidate', 'LOCATION_CANDIDATE', (), ()),
        ('FIND_NEARBY_BRANCHES', 'find_nearest_branch', None, ('location',), ('location',)),
        ('READ_BRANCHES', 'ask_branch', None, (), ()),
        ('SELECT_BRANCH', 'set_session_branch', 'BRANCH', (), ()),
        ('READ_BRANCH_RATINGS', 'get_top_rated_stores', None, (), ()),
        ('ASK_BRANCH_REVIEW', 'get_store_reviews', 'BRANCH', (), ()),
        ('COMPARE_BRANCH_REVIEWS', 'compare_branch_reviews', None, ('branch_ids',), ('branch_ids',)),
        ('PREPARE_CHECKOUT', 'request_checkout', None, ('reuse_summary',), ()),
        ('CONFIRM_CHECKOUT', 'confirm_checkout', None, (), ()),
        ('READ_ORDER_HISTORY', 'get_order_history', None, ('limit',), ()),
        ('READ_ORDER', 'get_order_details', 'ORDER', (), ()),
        ('TRACK_ORDER', 'track_order_status', 'ORDER', (), ()),
        ('PREPARE_ORDER_CANCEL', 'cancel_order', 'ORDER', ('reason',), ()),
        ('PREPARE_ORDER_UPDATE', 'update_order', 'ORDER', ('changes', 'add_items', 'delivery_address', 'delivery_slot', 'note'), ()),
        ('PREPARE_REORDER', 'reorder_order', 'ORDER', (), ()),
        ('CONFIRM_ORDER_CHANGE', 'confirm_order_change', None, (), ()),
        ('DISCARD_ORDER_CHANGE', 'discard_order_change', None, (), ()),
    ]:
        fields = {'supplied_location': {'type': 'boolean'}} if name == 'SET_FULFILLMENT' else {}
        exposure = {'SELECT_PROFILE_ADDRESS': 'saved_addresses', 'SELECT_LOCATION_CANDIDATE': 'location_candidates',
            'SELECT_BRANCH': 'branch_candidates', 'PREPARE_ORDER_CANCEL': 'owned_order',
            'PREPARE_ORDER_UPDATE': 'owned_order', 'PREPARE_REORDER': 'owned_order',
            'CONFIRM_ORDER_CHANGE': 'order_preview', 'DISCARD_ORDER_CHANGE': 'order_draft'}.get(name, 'always')
        add(name, executor, namespace=ns, target=bool(ns), take=take, required=required,
            exposure=exposure,
            fields=fields, facet={'SET_PAYMENT': 'payment', 'SET_FULFILLMENT': 'fulfillment'}.get(name),
            access='FINAL_WRITE' if name in {'CONFIRM_CHECKOUT', 'CONFIRM_ORDER_CHANGE'} else None,
            decline=name in {'SKIP_VOUCHER', 'REMOVE_VOUCHER', 'DISCARD_ORDER_CHANGE', 'SELECT_PROFILE_ADDRESS'})
    assert {op.name for op in registry.values()} == set(PROGRESS_POLICIES), 'Missing explicit operation progress metadata'
    validate_registry(registry)
    return registry


def validate_registry(registry):
    """Reject undocumented implicit behavior before advertising any schema."""
    for op in registry.values():
        assert op.goal_family in GOAL_FAMILIES and op.progress_role in PROGRESS_ROLES and op.state_effect, op.name
        assert op.repair_compatible_goals == (op.goal_family,), op.name
        assert all(n.removeprefix('semantic_').upper() in PROGRESS_POLICIES for n in op.repair_prerequisites), op.name
        assert op.function_name not in op.repair_prerequisites, op.name
        assert set(op.allowed_reference_kinds) <= set(NAMESPACE_REFERENCES.get(op.namespace, ())), op.name
        assert op.exposure_policy in exposure_facts({}), op.name
        if op.implicit_reference_kind is not None:
            assert (op.namespace, op.implicit_reference_kind, op.implicit_reference_precondition) == (
                'PRODUCT', 'pending', 'unique_selected_pending_product'), op.name
            assert op.implicit_reference_kind in op.allowed_reference_kinds and not op.target_required, op.name
        else:
            assert op.implicit_reference_precondition is None, op.name
        assert not op.namespace or op.allowed_reference_kinds, op.name


def operations_for_context(context, allowed):
    """State-only exposure. No language classifier or extra provider call."""
    return [op for op in operation_registry().values() if op.executor in allowed and op.exposed(context)]


def validate_operation(name, payload):
    op = operation_registry().get(name)
    if op is None or not _strict(payload, op.parameters()):
        return False
    ref = payload.get('reference')
    if ref is not None and not valid_reference(op.namespace, ref, op.allowed_reference_kinds):
        return False
    if op.require_any_fields and not any(k in payload for k in op.require_any_fields):
        return False
    return True


def valid_reference(namespace, ref, kinds=None):
    if not namespace or not isinstance(ref, dict) or not _strict(ref, reference_schema(namespace, kinds)):
        return False
    kind = ref.get('kind')
    # Conditional reference grammar is enforced server-side using the same registry.
    if kind in {'id', 'name', 'literal'} and not ref.get('value', '').strip():
        return False
    if kind == 'ordinal' and 'index' not in ref:
        return False
    if 'value' in ref and kind not in {'id', 'name', 'literal'} or 'index' in ref and kind != 'ordinal':
        return False
    if 'scope' in ref and namespace != 'PRODUCT':
        return False
    return True


def materialize_operation(name, payload):
    """Interpret no text. Map validated semantic fields to one executor proposal."""
    op = operation_registry().get(name)
    if not validate_operation(name, payload):
        invalid = {'tool': op.executor if op else None, 'operation': name,
                'semantic_payload': deepcopy(payload), 'invalid_wire_action': True,
                'facet': (payload.get('facet', op.facet) if isinstance(payload, dict) else op.facet) if op else None,
                'commitment': 'UNKNOWN', 'args': {}}
        # A bad patch does not revoke a separately valid target. Preserve
        # it for entry-snapshot binding; no malformed payload can execute.
        if op and op.namespace and isinstance(payload, dict):
            ref = payload.get('reference')
            if valid_reference(op.namespace, ref, op.allowed_reference_kinds):
                invalid['reference'] = {'namespace': op.namespace, **deepcopy(ref)}
        return invalid
    metadata = {'commitment', 'evidence', 'reference', 'exclude_previous', 'supplied_location', 'facet'}
    metadata.update(source for source, _ in op.metadata_mappings)
    args = {key: deepcopy(value) for key, value in payload.items() if key not in metadata}
    for source, target in op.renames:
        if source in args:
            args[target] = args.pop(source)
    args.update(dict(op.fixed_args))
    for source, target in op.joined_args:
        args[target] = ' '.join(args[source])
    for source, target, mapping in op.value_mappings:
        args[target] = dict(mapping)[args.pop(source)]
    action = {'tool': op.executor, 'args': args, 'operation': name,
              'semantic_payload': deepcopy(payload), 'commitment': payload.get('commitment', 'QUESTION'),
              'evidence': payload.get('evidence', ''), 'facet': payload.get('facet', op.facet)}
    reference = payload.get('reference')
    if reference is None and op.implicit_reference_kind:
        reference = {'kind': op.implicit_reference_kind}
    if reference is not None:
        action['reference'] = {'namespace': op.namespace, **deepcopy(reference)}
    if op.option_intent:
        action['option_intent'] = op.option_intent
    for source, target in op.metadata_mappings:
        if source in payload:
            action[target] = deepcopy(payload[source])
    for field in ('exclude_previous', 'supplied_location'):
        if field in payload:
            action[field] = payload[field]
    return action


INTERRUPT_NAME = 'semantic_interrupt'


def interrupt_schema():
    return {'type': 'function', 'function': {'name': INTERRUPT_NAME,
        'description': 'Safely switch semantic domain for THIS user turn. No business side effect or completion. Preserve drafts; next inference must call a function in target_domain. Cannot abandon an unfinished execution plan.',
        'parameters': closed({'target_domain': {'type': 'string', 'enum': list(GOAL_FAMILIES)}}, ('target_domain',))}}


def validate_interrupt(payload):
    return _strict(payload, interrupt_schema()['function']['parameters'])
