"""Deterministic gateway for untrusted LLM tool proposals in the customer BPM."""
from copy import deepcopy
import hashlib
import json
import logging
import re
import time

from src.agents.agent_context import business_state
from src.agents.agent_memory import compact
from src.agents.tool_capabilities import CAPABILITIES, tool_schemas, validate_args
from src.common import cart_manager
from src.function_calling.tools import TOOL_EXECUTORS
from src.function_calling.tools import cart_tools, product_tools, branch_tools, voucher_tools
from src.rag.authority import knowledge_route
from src.rag.documents import normalize_text

logger = logging.getLogger(__name__)


class MutationOutcomeUnknown(RuntimeError):
    """Propagate to the existing durable HTTP claim/reconciliation boundary."""


def denied(code, **details):
    return {'status': code, 'message': 'Chưa thể thực hiện yêu cầu này an toàn. Bạn kiểm tra lựa chọn hoặc bổ sung thông tin nhé.', **details}


class GuardedToolGateway:
    def __init__(self, session_id, user_message, context, artifacts, client_message_id=None, shadow=False):
        self.session_id, self.user_message = session_id, user_message
        self.context, self.artifacts = context, artifacts
        self.client_message_id, self.shadow = client_message_id, shadow
        self.schemas = {r['function']['name']: r['function']['parameters'] for r in tool_schemas()}
        self.cache, self.provenance = {}, []
        self.write_started = False
        self.entry_action = (context['business'].get('checkout') or {}).get('checkout_action_id')
        self.options = {}
        self.updated_products = set()
        self.denied_cart_operation = None
        self.request_route = knowledge_route(user_message)
        self.entry_branches = {str(r.get('branch_id') or r.get('ma_chi_nhanh')) for r in artifacts.visible.get('branches', [])}
        self.handlers = {name: getattr(self, '_'+name) for name in (
            'get_product_options', 'add_to_cart', 'update_cart_item', 'remove_cart_item', 'finish_cart',
            'skip_voucher', 'apply_voucher', 'remove_voucher', 'discard_pending_product', 'set_session_branch', 'set_checkout_choices',
            'resolve_location', 'select_location_candidate', 'request_checkout', 'confirm_checkout',
            'search_knowledge_base', 'get_product_description', 'get_cart_quote', 'get_payment_options')}

    def executors(self):
        return {name: (lambda args, session_id, n=name: self.dispatch(n, args)) for name in self.schemas}

    def dispatch(self, name, args):
        started = time.monotonic()
        capability = CAPABILITIES.get(name)
        if not capability or name not in self.schemas or not validate_args(args, self.schemas[name]):
            spec = self.schemas.get(name) or {}
            result = denied('invalid_arguments',
                required_fields=spec.get('required', []),
                allowed_fields=list(spec.get('properties', {})))
            self.artifacts.collect(name, args, result)
            record = {'tool_name': name, 'read_or_write': capability.access if capability else 'UNKNOWN',
                'owner': capability.owner if capability else 'unregistered',
                'validated_args_summary': sorted(args) if isinstance(args, dict) else [],
                'guardrail_result': 'invalid_arguments',
                'latency_ms': round((time.monotonic()-started)*1000, 2), 'mutation_evidence_present': False}
            self.provenance.append(record)
            logger.info('[ToolGateway] %s', json.dumps(record))
            return result
        signature = name + ':' + json.dumps(args, sort_keys=True, ensure_ascii=False)
        if signature in self.cache:
            return self.cache[signature]
        if self.shadow:
            result = {'status': 'shadow_only', 'proposed_tool': name, 'access': capability.access}
        else:
            state = business_state(self.session_id)
            self.context['business'] = state
            if capability.access != 'READ' and (not state['authenticated'] or not self.client_message_id):
                result = denied('authentication_or_turn_required')
            elif capability.access != 'READ' and name not in {'resolve_location', 'select_location_candidate', 'set_checkout_choices'} and not state['cart_verified']:
                result = denied('authoritative_cart_unavailable')
            elif state['checkout'].get('checkout_submission') and capability.access != 'READ' and name != 'confirm_checkout':
                result = denied('transaction_completed_or_processing')
            else:
                handler = self.handlers.get(name)
                try:
                    cart_mutations = {'add_to_cart', 'update_cart_item', 'remove_cart_item'}
                    if name in cart_mutations and self.denied_cart_operation not in {None, name}:
                        result = denied('conflicting_cart_operations',
                            active_operation=self.denied_cart_operation, proposed_operation=name)
                    else:
                        result = handler(args) if handler else self._read(name, args)
                        if (name in cart_mutations
                                and result.get('status') not in {'ok', 'already_processed', 'needs_options'}):
                            self.denied_cart_operation = name
                except MutationOutcomeUnknown:
                    raise
                except Exception as exc:
                    if self.write_started and capability.access != 'READ':
                        raise MutationOutcomeUnknown('business write requires reconciliation') from exc
                    logger.warning('[ToolGateway] tool=%s error_type=%s', name, type(exc).__name__)
                    result = denied('provider_unavailable')
        self.cache[signature] = result
        from src.agents.tool_artifacts import public_result
        result = public_result(result)
        self.cache[signature] = result
        self.artifacts.collect(name, args, result)
        record = {'tool_name': name, 'read_or_write': capability.access, 'owner': capability.owner,
            'validated_args_summary': sorted(args), 'guardrail_result': result.get('status'),
            'reference_source': 'current_authoritative_cart' if 'cart_item_id' in args else
                'canonical_provider_and_session_candidates' if any(k in args for k in ('product_id', 'branch_id', 'candidate_id', 'action_id', 'voucher_code', 'entity_id')) else 'server_scoped_tool',
            'latency_ms': round((time.monotonic()-started)*1000, 2),
            'mutation_evidence_present': capability.access != 'READ' and result.get('status') in {'ok', 'already_processed'}}
        self.provenance.append(record)
        logger.info('[ToolGateway] %s', json.dumps(record))
        return result

    def _read(self, name, args):
        args = dict(args)
        if name == 'get_product_insights':
            if self.request_route.get('owner') in {'rag', 'price', 'inventory', 'recommendation'}:
                return denied('wrong_authority', requested_authority=self.request_route.get('owner'),
                    allowed_tools=['get_product_description', 'search_knowledge_base']
                    if self.request_route.get('owner') == 'rag' else ['filter_catalog', 'get_recommendations']
                    if self.request_route.get('owner') == 'recommendation' else ['check_price_and_stock'])
            proposed = normalize_text(args.get('product_name'))
            known = list(self.artifacts.visible.get('products') or []) + self.context['business']['cart']['items']
            focus = self.artifacts.focus.get('product') or self.context.get('focus', {}).get('product')
            if focus:
                known.append(focus)
            exact = [row for row in known if normalize_text(row.get('product_name')) == proposed]
            if not exact:
                resolved = TOOL_EXECUTORS['filter_catalog'](
                    {'category': 'all', 'search_text': args.get('product_name', ''), 'limit': 16}, self.session_id)
                exact = [row for row in resolved.get('products', [])
                         if normalize_text(row.get('product_name')) == proposed]
            identities = {str(row.get('product_id')) for row in exact if row.get('product_id')}
            if len(identities) != 1:
                return denied('requires_product', reference=args.get('product_name'),
                    recovery='Resolve one exact catalog product before requesting reviews.')
            args['product_name'] = exact[0]['product_name']
        if name == 'get_recommendations':
            args['user_id'] = None  # No permanent preference inference in this BPM.
        if name in {'filter_catalog', 'get_recommendations'}:
            # The model may carry a category from an older turn.  The current
            # customer text is independent evidence for only this broad scope;
            # it does not choose products or bypass the catalog provider.
            from src.agents.shopping_language import requested_product_category
            requested_category = requested_product_category(self.user_message)
            proposed_category = args.get('category')
            if proposed_category in {'drink', 'food'} and requested_category and proposed_category != requested_category:
                args['category'] = requested_category
            elif requested_category is None and proposed_category in {'drink', 'food'}:
                args['category'] = 'all'
            key = 'limit' if name == 'filter_catalog' else 'top_k'
            args[key] = max(1, min(16, int(args.get(key, 5))))
        if name == 'find_nearest_branch':
            return branch_tools.execute_find_nearest_branch(session_id='', **args)
        if name == 'check_price_and_stock':
            args['branch_id'] = self.context['business']['cart'].get('branch_id') or 'Chưa chọn'
        # Tools own user-specific reads; server scoped session is always injected.
        result = TOOL_EXECUTORS[name](args, self.session_id)
        if name == 'get_product_insights' and result.get('status') == 'ok' and result.get('product_name'):
            found_name = result['product_name']
            known = list(self.artifacts.visible.get('products') or []) + self.context['business']['cart']['items']
            focus = self.artifacts.focus.get('product')
            if focus:
                known.append(focus)
            exact = [row for row in known if str(row.get('product_name', '')).casefold() == found_name.casefold()]
            if not exact:
                resolved = TOOL_EXECUTORS['filter_catalog']({'category': 'all', 'search_text': found_name, 'limit': 16}, self.session_id)
                exact = [row for row in resolved.get('products', []) if str(row.get('product_name', '')).casefold() == found_name.casefold()]
            if len({str(row['product_id']) for row in exact}) == 1:
                result = {**result, 'canonical_product': {'product_id': str(exact[0]['product_id']), 'product_name': found_name}}
        return result

    def _product(self, product_id):
        rows = list(self.artifacts.visible.get('products') or [])
        rows += self.context['business'].get('pending_products') or []
        focus = self.artifacts.focus.get('product') or self.context.get('focus', {}).get('product')
        if focus:
            rows.append(focus)
        rows += self.context['business']['cart'].get('items') or []
        return next((row for row in rows if str(row.get('product_id')) == str(product_id)), None)

    def _get_product_options(self, args):
        # Exact DB identity is safe even when Redis is absent; never resolve by
        # a model-supplied display name or trust a Redis option schema.
        result = self.options.get(args['product_id'])
        if result is None:
            result = product_tools.execute_get_product_options(product_id=args['product_id'])
        if result.get('status') == 'ok' and str(result.get('product_id')) == args['product_id']:
            self.options[args['product_id']] = result
            self.artifacts.focus['product'] = {'product_id': args['product_id'],
                'product_name': result['product_name'], 'source': 'canonical_option_provider'}
        return result

    def _configured_product(self, product_id, values, defaults=False, require_all=True, quantity=None):
        from src.agents.option_state import option_schema_from_result, option_field, resolve_option_default
        result = self._get_product_options({'product_id': product_id})
        if result.get('status') != 'ok' or str(result.get('product_id')) != product_id:
            return None, denied('unknown_product')
        if require_all:
            staged = next((row for row in self.context['business'].get('pending_products', [])
                           if str(row.get('product_id')) == product_id), {})
            values = {**{k: staged[k] for k in ('size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua') if k in staged}, **values}
            from src.agents.shopping_language import explicit_shopping_quantity
            explicit_quantity = explicit_shopping_quantity(self.user_message)
            expected_quantity = explicit_quantity if explicit_quantity is not None else staged.get('quantity', 1)
            if staged and quantity is not None and int(quantity) != int(expected_quantity):
                return None, denied('pending_quantity_conflict', expected_quantity=int(expected_quantity),
                    recovery='Preserve the staged quantity unless the current message explicitly changes it.')
            quantity = expected_quantity if staged else (quantity if quantity is not None else 1)
        groups, output, missing = option_schema_from_result(result), {}, []
        by_field = {option_field(g['name']): g for g in groups if option_field(g['name'])}
        for field, value in values.items():
            group = by_field.get(field)
            if not group:
                return None, denied('invalid_option', field=field, allowed_values=[])
            requested = value if isinstance(value, list) else [value]
            if (any(v not in group['values'] for v in requested)
                    or (not group.get('multiple') and len(requested) != 1)
                    or (group.get('required') and not requested)):
                return None, denied('invalid_option', field=field, allowed_values=group['values'])
            output[field] = value
        if require_all:
            for field, group in by_field.items():
                if field in output:
                    continue
                default = resolve_option_default(group, result.get('product_data')) if defaults or group.get('fixed') else None
                if default is not None:
                    output[field] = default
                elif group.get('required'):
                    missing.append(field)
        product = {'product_id': product_id, 'product_name': result['product_name'],
                   'quantity': quantity or 1, 'option_schema': groups, **output}
        if missing:
            cart_manager.set_pending_products(self.session_id, [product], merge=True)
            cart_manager.set_pending_action(self.session_id, 'fill_options', {'count': len(cart_manager.get_checkout_prefs(self.session_id).get('pending_products') or [])})
            return None, denied('needs_options', missing=missing, option_groups=groups, product=product)
        return product, None

    def _write(self, name, args, call):
        self.write_started = True
        result = call()
        if result.get('status') in {'error', 'outcome_unknown', 'timeout', 'processing'}:
            raise MutationOutcomeUnknown('business write outcome requires reconciliation')
        if result.get('status') in {'ok', 'already_processed'}:
            self.context['business'] = business_state(self.session_id)
        return result

    def _operation_id(self, name, args):
        raw = json.dumps([self.session_id, self.client_message_id, name, args], sort_keys=True, ensure_ascii=False)
        return 'ai-' + hashlib.sha256(raw.encode()).hexdigest()

    def _add_to_cart(self, args):
        if args['product_id'] in self.updated_products:
            return denied('conflicting_cart_operations')
        if not self._product(args['product_id']):
            # A full product name in the current message is stronger evidence
            # than an old visible snapshot.  Resolve the proposed opaque ID
            # through the canonical option provider and require an exact name
            # match before allowing the normal option/price gates to continue.
            resolved = self._get_product_options({'product_id': args['product_id']})
            name = normalize_text(resolved.get('product_name')) if resolved.get('status') == 'ok' else ''
            message = normalize_text(self.user_message)
            if not name or not re.search(r'\b' + re.escape(name) + r'\b', message):
                return denied('unknown_product_reference',
                    recovery='Resolve a current canonical product or use an exact product name from the customer message.')
        values = {k: v for k, v in args.items() if k in {'size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua'}}
        product, error = self._configured_product(args['product_id'], values, args.get('use_defaults', False), quantity=args.get('quantity'))
        if error:
            return error
        priced = product_tools.execute_check_price_and_stock(product_name_query=product['product_name'],
            session_id=self.session_id, branch_id=self.context['business']['cart'].get('branch_id') or 'Chưa chọn',
            quantity=product['quantity'], **{k: v for k, v in product.items() if k in {'size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua'}})
        row = next((r for r in priced.get('products', []) if str(r.get('product_id')) == args['product_id']), None)
        if priced.get('status') != 'ok' or not row or row.get('final_price') is None or row.get('is_active') is False:
            return denied('price_or_sellability_unverified')
        payload = {k: v for k, v in product.items() if k not in {'option_schema'}}
        payload.update(unit_price=row['final_price'])
        result = self._write('add_to_cart', payload, lambda: cart_tools.execute_add_to_cart(
            session_id=self.session_id, operation_id=self._operation_id('add_to_cart', payload), **payload))
        if result.get('status') == 'ok':
            self._invalidate_summary()
            if self.context['business']['checkout'].get('completed_order_id'):
                cart_manager.set_checkout_context(self.session_id, completed_order_id=None,
                    completed_action_id=None, completed_result=None, flow_stage='SHOPPING')
        return result

    def _cart_line(self, line_id):
        return next((r for r in self.context['business']['cart']['items']
                     if str(r.get('cart_item_id') or r.get('line_id')) == line_id), None)

    def _cart_target_error(self, line):
        """Independently validate explicit ordinal/name evidence before writes."""
        from src.agents.selection_language import parse_selection_reference
        reference = parse_selection_reference(self.user_message)
        explicit_ordinal = None
        if reference.requested and reference.namespace == 'CART_LINE':
            if len(reference.ordinals) != 1:
                return denied('ambiguous_cart_target')
            explicit_ordinal = reference.ordinals[0]
            if int(line.get('display_index') or 0) != explicit_ordinal:
                expected = next((row for row in self.context['business']['cart']['items']
                                 if int(row.get('display_index') or 0) == explicit_ordinal), None)
                return denied('cart_reference_conflict', customer_ordinal=explicit_ordinal,
                    proposed_ordinal=line.get('display_index'),
                    expected_cart_item_id=str(expected.get('cart_item_id') or expected.get('line_id')) if expected else None,
                    expected_product_name=expected.get('product_name') if expected else None)
        cart_lines = self.context['business']['cart']['items']
        named = [row for row in cart_lines if row.get('product_name')
                 and normalize_text(row['product_name']) in normalize_text(self.user_message)]
        named_products = {str(row.get('product_id')) for row in named}
        if len(named_products) == 1:
            named_product = next(iter(named_products))
            if str(line.get('product_id')) != named_product:
                return denied('cart_reference_conflict', customer_product_id=named_product,
                    proposed_product_id=str(line.get('product_id')))
            same_product = [row for row in cart_lines if str(row.get('product_id')) == named_product]
            if len(same_product) > 1 and explicit_ordinal is None:
                return denied('ambiguous_cart_target', candidates=[{
                    'cart_item_id': str(row.get('cart_item_id') or row.get('line_id')),
                    'display_index': row.get('display_index'), 'product_name': row.get('product_name')}
                    for row in same_product])
        return None

    def _update_cart_item(self, args):
        line = self._cart_line(args['cart_item_id'])
        if not line or not args['desired_state']:
            return denied('unknown_cart_line')
        target_error = self._cart_target_error(line)
        if target_error:
            return target_error
        if args.get('cart_line_ordinal') and line.get('display_index') != args['cart_line_ordinal']:
            expected = next((row for row in self.context['business']['cart']['items']
                             if int(row.get('display_index') or 0) == args['cart_line_ordinal']), None)
            return denied('cart_reference_conflict', proposed_ordinal=line.get('display_index'),
                expected_cart_item_id=str(expected.get('cart_item_id') or expected.get('line_id')) if expected else None,
                expected_product_name=expected.get('product_name') if expected else None)
        patch = args['desired_state']
        if 'quantity' in patch and args.get('cart_line_ordinal'):
            from src.agents.shopping_language import explicit_shopping_quantity
            expected_quantity = explicit_shopping_quantity(self.user_message)
            if expected_quantity is not None and int(patch['quantity']) != expected_quantity:
                return denied('cart_quantity_conflict', expected_quantity=expected_quantity,
                    proposed_quantity=int(patch['quantity']),
                    recovery='Use the explicit absolute quantity from the current customer message.')
        if all(line.get(key) == value for key, value in patch.items()):
            return {'status': 'already_processed', 'cart': cart_manager.get_cart(self.session_id), 'changed': False}
        values = {k: v for k, v in patch.items() if k != 'quantity'}
        if values:
            _, error = self._configured_product(str(line['product_id']), values, require_all=False)
            if error:
                return error
        result = self._write('update_cart_item', args, lambda: cart_tools.execute_update_cart_item(
            self.session_id, args['cart_item_id'], patch, operation_id=self._operation_id('update_cart_item', args)))
        if result.get('status') == 'ok':
            self._invalidate_summary()
            self.updated_products.add(str(line['product_id']))
        return result

    def _remove_cart_item(self, args):
        line = self._cart_line(args['cart_item_id'])
        if not line:
            return denied('unknown_cart_line')
        target_error = self._cart_target_error(line)
        if target_error:
            return target_error
        if args.get('cart_line_ordinal') and line.get('display_index') != args['cart_line_ordinal']:
            expected = next((row for row in self.context['business']['cart']['items']
                             if int(row.get('display_index') or 0) == args['cart_line_ordinal']), None)
            return denied('cart_reference_conflict', proposed_ordinal=line.get('display_index'),
                expected_cart_item_id=str(expected.get('cart_item_id') or expected.get('line_id')) if expected else None,
                expected_product_name=expected.get('product_name') if expected else None)
        result = self._write('remove_cart_item', args, lambda: cart_tools.execute_remove_cart_item(
            self.session_id, args['cart_item_id'], operation_id=self._operation_id('remove_cart_item', args)))
        if result.get('status') == 'ok':
            self._invalidate_summary()
        return result

    def _invalidate_summary(self):
        cart_manager.set_checkout_context(self.session_id, summary_fingerprint=None,
            checkout_action_id=None, checkout_action_expires_at=None, summary_amounts=None)
        if (cart_manager.get_pending_action(self.session_id) or {}).get('type') == 'confirm_checkout':
            cart_manager.clear_pending_action(self.session_id)
        self.artifacts.checkout = None

    def _finish_cart(self, args):
        state = self.context['business']
        if not state['cart']['items']:
            return denied('empty_cart')
        if state['pending_products']:
            return denied('needs_options')
        # Reuse the established voucher boundary, not its language router.
        from src.agents.order_flow_graph import _offer_voucher_gate
        result = _offer_voucher_gate(self.session_id)
        value = next((r['result'] for r in result.get('tool_calls_log', []) if r['tool'] == 'get_applicable_vouchers'), {})
        return {'status': 'ok', **value, 'message': result['reply']}

    def _skip_voucher(self, args):
        if not self.context['business']['cart']['items']:
            return denied('empty_cart')
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        if prefs.get('voucher_code'):
            result = self._remove_voucher({})
            if result.get('status') != 'ok':
                return result
        cart_manager.set_checkout_context(self.session_id, voucher_decided=True, voucher_offer_pending=None,
            voucher_candidates=None, voucher_revalidation_required=None, flow_stage='CART_READY')
        cart_manager.clear_pending_action(self.session_id)
        self._invalidate_summary()
        return {'status': 'ok', 'voucher_decided': True, 'voucher_code': None}

    def _discard_pending_product(self, args):
        staged = cart_manager.get_checkout_prefs(self.session_id).get('pending_products') or []
        if not any(str(row.get('product_id')) == args['product_id'] for row in staged):
            return denied('unknown_pending_product')
        remaining = [row for row in staged if str(row.get('product_id')) != args['product_id']]
        cart_manager.set_pending_products(self.session_id, remaining)
        if remaining:
            cart_manager.set_pending_action(self.session_id, 'fill_options', {'count': len(remaining)})
        else:
            cart_manager.clear_pending_action(self.session_id)
        return {'status': 'ok', 'remaining_products': remaining}

    def _apply_voucher(self, args):
        listed = voucher_tools.execute_get_applicable_vouchers(self.session_id)
        code = args['voucher_code'].strip().upper()
        candidates = listed.get('vouchers') or []
        if not self.context['business']['cart']['items'] or not any(str(r.get('ma_voucher') or r.get('voucher_code')).upper() == code for r in candidates):
            return denied('voucher_not_eligible')
        result = self._write('apply_voucher', args, lambda: voucher_tools.execute_apply_voucher(self.session_id, code))
        if result.get('status') == 'ok':
            self._invalidate_summary()
        return result

    def _remove_voucher(self, args):
        result = self._write('remove_voucher', args, lambda: voucher_tools.execute_remove_voucher(self.session_id))
        if result.get('status') == 'ok':
            self._invalidate_summary()
        return result

    def _set_session_branch(self, args):
        bid = args['branch_id']
        if bid not in self.entry_branches:
            return denied('customer_branch_selection_required')
        row = next((r for r in self.artifacts.visible.get('branches', []) if str(r.get('branch_id') or r.get('ma_chi_nhanh')) == bid), None)
        if not row or row.get('availability_status') in {'unavailable', 'unverified', 'unknown'}:
            return denied('branch_unavailable_or_unknown')
        from src.common.inventory_validation import validate_cart_at_branch
        from src.function_calling.helpers import _get_engine
        cart = {**cart_manager.get_cart(self.session_id), 'branch_id': bid}
        checked = validate_cart_at_branch(_get_engine(), cart)
        if checked['unavailable'] or checked['unverified']:
            return denied('branch_unavailable_or_unknown')
        result = self._write('set_session_branch', args, lambda: branch_tools.execute_set_session_branch(
            self.session_id, bid, row.get('branch_name') or row.get('ten_chi_nhanh') or '', customer_selected=True))
        if result.get('status') == 'ok':
            self._invalidate_summary()
            cart_manager.set_checkout_context(self.session_id, location_pending=None, address_change_requested=None)
        return result

    def _set_checkout_choices(self, args):
        if not args:
            return denied('missing_choice')
        # Reuse the established deterministic parser only as independent safety
        # evidence for explicit choices. The model still owns intent/planning.
        from src.agents.agent_service import _explicit_checkout_choices
        explicit = _explicit_checkout_choices(self.user_message)
        conflicts = {key: {'expected': value, 'proposed': args.get(key)}
                     for key, value in explicit.items() if args.get(key) and args[key] != value}
        if conflicts:
            return denied('checkout_choice_conflict', conflicts=conflicts,
                recovery='Use the explicit current-turn checkout choice.')
        if args.get('payment_method') == 'VI_DIEN_TU':
            wallet_error = cart_tools.validate_wallet_selection(self.session_id)
            if wallet_error:
                return denied('wallet_unavailable', message=wallet_error.get('reply'))
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        changed = any(prefs.get(key) != value for key, value in args.items())
        cart_manager.set_checkout_prefs(self.session_id, **args)
        if args.get('delivery_type'):
            cart_manager.set_checkout_context(self.session_id, checkout_requested=True)
        if args.get('delivery_type') and args['delivery_type'] != prefs.get('delivery_type'):
            cart_manager.clear_branch(self.session_id)
            cart_manager.set_checkout_context(self.session_id, address_confirmed=None, branch_candidates=None)
            self.artifacts.visible['branches'] = []
        if changed:
            self._invalidate_summary()
        return {'status': 'ok', 'choices': args}

    def _resolve_location(self, args):
        from src.agents.order_flow_graph import _handle_location_request, _persist_branch_candidates_from_result
        from src.agents.location_parser import Location
        if args.get('for_checkout'):
            if not self.context['business']['cart']['items'] or not cart_manager.get_checkout_prefs(self.session_id).get('delivery_type'):
                return denied('checkout_location_preconditions_missing')
            cart_manager.set_checkout_context(self.session_id, checkout_requested=True)
        state = {'session_id': self.session_id, 'user_message': args['location'], 'history': [],
            'cart': cart_manager.get_cart(self.session_id), 'force_read_only_location': not args.get('for_checkout'),
            'location_override': Location(args['kind'], args['location'])}
        if getattr(self, '_selected_location', None):
            state['resolved_location_candidate'] = self._selected_location
        result = _handle_location_request(state)
        if args.get('for_checkout'):
            _persist_branch_candidates_from_result(self.session_id, result)
        nearest = next((r['result'] for r in result.get('tool_calls_log', []) if r['tool'] == 'find_nearest_branch'), {})
        # The generic business adapter owns promotion. A selected provider
        # candidate is reused with immutable coordinates, never re-geocoded.
        if (getattr(self, '_selected_location', None) and args.get('for_checkout')
                and cart_manager.get_checkout_prefs(self.session_id).get('address_confirmed')):
            cart_manager.set_checkout_context(self.session_id, location_candidate_snapshot=None,
                selected_location_candidate=None, location_pending=None)
            if (cart_manager.get_pending_action(self.session_id) or {}).get('type') == 'select_location_candidate':
                cart_manager.clear_pending_action(self.session_id)
            self.artifacts.visible['location_candidates'] = []
        return {**nearest, 'status': nearest.get('status') or 'needs_location', 'message': result['reply']}

    def _select_location_candidate(self, args):
        candidate = next((r for r in self.artifacts.visible.get('location_candidates', []) if r.get('candidate_id') == args['candidate_id']), None)
        if not candidate:
            return denied('unknown_location_candidate')
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        address = candidate.get('display_address') or candidate.get('normalized_label')
        kind = 'poi'
        if prefs.get('delivery_type') == 'GIAO_TAN_NOI':
            from src.agents.location_parser import parse_location
            parsed = parse_location(address)
            if parsed.kind != 'address' or parsed.missing:
                return denied('incomplete_delivery_address')
            kind = 'address'
        self._selected_location = candidate
        try:
            return self._resolve_location({'location': address, 'kind': kind,
                'for_checkout': bool(prefs.get('checkout_requested'))})
        finally:
            self._selected_location = None

    def _request_checkout(self, args):
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        cart = self.context['business']['cart']
        if not cart['items']:
            return denied('empty_cart')
        if self.context['business'].get('pending_products') or prefs.get('pending_product_reference'):
            return denied('needs_options')
        if not prefs.get('voucher_decided') or prefs.get('voucher_revalidation_required'):
            return denied('need_voucher_decision')
        missing = [key for key in ('delivery_type', 'payment_method') if not prefs.get(key)]
        if not cart.get('branch_id'):
            missing.append('branch')
        if prefs.get('delivery_type') == 'GIAO_TAN_NOI' and (
                not prefs.get('delivery_address') or not prefs.get('address_confirmed')):
            missing.append('delivery_address')
        if missing:
            return denied('checkout_preconditions_missing', missing=missing)
        fresh = (prefs.get('checkout_action_id') and prefs.get('summary_fingerprint') == cart_manager.cart_fingerprint(self.session_id)
                 and float(prefs.get('checkout_action_expires_at') or 0) > time.time())
        return cart_tools.execute_request_checkout(self.session_id, reuse_summary=bool(fresh) or args.get('reuse_summary', False))

    def _confirm_checkout(self, args):
        from src.agents.tier1 import classify_confirmation
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        if (not self.entry_action or args['action_id'] != self.entry_action
                or args['action_id'] != prefs.get('checkout_action_id')
                or (cart_manager.get_pending_action(self.session_id) or {}).get('type') != 'confirm_checkout'
                or classify_confirmation(self.user_message, 'confirm_checkout') != 'YES'
                or prefs.get('summary_fingerprint') != cart_manager.cart_fingerprint(self.session_id)
                or float(prefs.get('checkout_action_expires_at') or 0) <= time.time()):
            return denied('confirmation_required')
        return self._write('confirm_checkout', args, lambda: cart_tools.execute_confirm_checkout(self.session_id, action_id=args['action_id']))

    def _get_product_description(self, args):
        if self.request_route.get('owner') in {'price', 'inventory', 'review'}:
            return denied('wrong_authority', requested_authority=self.request_route.get('owner'),
                allowed_tools=['get_product_insights'] if self.request_route.get('owner') == 'review'
                else ['check_price_and_stock'])
        product = self._product(args['product_id'])
        if not product:
            return denied('unknown_product_reference')
        return self._search_knowledge_base({'query': args.get('query') or product['product_name'],
            'domain': 'product_description', 'entity_type': 'product', 'entity_id': args['product_id']})

    def _search_knowledge_base(self, args):
        from src.function_calling.tools.knowledge_tools import execute_search_knowledge_base
        args = dict(args)
        if self.request_route.get('owner') in {'price', 'inventory', 'review'}:
            return denied('wrong_authority', requested_authority=self.request_route.get('owner'),
                allowed_tools=['get_product_insights'] if self.request_route.get('owner') == 'review'
                else ['check_price_and_stock'])
        entity_id = args.get('entity_id')
        product = self._product(entity_id) if entity_id else None
        if entity_id and not product:
            return denied('unknown_product_reference')
        if product:
            self.artifacts.focus['product'] = {'product_id': str(product['product_id']),
                'product_name': product['product_name'], 'source': 'canonical_knowledge_reference'}
        reference = {'product': product, 'reference_source': 'canonical_snapshot'} if product else {}
        result = execute_search_knowledge_base(**args, session_id=self.session_id, reference_out=reference)
        from src.rag.authority import knowledge_route
        facet = knowledge_route(args['query']).get('facet')
        if facet == 'allergen':
            from src.agents.knowledge_consultation import grounded_answer
            result = {**result, 'status': 'not_found', 'results': [], 'message': grounded_answer(args['query'], result)}
        elif facet == 'ingredient':
            from src.rag.documents import normalize_text
            from src.function_calling.tools.knowledge_tools import INSUFFICIENT_MESSAGE
            requested = [term for term in ('sua', 'caffein', 'caffeine') if term in normalize_text(args['query']).split()]
            if not all(any(term in normalize_text(d['content']).split() for d in result.get('results', [])) for term in requested):
                result = {**result, 'status': 'not_found', 'results': [], 'message': INSUFFICIENT_MESSAGE}
        return result

    def _get_cart_quote(self, args):
        return cart_tools.execute_get_cart_quote(self.session_id)

    def _get_payment_options(self, args):
        quoted = cart_tools.execute_get_cart_quote(self.session_id)
        amount = (quoted.get('quote') or {}).get('final_total')
        return {'status': 'ok', **cart_tools.get_wallet_payment_options(self.session_id, amount)}

    @staticmethod
    def model_result(result):
        # Full results stay in server logs/UI. Provider sees only bounded data.
        return compact(result)
