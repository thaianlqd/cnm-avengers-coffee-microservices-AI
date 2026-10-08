"""LLM = meaning. Server = references, prerequisites, workflow and presentation.

The command list is validated and every mutation reference is bound before the
first draft/business write. Business failures stop the remaining commands;
unknown writes escape to the existing durable HTTP reconciliation boundary.
"""
from copy import deepcopy
import json
import logging
import time

from src.agents.agent_context import build_context, business_state
from src.agents.agent_memory import ConversationMemory, safe_text
from src.agents.hybrid_command_schema import READ_INTENTS, validate_envelope
from src.agents.hybrid_semantic_interpreter import interpret
from src.agents.hybrid_workflow import TurnContext, GroundingError, ground, identity, next_required_milestone
from src.agents.tool_artifacts import ToolArtifacts, public_result
from src.agents.tool_policy import GuardedToolGateway, MutationOutcomeUnknown
from src.common import cart_manager
from src.function_calling.tools import TOOL_EXECUTORS, cart_tools, voucher_tools
from src.agents.semantic_protocol import digest
from src.agents.hybrid_provider_budget import ProviderBudget
from src.agents.hybrid_diagnostics import record as diagnose

logger = logging.getLogger(__name__)
SUCCESS = {'ok', 'success', 'already_processed', 'require_confirmation', 'needs_options',
           'need_address_precision', 'need_location_selection', 'need_branch_selection', 'ambiguous', 'need_city'}
CHECKOUT_PROGRESS = {'SET_PAYMENT', 'SET_FULFILLMENT', 'SELECT_BRANCH', 'PROVIDE_LOCATION',
    'SELECT_PROFILE_ADDRESS', 'SELECT_LOCATION_CANDIDATE', 'FINISH_CART', 'CHOOSE_VOUCHER',
    'SKIP_VOUCHER', 'REMOVE_VOUCHER', 'EDIT_CART', 'CONFIGURE_PRODUCT', 'SELECT_PRODUCTS'}
OPTION_FIELDS = {'size': 'size', 'toppings': 'toppings', 'ice': 'luong_da',
                 'sweetness': 'do_ngot', 'milk': 'loai_sua'}
FULFILLMENT = {'delivery': 'GIAO_TAN_NOI', 'pickup': 'MANG_DI', 'dine_in': 'TAI_CHO'}


def options(values):
    return {OPTION_FIELDS[key]: value for key, value in values.items()}


def clicked_reference(row, snapshot):
    if snapshot.collection()['numbering'] != 'grouped':
        return {'kind': 'ordinal', 'index': row['display_index']}
    if row.get('menu_bucket') in {'drink', 'food'}:
        return {'kind': 'group_ordinal', 'group': row['menu_bucket'], 'index': row['group_display_index']}
    return {'kind': 'name', 'value': row['product_name']}


class CommerceDispatch:
    """Small server command dispatcher; never supplies an executor to the model."""
    def __init__(self, gateway, turn):
        self.gateway, self.turn = gateway, turn
        self.internal_reads = 0

    def fact(self, tool, args):
        # Private prerequisites are not a new ordinal universe or a command.
        self.internal_reads += 1
        try:
            result = TOOL_EXECUTORS[tool](args, self.gateway.session_id)
        except Exception as exc:
            logger.warning('[HybridDispatch] prerequisite=%s error_type=%s', tool, type(exc).__name__)
            result = {'status': 'business_unavailable'}
        logger.info('[HybridDispatch] %s', json.dumps({'phase': 'prerequisite', 'business_operation': tool,
            'result_status': result.get('status'), 'read_count': self.internal_reads}))
        return result

    def bind(self, domain, ref, intent, rows=None, path=None):
        return ground(self.turn, domain, ref, rows=rows, intent=intent, user_message=self.gateway.user_message,
                      reference_path=path)

    def product(self, ref, intent, path=None):
        rows = self.turn.rows('products')
        if ref['kind'] in {'name', 'id', 'focus', 'singleton'}:
            rows += self.turn.product_display_snapshot.collection('drink')['rows'] + self.turn.product_display_snapshot.collection('food')['rows']
        if ref['kind'] in {'name', 'id', 'focus', 'singleton'}:
            rows += self.turn.rows('pending_products') + self.turn.rows('cart_lines')
            focus = self.turn.product_display_snapshot.focus
            if focus:
                rows.append(focus)
        if ref['kind'] == 'name' and not any(r.get('product_name', '').casefold() == ref['value'].casefold() for r in rows):
            found = self.fact('filter_catalog', {'category': 'all', 'search_text': ref['value'], 'limit': 16})
            rows += found.get('products') or []
        row = self.bind('products', ref, intent, rows, path)
        self.gateway.artifacts.product_candidates[str(row['product_id'])] = deepcopy(row)
        return row

    def order(self, ref, intent):
        if ref['kind'] == 'name':
            # Existing orders have canonical IDs, not fuzzy customer names.
            ref = {'kind': 'id', 'value': ref['value']}
        rows = self.turn.rows('orders')
        checkout = self.turn.state.get('checkout') or {}
        if ref['kind'] == 'focus' and self.turn.focus.get('order', {}).get('order_id'):
            rows.append(self.turn.focus['order'])
        if ref['kind'] == 'last_created' and checkout.get('last_created_order_id'):
            rows.append({'order_id': checkout['last_created_order_id']})
        for key in ('order_management_focus', 'order_management_action'):
            if (checkout.get(key) or {}).get('order_id'):
                rows.append({'order_id': checkout[key]['order_id']})
        if ref['kind'] == 'id':
            # Verify literal presence before the owned service is consulted.
            row = self.bind('orders', ref, intent, rows + [{'order_id': ref['value']}])
            from src.agents.order_management import details
            if details(self.gateway.session_id, row['order_id']).get('status') != 'ok':
                raise GroundingError('order_not_owned_or_available', 'orders')
            return row
        return self.bind('orders', ref, intent, rows)

    def payment(self, ref, intent):
        from src.agents.checkout_choices import PAYMENT_OPTIONS, PAYMENT_LABELS, PAYMENT_ALIASES
        rows = self.turn.rows('payment_options')
        if ref['kind'] == 'name':
            rows += [{'code': code, 'label': label, 'aliases': PAYMENT_ALIASES[code]}
                     for code, label in zip(PAYMENT_OPTIONS, PAYMENT_LABELS)]
            matches = [r for r in rows if ref['value'].casefold() in
                       [str(v).casefold() for v in (r.get('code'), r.get('value'), r.get('label'), *(r.get('aliases') or []))]]
            row = self.bind('payment_options', {'kind': 'singleton'}, intent, matches)
        else:
            row = self.bind('payment_options', ref, intent, rows)
        return row

    def preflight(self, commands):
        """Ground the entire ordered envelope. No cart, checkout or draft writes."""
        bound, selected, configured = [], [], set()
        for command_index, command in enumerate(commands):
            intent, args = command['intent'], deepcopy(command['args'])
            item = {'intent': intent, 'args': args}
            if intent == 'READ_MENU' and args.get('target'):
                from src.agents.hybrid_menu import resolve
                item['row'] = resolve(self, args['target'], intent)
                if args.get('scope', 'all') not in {'all', item['row']['menu_bucket']}:
                    raise GroundingError('menu_category_scope_conflict', 'menu_categories')
            elif intent in {'DISCOVER_PRODUCTS', 'REFINE_DISCOVERY', 'RECOMMEND_PRODUCTS'}:
                from src.agents.hybrid_menu import bind_discovery
                if intent == 'REFINE_DISCOVERY':
                    from src.agents.hybrid_discovery import merge
                    merged, error = merge(self.turn.state.get('discovery_state') or {}, args)
                    if not error:
                        args = merged
                        item.update(args=args, discovery_prepared=True)
                if args.get('menu_category'):
                    item['args'], item['category'] = bind_discovery(self, args, intent)
            elif intent == 'SELECT_PRODUCTS':
                if args['mode'] == 'ALL_VISIBLE':
                    rows = self.turn.rows('products')
                    if not 1 <= len(rows) <= 16:
                        raise GroundingError('visible_selection_required', 'products')
                    if not self.turn.product_display_snapshot.collection()['valid']:
                        raise GroundingError('unknown_reference', 'products')
                    # The exact frozen global display, without aliasing local
                    # group numbers or including retained historical groups.
                    for row in rows:
                        # ALL_VISIBLE is already an explicit choice of this
                        # entire immutable list, including any other Menu group.
                        # No synthetic ordinal (or retained group) is necessary.
                        self.bind('products', {'kind': 'singleton'}, intent, rows=[row])
                    quantities = [1] * len(rows)
                else:
                    rows, errors = [], []
                    for ref_index, ref in enumerate(args['references']):
                        try:
                            rows.append(self.product(ref, intent, f'/commands/{command_index}/args/references/{ref_index}'))
                        except GroundingError as exc:
                            errors.append(exc)
                    if errors:
                        raise GroundingError(errors[0].code, 'products', [path for exc in errors for path in exc.paths])
                    quantities = [ref.get('quantity', 1) for ref in args['references']]
                ids = [identity('products', r) for r in rows]
                if len(ids) != len(set(ids)):
                    paths = [f'/commands/{command_index}/args/references/{i}' for i, key in enumerate(ids)
                             if ids.count(key) > 1] if args['mode'] == 'EXPLICIT' else []
                    raise GroundingError('duplicate_selection', 'products', paths)
                item['selections'] = [{'row': r, 'quantity': q} for r, q in zip(rows, quantities)]
                selected += rows
            elif intent in {'CONFIGURE_PRODUCT', 'DISCARD_PENDING_PRODUCT'}:
                ref = args.get('target') or {'kind': 'singleton'}
                rows = self.turn.rows('pending_products')
                if intent == 'CONFIGURE_PRODUCT':
                    rows += selected  # Explicit earlier selections; never fresh ordinals.
                item['row'] = self.bind('pending_products', ref, intent, rows)
                if intent == 'CONFIGURE_PRODUCT':
                    key = identity('pending_products', item['row'])
                    if key in configured:
                        raise GroundingError('conflicting_product_configuration', 'pending_products')
                    configured.add(key)
            elif intent == 'EDIT_CART':
                item['changes'] = [{**change, 'row': self.bind('cart_lines', change['target'], intent)}
                                   for change in args['changes']]
                ids = [identity('cart_lines', c['row']) for c in item['changes']]
                if len(ids) != len(set(ids)):
                    raise GroundingError('conflicting_cart_changes', 'cart_lines')
            elif intent == 'READ_PRODUCT_INFO' and (args.get('targets') or args.get('all_visible')):
                rows = ([self.product(ref, intent, f'/commands/{command_index}/args/targets/{i}')
                         for i, ref in enumerate(args['targets'])] if args.get('targets') else self.turn.rows('products'))
                if not rows or len(rows) > 16 or len({identity('products', r) for r in rows}) != len(rows):
                    raise GroundingError('visible_review_products_required', 'products')
                item['rows'] = rows
                for row in rows:
                    self.gateway.artifacts.product_candidates[str(row['product_id'])] = deepcopy(row)
            elif intent in {'READ_PRODUCT_INFO', 'ASK_KNOWLEDGE'} and args.get('target'):
                item['row'] = self.product(args['target'], intent, f'/commands/{command_index}/args/target')
            elif intent == 'CHOOSE_VOUCHER':
                if args.get('best'):
                    eligible = self.fact('get_applicable_vouchers', {})
                    rows = eligible.get('vouchers') or []
                    if eligible.get('status') != 'ok' or not rows:
                        raise GroundingError('no_eligible_voucher', 'vouchers')
                    item['row'] = max(rows, key=lambda r: float(r.get('so_tien_giam_du_kien') or 0))
                else:
                    ref = args['target']
                    rows = self.turn.rows('vouchers')
                    if ref['kind'] in {'id', 'name'}:
                        rows += self.fact('get_applicable_vouchers', {}).get('vouchers') or []
                    item['row'] = self.bind('vouchers', ref, intent, rows)
            elif intent == 'SET_PAYMENT':
                item['row'] = self.payment(args['target'], intent)
            elif intent in {'SELECT_LOCATION_CANDIDATE', 'SELECT_PROFILE_ADDRESS', 'SELECT_BRANCH'}:
                domain = {'SELECT_LOCATION_CANDIDATE': 'location_candidates',
                          'SELECT_PROFILE_ADDRESS': 'profile_addresses', 'SELECT_BRANCH': 'branches'}[intent]
                item['row'] = self.bind(domain, args['target'], intent)
            elif intent in {'READ_ORDER', 'PREPARE_ORDER_CHANGE', 'REORDER_ORDER'}:
                item['row'] = self.order(args['target'], intent)
                if args.get('changes'):
                    from src.agents.order_management import details
                    detail = details(self.gateway.session_id, item['row']['order_id'])
                    lines = (detail.get('order') or {}).get('chi_tiet') or []
                    item['changes'] = []
                    for change in args['changes']:
                        ref = change['target']
                        # Order-line namespace belongs to this owned order read,
                        # not a cart or a later displayed order history list.
                        matches = [r for i, r in enumerate(lines, 1) if
                            ref['kind'] == 'ordinal' and ref['index'] == i or
                            ref['kind'] == 'name' and str(r.get('ten_san_pham') or r.get('product_name', '')).casefold() == ref['value'].casefold() or
                            ref['kind'] == 'singleton' and len(lines) == 1 or
                            ref['kind'] == 'id' and str(r.get('id')) == ref['value'] and ref['value'] in self.gateway.user_message.split()]
                        if detail.get('status') != 'ok' or len(matches) != 1:
                            raise GroundingError('ambiguous_order_line', 'orders')
                        item['changes'].append({**change, 'row': matches[0]})
                    if len({c['row']['id'] for c in item['changes']}) != len(item['changes']):
                        raise GroundingError('conflicting_order_changes', 'orders')
            elif intent == 'READ_STORE_INFO' and args.get('target'):
                rows = self.turn.rows('branches')
                ref = args['target']
                if ref['kind'] in {'name', 'id'}:
                    rows += self.fact('get_store_info', {'search_text': ref['value']}).get('branches') or []
                item['row'] = self.bind('branches', ref, intent, rows)
            elif intent == 'COMPARE_BRANCH_REVIEWS':
                item['rows'] = [self.bind('branches', ref, intent) for ref in args['targets']]
            bound.append(item)
        for item in bound:
            if item['intent'] == 'SELECT_PRODUCTS':
                item['configure_later'] = configured
        return bound

    def call(self, intent, tool, args, row=None, *, choice=False, defaults=False, reset=False, facet=None, reference=None, **metadata):
        if tool in {'get_product_description', 'search_knowledge_base'}:
            self.gateway.artifacts.safety_facet = facet if facet in {'ingredient', 'allergen'} else None
        self.gateway.active_semantic = {'operation': 'CUSTOMER_COMMAND', 'tool': tool, 'args': args,
            'commitment': 'CORRECTION' if reset else 'AFFIRMED' if intent.startswith('CONFIRM_') else 'SELECTED' if choice else 'QUESTION',
            'canonical_target': row, 'option_intent': 'DEFAULTS' if defaults else 'CONFIGURE' if intent == 'CONFIGURE_PRODUCT' else 'SELECT',
            'facet': facet, 'reference': reference or {}, **metadata}
        try:
            result = self.gateway.dispatch(tool, args)
        except MutationOutcomeUnknown:
            diagnose('mutation_outcome_unknown', intents=[intent])
            logger.warning('[HybridDispatch] %s', json.dumps({'intent': intent, 'business_operation': tool,
                'failure_class': 'MUTATION_OUTCOME_UNKNOWN', 'result_status': 'requires_reconciliation', 'write': True}))
            raise
        logger.info('[HybridDispatch] %s', json.dumps({'intent': intent, 'business_operation': tool,
            'result_status': result.get('status'), 'write': tool in self.gateway.handlers and tool not in {
                'get_product_options', 'search_knowledge_base', 'get_product_description', 'get_cart_quote', 'get_payment_options', 'compare_branch_reviews'}}))
        return result

    def execute(self, item, supplied_location=False):
        intent, args, row = item['intent'], item['args'], item.get('row')
        call = lambda tool, values=None, **kw: self.call(intent, tool, values or {}, row, **kw)
        if intent == 'READ_MENU':
            from src.agents.hybrid_menu import read_menu
            return read_menu(self, item)
        if intent in {'DISCOVER_PRODUCTS', 'REFINE_DISCOVERY'}:
            from src.agents.hybrid_discovery import discover
            return discover(self, item)
        if intent == 'RECOMMEND_PRODUCTS':
            return call('get_recommendations', {'criteria': 'preferences', 'category': args['scope'],
                'search_text': args.get('family', ''), 'preference_query': ' '.join(args['concepts']),
                'preference_concepts': args['concepts'], 'top_k': args.get('count', 5),
                **({'category_id': item['category']['category_id']} if item.get('category') else {}),
                **{k: args[k] for k in ('min_price', 'max_price', 'min_price_inclusive', 'max_price_inclusive') if k in args}}, exclude_previous=args.get('exclude_previous', False))
        if intent == 'SELECT_PRODUCTS':
            results = []
            for selection in item['selections']:
                target = selection['row']
                self.gateway.artifacts.product_candidates[str(target['product_id'])] = target
                result = self.call(intent, 'get_product_options', {'product_id': str(target['product_id'])}, target,
                    choice=True, selection_quantity=selection['quantity'])
                if result.get('status') == 'ok' and str(target['product_id']) not in item.get('configure_later', set()):
                    from src.agents.option_state import option_schema_from_result, option_field
                    groups = option_schema_from_result(result)
                    # Fixed recipe fields are validated by the existing gateway;
                    # even a single optional topping is a customer choice.
                    if all(group.get('fixed') and option_field(group['name']) not in {None, 'toppings'} for group in groups):
                        result = self.call(intent, 'add_to_cart', {'product_id': str(target['product_id']),
                            'quantity': selection['quantity']}, target, choice=True)
                results.append(result)
                if result.get('status') not in SUCCESS:
                    break
            return results[-1]
        if intent == 'CONFIGURE_PRODUCT':
            return call('add_to_cart', {'product_id': str(row['product_id']), **options(args.get('options') or {}),
                **({'quantity': args['quantity']} if 'quantity' in args else {}),
                **({'use_defaults': True} if args.get('use_defaults') else {})}, choice=True,
                defaults=args.get('use_defaults', False), reset=args.get('reset_options', False))
        if intent == 'DISCARD_PENDING_PRODUCT':
            return call('discard_pending_product', {'product_id': str(row['product_id'])}, choice=True)
        if intent == 'EDIT_CART':
            for change in item['changes']:
                values = {'cart_item_id': identity('cart_lines', change['row'])}
                tool = 'remove_cart_item' if change['action'] == 'REMOVE' else 'update_cart_item'
                if tool == 'update_cart_item':
                    values['desired_state'] = {'quantity': change['quantity']} if change['action'] == 'SET_QUANTITY' else options(change['options'])
                result = self.call(intent, tool, values, change['row'], choice=True)
                if result.get('status') not in SUCCESS:
                    return result
            return result
        if intent == 'CHOOSE_VOUCHER':
            # Fresh eligibility is checked again inside the guarded write.
            self.gateway.artifacts.visible['vouchers'] = self.turn.rows('vouchers') or [row]
            return call('apply_voucher', {'voucher_code': identity('vouchers', row)}, choice=True,
                        reference={'kind': 'best'} if args.get('best') else args['target'])
        if intent == 'SET_FULFILLMENT':
            return call('set_fulfillment_choice', {'delivery_type': FULFILLMENT[args['mode']]}, choice=True, supplied_location=supplied_location)
        if intent == 'SET_PAYMENT':
            available = call('get_payment_options')
            code = identity('payment_options', row)
            current = next((r for r in available.get('payment_options') or [] if identity('payment_options', r) == code), None)
            if not current or current.get('enabled') is False:
                return {'status': 'payment_not_available', 'message': (current or {}).get('reason') or 'Phương thức này chưa khả dụng. Bạn chọn phương thức khác nhé.'}
            return call('set_payment_choice', {'payment_method': code}, choice=True,
                        reference={'namespace': 'PAYMENT', 'kind': 'name', 'value': code})
        if intent in {'PROVIDE_LOCATION', 'SELECT_PROFILE_ADDRESS'}:
            state = business_state(self.gateway.session_id)
            delivery = state['checkout'].get('delivery_type') == 'GIAO_TAN_NOI'
            if intent == 'SELECT_PROFILE_ADDRESS':
                if not self.gateway.entry_profile_offer and not args.get('replace'):
                    return {'status': 'profile_address_confirmation_required', 'message': 'Bạn chọn địa chỉ đã lưu để nhận hàng nhé.'}
                value, kind = row['full_address'], 'address'
                reference = {'namespace': 'PROFILE_ADDRESS', **args['target']}
            else:
                value, kind, reference = args['value'], args['kind'], {'namespace': 'READ_ONLY_LOCATION' if args.get('purpose') == 'nearby_branches' else 'LOCATION', 'kind': 'literal', 'value': args['value']}
            return call('resolve_location', {'location': value, 'kind': kind,
                'for_checkout': delivery and args.get('purpose') != 'nearby_branches'}, choice=True,
                reset=args.get('replace', False), reference=reference)
        if intent == 'SELECT_LOCATION_CANDIDATE':
            self.gateway.artifacts.visible['location_candidates'] = [deepcopy(row)]
            return call('select_location_candidate', {'candidate_id': row['candidate_id']}, choice=True)
        if intent == 'SELECT_BRANCH':
            self.gateway.artifacts.visible['branches'] = self.turn.rows('branches')
            return call('set_session_branch', {'branch_id': identity('branches', row)}, choice=True)
        if intent == 'READ_PRODUCT_INFO' and item.get('rows'):
            return call('get_products_reviews', {'product_ids': [str(r['product_id']) for r in item['rows']]})
        if intent in {'READ_PRODUCT_INFO', 'ASK_KNOWLEDGE'}:
            facet = args.get('facet', 'description')
            if intent == 'READ_PRODUCT_INFO' and facet in {'price', 'stock'}:
                return call('check_price_and_stock', {'product_name_query': row['product_name']})
            if intent == 'READ_PRODUCT_INFO' and facet == 'options':
                return call('get_product_options', {'product_id': str(row['product_id'])})
            if intent == 'READ_PRODUCT_INFO' and facet == 'reviews':
                return call('get_product_insights', {'product_name': row['product_name']})
            if row:
                return call('get_product_description', {'product_id': str(row['product_id']),
                    'query': args.get('query') or self.gateway.user_message}, facet=facet)
            if args.get('domain') in {'product_description', 'ingredient', 'product_faq'} or facet in {'ingredient', 'allergen'}:
                return {'status': 'product_reference_required', 'message': 'Bạn muốn hỏi về món nào? Bạn cho mình tên hoặc số trong danh sách nhé.'}
            return call('search_knowledge_base', {'query': args['query'],
                'domain': {'policy': 'ordering_policy', 'branches': 'contact'}.get(args['domain'], args['domain'])})
        if intent in {'READ_ORDER', 'REORDER_ORDER', 'PREPARE_ORDER_CHANGE'}:
            tool = {'READ_ORDER': 'get_order_details', 'REORDER_ORDER': 'reorder_order',
                    'PREPARE_ORDER_CHANGE': 'cancel_order' if args.get('action') == 'CANCEL' else 'update_order'}[intent]
            values = {'order_id': row['order_id']}
            if args.get('changes'):
                values['changes'] = [{'order_line_id': c['row']['id'],
                    **({'quantity': 0} if c['action'] == 'REMOVE' else {'quantity': c['quantity']} if c['action'] == 'SET_QUANTITY'
                       else {'options': options(c['options'])})} for c in item['changes']]
            if args.get('note'):
                values['note'] = args['note']
            return call(tool, values, choice=intent != 'READ_ORDER')
        if intent == 'READ_STORE_INFO':
            if args['facet'] == 'reviews':
                if row:
                    return call('get_store_reviews', {'branch_id': identity('branches', row)})
                return call('get_top_rated_stores')
            if args['facet'] in {'branches', 'hours'}:
                if item.get('location_read_result') is not None:
                    result = deepcopy(item['location_read_result'])
                    limit = args.get('count', 5)
                    result['branches'] = (result.get('branches') or [])[:limit]
                    self.gateway.artifacts.collect('get_store_info', {}, result)
                    return result
                return call('get_store_info', {'branch_id': identity('branches', row)} if row else
                    {('area' if args['facet'] == 'branches' else 'search_text'): args['query'], 'limit': args.get('count', 5)}
                    if args.get('query') else {'limit': args.get('count', 5)})
            return call('search_knowledge_base', {'query': args.get('query') or self.gateway.user_message,
                'domain': 'ordering_policy' if args['facet'] == 'policy' else 'contact'})
        if intent == 'COMPARE_BRANCH_REVIEWS':
            return call('compare_branch_reviews', {'branch_ids': [identity('branches', r) for r in item['rows']]})
        tool = {'READ_CART': 'get_cart_quote', 'FINISH_CART': 'finish_cart', 'LIST_VOUCHERS': 'get_applicable_vouchers',
                'SKIP_VOUCHER': 'skip_voucher', 'REMOVE_VOUCHER': 'remove_voucher', 'LIST_PAYMENT_OPTIONS': 'get_payment_options',
                'PREPARE_CHECKOUT': 'request_checkout', 'CONFIRM_CHECKOUT': 'confirm_checkout', 'LIST_ORDERS': 'get_order_history',
                'CONFIRM_ORDER_CHANGE': 'confirm_order_change', 'DISCARD_ORDER_CHANGE': 'discard_order_change'}[intent]
        return call(tool, {'limit': args.get('count', 5)} if intent == 'LIST_ORDERS' else {},
            choice=intent not in READ_INTENTS, informational=intent == 'LIST_PAYMENT_OPTIONS')


def render_command(artifacts, item, logs, result):
    """Present only server evidence for this command, preserving compound order."""
    if item['intent'] == 'SELECT_BRANCH' and item.get('following_discovery') and result.get('status') in {'ok', 'already_processed'}:
        from src.agents.product_information_presentation import literal
        name = item['row'].get('branch_name') or item['row'].get('ten_chi_nhanh') or 'chi nhánh này'
        return 'Dạ, mình đã chọn **' + literal(name, 200) + '**. Mình gửi bạn các món phù hợp với yêu cầu bên dưới nhé.'
    if item['intent'] == 'READ_MENU' and 'menu_categories' in result:
        return result['message']
    if item['intent'] in {'READ_MENU', 'DISCOVER_PRODUCTS', 'REFINE_DISCOVERY', 'RECOMMEND_PRODUCTS'} and result.get('status') in {'ok', 'not_found', 'discovery_coverage_incomplete'}:
        ids = list(dict.fromkeys(str(row['product_id']) for row in result.get('products') or []))[:16]
        refreshed = result.get('refreshed_groups') or (['drink', 'food'] if item['args'].get('scope') == 'all' else [item['args'].get('scope')])
        artifacts._publish_products(ids, 'hybrid_server_results', refreshed_groups=refreshed)
        previous = artifacts.logs
        artifacts.logs = logs
        try:
            reply = artifacts.discovery_product_reply() if ids else None
        finally:
            artifacts.logs = previous
        return '\n\n'.join(filter(None, [reply, result.get('message')])) or 'Mình chưa tìm thấy món phù hợp trong dữ liệu hiện có.'
    if item['intent'] == 'LIST_PAYMENT_OPTIONS' and result.get('status') == 'ok':
        from src.agents.store_information_presentation import payment_methods_reply
        return payment_methods_reply(result)
    if item['intent'] == 'READ_STORE_INFO' and item['args']['facet'] in {'branches', 'hours', 'reviews'} and result.get('status') == 'ok':
        from src.agents.store_information_presentation import store_reply
        return store_reply(result, item['args']['facet'])
    if not logs:
        return result.get('message')
    if result.get('status') not in SUCCESS:
        committed = [log for log in logs if log['tool'] in {'add_to_cart', 'update_cart_item', 'remove_cart_item'}
                     and log['result'].get('status') in {'ok', 'already_processed'}]
        if committed:
            from src.agents.customer_flow_presentation import cart_review
            return ('Mình đã thực hiện một phần yêu cầu:\n\n' + cart_review(committed[-1]['result']) +
                    '\n\nPhần còn lại chưa thực hiện: ' + (result.get('message') or 'Bạn kiểm tra lựa chọn giúp mình nhé.'))
        return result.get('message') or 'Chưa thể thực hiện phần yêu cầu này. Bạn kiểm tra lựa chọn giúp mình nhé.'
    if logs[-1]['tool'] in {'get_product_description', 'search_knowledge_base'}:
        # Approved evidence was already validated, scoped and quarantined by
        # knowledge_tools. Render extractively without stale snapshot prices.
        from src.agents.product_information_presentation import description_reply
        return description_reply(result, item.get('row'), item['args'].get('facet', 'description'))
    if logs[-1]['tool'] == 'get_products_reviews':
        from src.agents.product_information_presentation import collection_reviews_reply
        return collection_reviews_reply(result, detailed=item['args'].get('detail') == 'detailed')
    if logs[-1]['tool'] == 'get_product_insights':
        from src.agents.product_information_presentation import reviews_reply
        return reviews_reply(result)
    previous = artifacts.logs
    artifacts.logs = logs
    try:
        if item['intent'] == 'SELECT_PRODUCTS':
            from src.agents.customer_flow_presentation import selection_options_reply
            ids = {str(r['row']['product_id']) for r in item['selections']}
            pending = [r for r in artifacts.business.get('pending_products') or [] if str(r['product_id']) in ids]
            return selection_options_reply(pending) if pending else result.get('message')
        return artifacts.product_description_reply() or artifacts.customer_flow_reply() or result.get('message') or artifacts.factual_fallback()
    finally:
        artifacts.logs = previous


def render_cart_batch(artifacts, records):
    """One final cart for adjacent product/cart commands, including partial writes."""
    from src.agents.customer_flow_presentation import cart_review, selection_options_reply
    logs = [log for _, command_logs, _ in records for log in command_logs]
    committed = [log for log in logs if log['tool'] in {'add_to_cart', 'update_cart_item', 'remove_cart_item'}
                 and log['result'].get('status') in {'ok', 'already_processed'}]
    if not committed:
        return '\n\n'.join(dict.fromkeys(filter(None, (
            render_command(artifacts, item, command_logs, result) for item, command_logs, result in records))))
    result = records[-1][2]
    failed = result.get('status') not in SUCCESS
    lead = ('Mình đã thực hiện một phần yêu cầu:' if failed else
            'Đã thêm các món vào giỏ của bạn.' if all(log['tool'] == 'add_to_cart' for log in committed) else
            'Đã cập nhật giỏ hàng theo yêu cầu của bạn.')
    blocks = [lead, cart_review(committed[-1]['result'])]
    ids = {str(selection['row']['product_id']) for item, _, _ in records for selection in item.get('selections', [])}
    ids.update(str(item['row']['product_id']) for item, _, _ in records if item['intent'] == 'CONFIGURE_PRODUCT')
    pending = [row for row in artifacts.business.get('pending_products') or [] if str(row['product_id']) in ids]
    if pending:
        blocks.append(selection_options_reply(pending))
    if failed:
        blocks.append('Phần còn lại chưa thực hiện: ' + (result.get('message') or 'Bạn kiểm tra lựa chọn giúp mình nhé.'))
    elif not pending:
        blocks.append('Bạn muốn thêm món, sửa giỏ hay hoàn tất giỏ hàng ạ?')
    return '\n\n'.join(blocks)


def render_discovery_batch(artifacts, records, session_id):
    """One visible collection for complementary reads in the same envelope."""
    if len(records) == 1:
        return render_command(artifacts, *records[0])
    from src.agents.product_display import product_bucket
    rows, refreshed, notes = [], [], []
    for item, logs, result in records:
        groups = result.get('refreshed_groups') or (['drink', 'food'] if item['args'].get('scope') == 'all' else [item['args'].get('scope')])
        rows = [r for r in rows if product_bucket(r) not in groups]
        rows += result.get('products') or []
        refreshed += groups
        if result.get('message'):
            notes.append(result['message'])
    rows = list({str(row['product_id']): row for row in rows}.values())
    if len(set(refreshed)) > 1:
        # Separate category predicates cannot be represented by one existing
        # discovery delta. Require explicit criteria on a later refinement,
        # rather than silently refining only the last category in this batch.
        cart_manager.set_checkout_context(session_id, hybrid_discovery_state=None)
    if len(rows) > 16:
        # Bound the global namespace while retaining coverage of each group.
        buckets = list(dict.fromkeys(product_bucket(r) for r in rows))
        selected = []
        for index in range(16):
            group = buckets[index % len(buckets)]
            candidates = [r for r in rows if product_bucket(r) == group and r not in selected]
            if not candidates:
                candidates = [r for r in rows if r not in selected]
            selected.append(candidates[0])
        notes.append(f'Đang hiển thị 16/{len(rows)} món; bạn có thể chọn một nhóm để xem thêm.')
        rows = sorted(selected, key=lambda row: buckets.index(product_bucket(row)))
    logs = [log for _, command_logs, _ in records for log in command_logs]
    merged = {'status': 'ok', 'products': rows, 'refreshed_groups': list(dict.fromkeys(refreshed)),
              'message': '\n\n'.join(dict.fromkeys(notes))}
    reply = render_command(artifacts, records[-1][0], logs, merged)
    failed = records[-1][2].get('status') not in {'ok', 'not_found', 'discovery_coverage_incomplete'}
    if failed:
        reply += '\n\n' + (records[-1][2].get('message') or 'Phần tra cứu còn lại chưa thực hiện được.')
    return reply


def consolidate_checkout_choices(artifacts, blocks, records):
    """Render confirmed choices and the remaining question from final state."""
    from src.agents.customer_flow_presentation import customer_flow_reply
    successful = [r for r in records if r[3].get('status') in {'ok', 'already_processed'}]
    if not successful:
        return
    choices, profile = {}, None
    for _, _, _, result in successful:
        choices.update(result.get('choices') or {})
        profile = result.get('profile_location') or profile
    result = {'status': 'ok', 'choices': choices, 'profile_location': profile,
              'payment_options': artifacts.ui.get('payment_options') or []}
    for index, _, _, _ in successful:
        blocks[index] = None
    blocks[successful[-1][0]] = customer_flow_reply(
        [{'tool': 'set_checkout_choices', 'result': result}], artifacts.business)


def run_hybrid_turn(session_id, user_message, history=None, client_message_id=None, selected_product_id=None):
    started = time.monotonic()
    from src.agents.guardrails import check_input, get_block_reply
    safe, reason = check_input(user_message, session_id)
    if not safe:
        return {'reply': get_block_reply(reason or ''), 'checkout_payload': None, 'ui_payload': {}, 'tool_calls_log': [], 'error': 'blocked:' + str(reason)}
    if client_message_id:
        previous = (cart_manager.get_checkout_prefs(session_id).get('processed_order_turns') or {}).get(client_message_id)
        previous = previous or cart_manager.load_durable_processed_turn(session_id, client_message_id)
        if previous:
            if previous.get('message') != user_message or previous.get('selected_product_id') != selected_product_id:
                return {'reply': 'Mã lượt chat đã được dùng cho một tin nhắn khác.', 'error': 'client_message_id_conflict', 'tool_calls_log': [], 'checkout_payload': None, 'ui_payload': {}}
            from src.common.provider_retry import retry_ready
            if not retry_ready(previous['result']):
                return deepcopy(previous['result'])
    store = ConversationMemory()
    memory = store.load(session_id)
    from src.agents.order_management import restore_history_snapshot
    restore_history_snapshot(memory, cart_manager.get_checkout_prefs(session_id))
    context, _ = build_context(session_id, memory, history, selected_product_id, project=False)
    turn = TurnContext.capture(context)
    artifacts = ToolArtifacts(memory, user_message, context, semantic_mode=True)
    artifacts.hybrid_display_owned = True
    artifacts.visible = deepcopy(context['visible'])
    artifacts.focus = deepcopy(context['focus'])
    gateway = GuardedToolGateway(session_id, user_message, context, artifacts, client_message_id,
                                 semantic_mode=True, deterministic_business=True)
    dispatcher = CommerceDispatch(gateway, turn)
    requests, failure, blocks = 0, None, []
    budget, grounding_repairs = ProviderBudget(), 0
    cart_batch, discovery_batch, choice_records, location_completed = [], [], [], False
    location_read = None
    checkout_blocks, checkout_progressed = set(), False
    if selected_product_id is not None:
        matches = [{**r, 'display_index': r.get('display_index', i)} for i, r in enumerate(turn.rows('products'), 1)
                   if str(r['product_id']) == str(selected_product_id)]
        envelope = {'kind': 'commands', 'commands': [{'intent': 'SELECT_PRODUCTS', 'args': {
            'mode': 'EXPLICIT', 'references': [clicked_reference(matches[0], turn.product_display_snapshot)]}}],
            'message': None} if len(matches) == 1 else None
        if envelope is None:
            failure = {'failure_code': 'ui_product_not_visible', 'failure_class': 'REFERENCE_GROUNDING'}
    else:
        envelope, failure, requests = interpret(turn, user_message, session_id, client_message_id, context['recent'], budget=budget)
    if envelope is not None and not failure:
        envelope, failure, _ = validate_envelope(envelope)
    if envelope is not None and not failure and envelope['kind'] == 'commands':
        try:
            bound = dispatcher.preflight(envelope['commands'])
        except GroundingError as exc:
            from src.agents.hybrid_reference_repair import eligible, repair, at
            kinds = [at(envelope, path)['kind'] for path in exc.paths]
            diagnose(exc.code, intents=[c['intent'] for c in envelope['commands']], reference_kinds=kinds)
            repair_error = None
            failure = {'failure_code': exc.code,
                'failure_class': 'REFERENCE_AMBIGUITY' if exc.code == 'ambiguous_reference' else 'REFERENCE_GROUNDING',
                'failure_field': exc.domain}
            if exc.code in {'menu_catalog_unavailable', 'menu_catalog_invalid'}:
                failure['failure_class'] = 'BUSINESS_POLICY'
                blocks.append('Mình chưa đọc được danh mục Menu lúc này. Bạn thử xem lại danh mục sau nhé; giỏ hàng vẫn được giữ nguyên.')
            if selected_product_id is None and eligible(turn, envelope, exc) and budget.used < budget.maximum:
                grounding_repairs = 1
                repaired, repair_error = repair(turn, envelope, exc, user_message, budget)
                if repaired:
                    try:
                        bound = dispatcher.preflight(repaired['commands'])
                        envelope, failure = repaired, None
                        diagnose('reference_repair_recovery')
                    except GroundingError as second:
                        repair_error = second.code
                if failure:
                    failure.update(failure_class='REFERENCE_REPAIR_FAILED', repair_failure_code=repair_error)
            logger.info('[HybridReferenceRepair] %s', json.dumps({'attempted': bool(grounding_repairs),
                'reason': exc.code, 'frozen_fields': ['intent', 'command_order', 'quantity', 'options', 'payment',
                    'fulfillment', 'voucher', 'all_other_references'],
                'repaired_reference_count': len(exc.paths) if grounding_repairs and not failure else 0,
                'success': bool(grounding_repairs and not failure), 'request_number': budget.used,
                'failure_code': repair_error}))
        if not failure:
            supplied_location = any(c['intent'] in {'PROVIDE_LOCATION', 'SELECT_BRANCH', 'SELECT_PROFILE_ADDRESS'} or
                c['intent'] == 'READ_STORE_INFO' and c['args']['facet'] == 'branches' and c['args'].get('query')
                for c in bound)
            with cart_tools.mutation_operation_context(session_id, client_message_id):
                for item_index, item in enumerate(bound):
                    # A missing legacy purpose is clarified by the immediately
                    # adjacent, typed store-list read, without routing on prose.
                    following = bound[item_index + 1] if item_index + 1 < len(bound) else None
                    if (item['intent'] == 'PROVIDE_LOCATION' and not item['args'].get('purpose')
                            and following and following['intent'] == 'READ_STORE_INFO'
                            and following['args']['facet'] == 'branches' and not following['args'].get('target')
                            and (not following['args'].get('query') or following['args']['query'] == item['args']['value'])):
                        item['args'] = {**item['args'], 'purpose': 'nearby_branches'}
                    item['following_discovery'] = bool(following and following['intent'] in {'DISCOVER_PRODUCTS', 'RECOMMEND_PRODUCTS', 'READ_MENU'})
                    discovery_command = item['intent'] in {'DISCOVER_PRODUCTS', 'REFINE_DISCOVERY', 'RECOMMEND_PRODUCTS'}
                    if discovery_batch and not discovery_command:
                        blocks.append(render_discovery_batch(artifacts, discovery_batch, session_id))
                        discovery_batch = []
                    cart_command = item['intent'] in {'SELECT_PRODUCTS', 'CONFIGURE_PRODUCT', 'EDIT_CART'}
                    if cart_batch and not cart_command:
                        checkout_blocks.add(len(blocks))
                        blocks.append(render_cart_batch(artifacts, cart_batch))
                        cart_batch = []
                    before = business_state(session_id)
                    log_start = len(artifacts.logs)
                    if (location_read and item['intent'] == 'READ_STORE_INFO' and item['args']['facet'] == 'branches'
                            and not item['args'].get('target') and (not item['args'].get('query') or
                                item['args']['query'] == location_read['value'])):
                        item['location_read_result'] = location_read['result']
                        blocks[location_read['block']] = None
                    result = dispatcher.execute(item, supplied_location)

                    if any(log['tool'] == 'request_checkout' and log['result'].get('status') == 'require_confirmation'
                           for log in artifacts.logs[log_start:]):
                        cart_manager.set_checkout_context(session_id, hybrid_summary_turn_id=client_message_id)
                    artifacts.business = business_state(session_id)
                    gateway.context['business'] = artifacts.business
                    command_logs = artifacts.logs[log_start:]
                    if cart_command:
                        cart_batch.append((item, command_logs, result))
                    elif discovery_command:
                        discovery_batch.append((item, command_logs, result))
                    else:
                        if item['intent'] in CHECKOUT_PROGRESS | {'LIST_PAYMENT_OPTIONS'}:
                            checkout_blocks.add(len(blocks))
                        blocks.append(render_command(artifacts, item, command_logs, result))
                        if item['intent'] in {'SET_FULFILLMENT', 'SET_PAYMENT'}:
                            choice_records.append((len(blocks) - 1, item, command_logs, result))
                    location_read = ({'value': item['args']['value'], 'result': result, 'block': len(blocks)-1}
                        if item['intent'] == 'PROVIDE_LOCATION' and item['args'].get('purpose') == 'nearby_branches'
                        and result.get('status') == 'ok' and result.get('branches') else None)
                    checkout_progressed = checkout_progressed or (item['intent'] in CHECKOUT_PROGRESS
                        and result.get('status') in {'ok', 'already_processed'})
                    location_completed = location_completed or (item['intent'] in {
                        'PROVIDE_LOCATION', 'SELECT_PROFILE_ADDRESS', 'SELECT_LOCATION_CANDIDATE', 'SELECT_BRANCH'}
                        and result.get('status') == 'ok' and artifacts.business['checkout'].get('address_confirmed'))
                    logger.info('[WorkflowTransition] %s', json.dumps({'intent': item['intent'],
                        'before_milestone': next_required_milestone(before), 'after_milestone': next_required_milestone(artifacts.business),
                        'changed': digest(before) != digest(artifacts.business), 'read_only': item['intent'] in READ_INTENTS}))
                    if result.get('status') not in SUCCESS:
                        if item['intent'] in READ_INTENTS and result.get('status') == 'not_found':
                            continue  # An honest evidence limitation completes a read.
                        failure = {'failure_class': 'DISCOVERY_COVERAGE' if result.get('status') == 'discovery_coverage_incomplete' else 'BUSINESS_POLICY', 'failure_code': result.get('status') or 'business_unavailable'}
                        break
                if cart_batch:
                    checkout_blocks.add(len(blocks))
                    blocks.append(render_cart_batch(artifacts, cart_batch))
                if discovery_batch:
                    blocks.append(render_discovery_batch(artifacts, discovery_batch, session_id))
                if choice_records:
                    consolidate_checkout_choices(artifacts, blocks, choice_records)
                if checkout_progressed and not failure and next_required_milestone(artifacts.business) == 'CHECKOUT_READY':
                    # Server workflow continuation: prepare a review, never an
                    # order. Reuse all existing quote, stock and destination gates.
                    summary_item = {'intent': 'PREPARE_CHECKOUT', 'args': {}}
                    start = len(artifacts.logs)
                    result = dispatcher.execute(summary_item)
                    if result.get('status') == 'require_confirmation':
                        cart_manager.set_checkout_context(session_id, hybrid_summary_turn_id=client_message_id)
                        blocks = [block for index, block in enumerate(blocks) if index not in checkout_blocks]
                    artifacts.business = business_state(session_id)
                    gateway.context['business'] = artifacts.business
                    blocks.append(render_command(artifacts, summary_item, artifacts.logs[start:], result))
                    logger.info('[WorkflowContinuation] %s', json.dumps({'operation': 'request_checkout',
                        'trigger': 'checkout_ready', 'result_status': result.get('status'),
                        'after_milestone': next_required_milestone(artifacts.business)}))
                    if result.get('status') not in SUCCESS:
                        failure = {'failure_class': 'BUSINESS_POLICY', 'failure_code': result.get('status') or 'business_unavailable'}
                if location_completed and not failure and next_required_milestone(artifacts.business) == 'PAYMENT_SELECTION':
                    # Continue from the final turn state: a later SET_PAYMENT in
                    # this same envelope must not receive a stale payment prompt.
                    available = dispatcher.call('LIST_PAYMENT_OPTIONS', 'get_payment_options', {})
                    from src.agents.customer_flow_presentation import checkout_choices
                    blocks.append(checkout_choices(artifacts.business, available.get('payment_options') or []))
    elif envelope is not None and not failure:
        # Model text cannot certify business facts. Current obligations remain.
        if envelope['kind'] == 'clarification':
            diagnose('manual_clarification')
        blocks.append('Dạ, mình có thể giúp bạn chọn món và đặt hàng. Bạn muốn mình hỗ trợ gì ạ?' if envelope['kind'] == 'social'
                      else 'Bạn nói rõ món hoặc lựa chọn muốn áp dụng giúp mình nhé.')
    requests = budget.used
    if failure and failure.get('failure_class') not in {'BUSINESS_POLICY', 'DISCOVERY_COVERAGE'}:
        diagnose('provider_unavailable' if failure.get('failure_class') == 'PROVIDER_UNAVAILABLE' else 'manual_clarification',
            intents=[c['intent'] for c in envelope['commands']] if envelope else [])
        if failure.get('failure_class') == 'PROVIDER_UNAVAILABLE':
            retry_delay = max(1, int(budget.metrics.get('retry_after_seconds') or 30))
            blocks.append('Dạ, dịch vụ AI đang tạm thời gián đoạn kết nối nên mình chưa xử lý được tin nhắn này. '
                f'Bạn đợi khoảng **{retry_delay} giây** rồi gửi lại nhé; các lựa chọn đã xác nhận vẫn được giữ nguyên.')
        elif failure.get('failure_field') == 'orders':
            blocks.append('Mình chưa xác định được đơn bạn muốn xử lý. Bạn chọn số trong lịch sử đơn hoặc gửi mã đơn đầy đủ nhé.')
        elif failure.get('failure_field') == 'pending_products' and turn.rows('pending_products'):
            blocks.append('Bạn muốn áp dụng tùy chọn cho món nào?\n\n' + '\n'.join(
                f"{r.get('selection_index', i)}. **{r['product_name']}**" for i, r in enumerate(turn.rows('pending_products'), 1)))
        elif failure.get('failure_field') == 'products':
            from src.agents.product_display import PRODUCT_REFERENCE_LABELS
            groups = turn.product_display_snapshot.collections_context()
            choices = ['**' + PRODUCT_REFERENCE_LABELS[group].capitalize() + ':**\n' + '\n'.join(
                f"{r['group_index']}. **{r['product_name']}**" for r in rows) for group, rows in groups.items() if rows]
            blocks.append('Mình chưa phân biệt được món bạn chọn trong các danh sách đang hiển thị. '
                'Bạn chọn rõ nhóm và số, ví dụ “nước số 1, bánh số 1”, hoặc tên món nhé.\n\n' + '\n\n'.join(choices))
        elif failure.get('failure_field') == 'menu_categories':
            blocks.append('Mình chưa xác định được danh mục đó trong Menu hiện tại. Bạn cho mình tên đầy đủ '
                'hoặc **số danh mục** trong danh sách đã hiển thị nhé. Bạn cũng có thể yêu cầu xem lại danh sách danh mục.')
        else:
            blocks.append('Mình chưa xác định được đúng lựa chọn bạn muốn áp dụng. Bạn cho mình tên hoặc số trong danh sách nhé.'
                      if failure.get('failure_class') == 'REFERENCE_GROUNDING' else
                      'Trợ lý chưa xử lý được yêu cầu này. Bạn thử lại cùng tin nhắn nhé; các lựa chọn trước đó vẫn được giữ nguyên.')
    if failure and failure.get('failure_class') == 'BUSINESS_POLICY':
        diagnose('business_policy_rejection', intents=[c['intent'] for c in envelope['commands']])
    reply = '\n\n'.join(dict.fromkeys(safe_text(b, 8000) for b in blocks if b)) or 'Mình chưa xác minh được kết quả. Bạn thử lại nhé.'
    final_state = business_state(session_id)
    artifacts.business = final_state
    artifacts.finalize_display()
    if artifacts.product_display:
        cart_manager.set_checkout_context(session_id, hybrid_product_display={'metadata': artifacts.product_display,
            'visible': {kind: artifacts.visible.get(kind) or [] for kind in ('products', 'drink_products', 'food_products')}})
    elif any(log['tool'] == 'confirm_checkout' and log['result'].get('status') in {'ok', 'success', 'already_processed'}
             for log in artifacts.logs):
        cart_manager.set_checkout_context(session_id, hybrid_product_display=None, hybrid_discovery_state=None)
    artifacts.ui['cart'] = public_result(cart_manager.get_cart(session_id))
    if final_state.get('checkout', {}).get('payment_method') and not any(
            c['intent'] == 'LIST_PAYMENT_OPTIONS' for c in (envelope or {}).get('commands', [])):
        artifacts.ui['payment_options'] = []
    if artifacts.ui.get('products'):
        cart_manager.set_checkout_context(session_id, last_product_suggestions=artifacts.ui['products'])
    response = {'reply': reply, 'ui_payload': artifacts.ui, 'checkout_payload': artifacts.checkout,
        'tool_calls_log': artifacts.logs, 'error': failure.get('failure_code') if failure else None,
        'conversation_state': next_required_milestone(final_state), 'architecture': 'hybrid', 'provider_request_count': requests}
    if failure:
        response.update(failure)
    if (failure and failure.get('failure_class') == 'PROVIDER_UNAVAILABLE'
            and failure.get('failure_code') in {'network_timeout', 'provider_transient'}
            and not artifacts.logs and not gateway.write_started and not artifacts.checkout):
        response['retry_after_seconds'] = retry_delay
        response['_provider_retry'] = {'no_tool_execution': True, 'retry_at': time.time() + retry_delay}
    if client_message_id:
        record = {'message': user_message, 'selected_product_id': selected_product_id, 'result': deepcopy(response)}
        cart_manager.persist_processed_turn_durable(session_id, client_message_id, record)
        turns = dict(cart_manager.get_checkout_prefs(session_id).get('processed_order_turns') or {})
        turns[client_message_id] = record
        cart_manager.set_checkout_context(session_id, processed_order_turns=cart_manager.prune_processed_turns(turns))
    updated = artifacts.memory_update(memory, user_message, reply, response['conversation_state'])
    updated['recent_turns'] = updated['recent_turns'][-8:]
    updated['last_tool_summary'] = []  # No historical executor transcript in Hybrid context.
    store.save(session_id, updated)
    logger.info('[HybridTurn] %s', json.dumps({'conversation_id_hash': digest(session_id), 'client_message_id': client_message_id,
        'kind': envelope['kind'] if envelope else None, 'intent_names': [c['intent'] for c in envelope['commands']] if envelope else [],
        'request_count': requests, 'context_fingerprint': turn.fingerprint, 'business_operation_count': len(artifacts.logs),
        'internal_read_count': dispatcher.internal_reads, 'grounding_repairs': grounding_repairs,
        'business_write_count': sum(log['tool'] in gateway.handlers and log['tool'] not in {
            'get_product_options', 'get_product_description', 'search_knowledge_base', 'get_cart_quote',
            'get_payment_options', 'compare_branch_reviews'} for log in artifacts.logs),
        'next_milestone': response['conversation_state'],
        'final_synthesis_source': 'server', 'latency_ms': round((time.monotonic() - started) * 1000, 2), **(failure or {})}))
    return response
