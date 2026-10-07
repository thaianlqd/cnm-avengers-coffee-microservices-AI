"""Exact customer-meaning contracts. No provider chooses a business executor.

Schemas, mapping, commitment policy, exposure and repair hints derive from this
registry. Business schemas are a second, independent authority boundary.
"""
from copy import deepcopy
from dataclasses import dataclass
from functools import lru_cache

COMMITMENTS = ('SELECTED', 'AFFIRMED', 'REJECTED', 'NEGATED', 'QUESTION',
               'HYPOTHETICAL', 'CONDITIONAL', 'CORRECTION', 'UNKNOWN')
COMMITTING = ('SELECTED', 'AFFIRMED', 'CORRECTION')
STRING = {'type': 'string', 'minLength': 1}
SCOPE = {'type': 'string', 'enum': ['drink', 'food', 'all']}
COUNT = {'type': 'integer', 'minimum': 1, 'maximum': 16}


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


def reference_schema(namespace):
    kinds = ['id', 'name', 'ordinal', 'focus', 'pending', 'singleton']
    if namespace == 'ORDER':
        kinds.append('recent')
    if namespace == 'VOUCHER':
        kinds.append('best')
    if namespace == 'LOCATION':
        kinds = ['literal']
    props = {'kind': {'type': 'string', 'enum': kinds}, 'value': STRING,
             'index': {'type': 'integer', 'minimum': 1}}
    if namespace == 'PRODUCT':
        props['scope'] = {'type': 'string', 'enum': ['drink', 'food']}
    return closed(props, ('kind',))


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
            props['reference'] = reference_schema(self.namespace)
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
                          if self.namespace == 'PRODUCT' else 'A: no optional category-ID restriction within explicit scope.')
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
            decline=False, description='', omissions=None):
        actual_access = access or CAPABILITIES[executor].access
        commitments = (('AFFIRMED',) if actual_access == 'FINAL_WRITE' else
            COMMITTING + (('REJECTED',) if decline else ()) if actual_access == 'WRITE' else ('QUESTION',))
        data = {key: semantic_fields(business[executor]['properties'][key]) for key in take}
        data.update(deepcopy(fields or {}))
        op = SemanticOperation(name, executor, actual_access, namespace, facet or name.lower(),
            data, tuple(required), target, commitments, tuple(fixed), tuple(renames), intent,
            description or name.replace('_', ' ').capitalize(),
            omissions or ('Optional read pagination uses bounded business limits; optional filters leave only the explicitly chosen scope unrestricted.' if actual_access == 'READ' else
                'Omitted optional fields preserve authoritative state. No implicit payment, fulfillment, voucher, address or branch choice.'),
            CAPABILITIES[executor].preconditions)
        registry[op.function_name] = op

    discovery = {'scope': SCOPE, 'product_family': {'type': 'string'}, 'requested_count': COUNT,
                 'exclude_previous': {'type': 'boolean'},
                 'planned_discovery_reads': {'type': 'integer', 'minimum': 1, 'maximum': 16}}
    rename = (('scope', 'category'), ('product_family', 'search_text'), ('requested_count', 'limit'))
    add('DISCOVER_PRODUCTS', 'filter_catalog', fields=discovery, required=('scope',),
        take=('min_price', 'max_price', 'min_price_inclusive', 'max_price_inclusive'),
        namespace='MENU_CATEGORY', facet='discovery', renames=rename,
        fixed=(('sort_by', 'price_asc'),), description='Find named products/families in Menu; discovery alone never selects.')
    add('RECOMMEND_BY_PREFERENCE', 'get_recommendations', fields={**discovery,
        'concepts': {'type': 'array', 'minItems': 1, 'maxItems': 4,
                     'items': {**STRING, 'maxLength': 80}}}, required=('scope', 'concepts'),
        facet='preference', renames=(('scope', 'category'), ('product_family', 'search_text'),
        ('requested_count', 'top_k')), fixed=(('criteria', 'preferences'),),
        description='Recommend using approved description evidence for every supplied preference concept; no sales fallback.')
    for name, sort in [('RANK_BY_SALES', 'sold_desc'), ('RANK_BY_PRICE', None), ('DISCOVER_NEW_PRODUCTS', 'new')]:
        fields = deepcopy(discovery)
        if sort is None:
            fields['direction'] = {'type': 'string', 'enum': ['ascending', 'descending']}
        take = ('period', 'period_anchor') if sort == 'sold_desc' else ()
        add(name, 'filter_catalog', fields=fields, take=take,
            required=('scope', 'direction') if sort is None else ('scope', 'period') if sort == 'sold_desc' else ('scope',),
            facet=name.lower(), renames=rename, fixed=(('sort_by', sort),) if sort else ())
    add('RANK_BY_RATING', 'get_recommendations', fields=discovery, required=('scope',),
        renames=(('scope', 'category'), ('product_family', 'search_text'), ('requested_count', 'top_k')),
        fixed=(('criteria', 'rating'),))
    add('READ_MENU', 'get_menu_categories', facet='menu')
    add('SELECT_PRODUCT', 'get_product_options', namespace='PRODUCT', target=True,
        access='WRITE', fields={'quantity': {'type': 'integer', 'minimum': 1, 'maximum': 999}},
        facet='product_selection', intent='SELECT', description='Choose a canonical product and stage it; inspect Menu choices without committing cart.',
        omissions='Quantity omitted: retain quantity for the same selected draft, otherwise one unit. Options are not default-authorized by selection.')
    add('ASK_PRODUCT_OPTIONS', 'get_product_options', namespace='PRODUCT', target=True,
        facet='product_options', description='Read Menu option groups only. Never select, configure or add.')
    options = {key: semantic_fields(value) for key, value in business['add_to_cart']['properties'].items()
               if key in {'size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua', 'quantity'}}
    add('CONFIGURE_PRODUCT', 'add_to_cart', fields=options, namespace='PRODUCT',
        facet='product_configuration', intent='CONFIGURE',
        description='Apply only options supplied or corrected now to the selected product. Omitted values retain prior choices; Menu validates options.',
        omissions='Omitted target means the unique selected pending product only. Supply only options corrected now; retain prior choices and quantity. Menu owns optional defaults.')
    add('USE_PRODUCT_DEFAULTS', 'add_to_cart', namespace='PRODUCT', intent='DEFAULTS',
        facet='product_defaults', description='Explicitly accept canonical Menu defaults for the selected product.',
        omissions='Omitted target means the unique pending product; Menu owns defaults. CORRECTION resets draft options.')
    add('DISCARD_PRODUCT_SELECTION', 'discard_pending_product', namespace='PRODUCT', target=True, decline=True)
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
        add(name, executor, namespace=ns, target=bool(ns), take=take, required=required,
            fields=fields, facet={'SET_PAYMENT': 'payment', 'SET_FULFILLMENT': 'fulfillment'}.get(name),
            access='FINAL_WRITE' if name in {'CONFIRM_CHECKOUT', 'CONFIRM_ORDER_CHANGE'} else None,
            decline=name in {'SKIP_VOUCHER', 'REMOVE_VOUCHER', 'DISCARD_ORDER_CHANGE', 'SELECT_PROFILE_ADDRESS'})
    return registry


def operations_for_context(context, allowed):
    """State-only exposure. No language classifier or extra provider call."""
    return [op for op in operation_registry().values() if op.executor in allowed]


def validate_operation(name, payload):
    op = operation_registry().get(name)
    if op is None or not _strict(payload, op.parameters()):
        return False
    ref = payload.get('reference')
    if ref is not None and not valid_reference(op.namespace, ref):
        return False
    if op.name == 'CONFIGURE_PRODUCT' and not any(k in payload for k in op.fields):
        return False
    return True


def valid_reference(namespace, ref):
    if not namespace or not isinstance(ref, dict) or not _strict(ref, reference_schema(namespace)):
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
            if valid_reference(op.namespace, ref):
                invalid['reference'] = {'namespace': op.namespace, **deepcopy(ref)}
        return invalid
    metadata = {'commitment', 'evidence', 'reference', 'exclude_previous', 'supplied_location', 'facet'}
    args = {key: deepcopy(value) for key, value in payload.items() if key not in metadata}
    for source, target in op.renames:
        if source in args:
            args[target] = args.pop(source)
    args.update(dict(op.fixed_args))
    if op.name == 'RECOMMEND_BY_PREFERENCE':
        concepts = args.pop('concepts')
        args.update(preference_concepts=concepts, preference_query=' '.join(concepts))
    if op.name == 'RANK_BY_PRICE':
        args['sort_by'] = {'ascending': 'price_asc', 'descending': 'price_desc'}[args.pop('direction')]
    quantity = args.pop('quantity', None) if op.name == 'SELECT_PRODUCT' else None
    action = {'tool': op.executor, 'args': args, 'operation': name,
              'semantic_payload': deepcopy(payload), 'commitment': payload.get('commitment', 'QUESTION'),
              'evidence': payload.get('evidence', ''), 'facet': payload.get('facet', op.facet)}
    if op.namespace:
        action['reference'] = {'namespace': op.namespace, **payload.get('reference', {'kind': 'pending'})}
    if op.option_intent:
        action['option_intent'] = op.option_intent
    if quantity is not None:
        action['selection_quantity'] = quantity
    if op.name == 'USE_PRODUCT_DEFAULTS':
        action['defaults_evidence'] = payload['evidence']
    for field in ('exclude_previous', 'supplied_location'):
        if field in payload:
            action[field] = payload[field]
    # Option reads can never stage a product, regardless of the wire commitment.
    if op.name == 'ASK_PRODUCT_OPTIONS':
        action['commitment'] = 'QUESTION'
    return action
