"""Deterministic gateway for untrusted LLM tool proposals in the customer BPM."""
from copy import deepcopy
import hashlib
import json
import logging
import re
import time

from src.agents.agent_context import business_state
from src.agents.agent_memory import compact
from src.agents.checkout_contract import missing_checkout_fields, checkout_guidance
from src.agents.discovery_contract import DISCOVERY_TOOLS, normalize_discovery_args, discovery_signature
from src.agents.tool_capabilities import CAPABILITIES, capabilities_for_context, tool_schemas, validate_args
from src.common import cart_manager
from src.function_calling.tools import TOOL_EXECUTORS
from src.function_calling.tools import cart_tools, product_tools, branch_tools, voucher_tools
from src.rag.authority import knowledge_route
from src.rag.documents import normalize_text

logger = logging.getLogger(__name__)


class MutationOutcomeUnknown(RuntimeError):
    """Propagate to the existing durable HTTP claim/reconciliation boundary."""


def denied(code, **details):
    default_messages = {
        'invalid_arguments': 'Thông tin yêu cầu chưa đầy đủ hoặc không hợp lệ. Bạn vui lòng kiểm tra và gửi lại nhé.',
        'capability_not_available': 'Chức năng này hiện chưa được hỗ trợ hoặc chưa khả dụng trong bối cảnh này. Bạn vui lòng kiểm tra lại thao tác nhé.',
        'invalid_edit_request': 'Yêu cầu sửa đơn chưa rõ ràng. Bạn có thể nói rõ món hoặc số thứ tự món và tuỳ chọn/món muốn đổi nhé.',
        'confirmation_operation_locked': 'Thao tác đang chờ xác nhận hoặc huỷ bỏ trước khi thực hiện bước tiếp theo.',
        'provider_unavailable': 'Hệ thống đang bận hoặc tạm thời gián đoạn kết nối. Bạn thử lại sau ít phút nhé.',
        'transaction_completed_or_processing': 'Giao dịch đang được xử lý hoặc đã hoàn tất, không thể thực hiện thêm thay đổi.',
        'authoritative_cart_unavailable': 'Chưa thể tải dữ liệu giỏ hàng. Bạn vui lòng thử lại nhé.',
        'authentication_or_turn_required': 'Bạn vui lòng đăng nhập để thực hiện thao tác này nhé.',
        'order_target_mismatch': 'Mã đơn được chọn khác với mã bạn yêu cầu. Bạn gửi lại đúng mã đơn nhé.'
    }
    msg = details.pop('message', None) or default_messages.get(code, 'Chưa thể thực hiện yêu cầu này an toàn. Bạn kiểm tra lựa chọn hoặc bổ sung thông tin nhé.')
    return {'status': code, 'message': msg, **details}


class GuardedToolGateway:
    def __init__(self, session_id, user_message, context, artifacts, client_message_id=None, shadow=False,
                 allowed_capabilities=None):
        self.session_id, self.user_message = session_id, user_message
        self.context, self.artifacts = context, artifacts
        self.client_message_id, self.shadow = client_message_id, shadow
        self.allowed = frozenset(CAPABILITIES if allowed_capabilities is None else allowed_capabilities)
        self.filtering_enabled = allowed_capabilities is not None
        self.schemas = {r['function']['name']: r['function']['parameters'] for r in tool_schemas(self.allowed)}
        self.cache, self.provenance = {}, []
        self.business_revision, self.read_cache_hits = 0, 0
        self.write_started = False
        from src.agents.order_management import management_scope, management_kind, active_edit_focus, recent_order_read, order_reference
        self.context['order_management'] = management_scope(user_message, context['business'].get('checkout') or {})
        self.context['order_management_kind'] = management_kind(user_message, context['business'].get('checkout') or {})
        self.context['recent_order_read'] = recent_order_read(user_message)
        self.entry_order_reference = order_reference(user_message, artifacts.visible.get('orders'))
        if self.entry_order_reference and self.entry_order_reference['status'] == 'ok':
            self.context['order_reference'] = self.entry_order_reference
        self.entry_order_focus = active_edit_focus(user_message, context['business'].get('checkout') or {})
        self.entry_order_action = deepcopy((context['business'].get('checkout') or {}).get('order_management_action'))
        order_language = normalize_text(user_message)
        explicit_order_id = re.search(r'\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b', user_message.lower())
        draft_summary = (context['business'].get('checkout') or {}).get('checkout_action_id')
        past_order_action = re.search(r'\b(?:huy don|sua don|doi don|dat lai|mua lai|don da dat|don vua dat)\b', order_language)
        self.existing_order_request = bool((explicit_order_id or self.entry_order_action or self.entry_order_focus or (past_order_action and not draft_summary))
            and not re.search(r'\bgio hang\b', order_language))
        self.entry_action = (context['business'].get('checkout') or {}).get('checkout_action_id')
        self.entry_vouchers = deepcopy(artifacts.visible.get('vouchers') or [])
        self.entry_profile_offer = deepcopy((context['business'].get('checkout') or {}).get('profile_location_offer'))
        self.entry_fingerprint = cart_manager.cart_fingerprint(session_id) if not shadow else None
        self.confirmation_recovery = None
        self.summary_refreshed = False
        self.options = {}
        self.updated_products = set()
        self.entry_cart_lines = deepcopy(context['business']['cart'].get('items') or [])
        self.entry_products = deepcopy(artifacts.visible.get('products') or [])
        self.entry_focus = deepcopy(artifacts.focus.get('product'))
        from src.agents.cart_edit_evidence import edit_plan, pending_option_followup
        artifacts.cart_edit_plan = edit_plan(user_message, self.entry_cart_lines)
        self.entry_cart_option_edit = (context['business'].get('checkout') or {}).get('pending_cart_option_edit')
        self.cart_option_followup = pending_option_followup(user_message, self.entry_cart_option_edit, self.entry_cart_lines)
        if not artifacts.cart_edit_plan and self.cart_option_followup:
            artifacts.cart_edit_plan = [self.cart_option_followup]
        artifacts.cart_option_followup = self.cart_option_followup
        if len(artifacts.cart_edit_plan) > 1:
            context['turn_cart_ordinals'] = artifacts.turn_cart_ordinals = {
                str(row['cart_item_id']): row['display_index'] for row in self.entry_cart_lines}
        self.denied_cart_operation = None
        self.repair_tool = None
        self.request_route = knowledge_route(user_message)
        self.entry_branches = {str(r.get('branch_id') or r.get('ma_chi_nhanh')) for r in artifacts.visible.get('branches', [])}
        self.handlers = {name: getattr(self, '_'+name) for name in (
            'get_product_options', 'add_to_cart', 'update_cart_item', 'remove_cart_item', 'finish_cart',
            'skip_voucher', 'apply_voucher', 'remove_voucher', 'discard_pending_product', 'set_session_branch', 'set_checkout_choices',
            'resolve_location', 'select_location_candidate', 'request_checkout', 'confirm_checkout',
            'search_knowledge_base', 'get_product_description', 'get_cart_quote', 'get_payment_options',
            'cancel_order', 'update_order', 'reorder_order', 'confirm_order_change', 'discard_order_change')}

    def executors(self):
        return {name: (lambda args, session_id, n=name: self.dispatch(n, args)) for name in self.schemas}

    def tool_surface(self, final_only=False, repair_tool=None):
        self.filtering_enabled = True
        self.context['visible'] = self.artifacts.visible
        self.context['focus'] = self.artifacts.focus
        # Candidate identity enables fact/option capabilities without pretending
        # those candidates already have customer-visible ordinals.
        self.context['discovery_candidates_available'] = bool(self.artifacts.product_candidates)
        self.repair_tool = repair_tool
        self.allowed = capabilities_for_context(self.context, entry_action=self.entry_action,
                                               final_only=final_only, repair_tool=repair_tool,
                                               confirmation_recovery=self.confirmation_recovery)
        rows = tool_schemas(self.allowed)
        self.schemas = {r['function']['name']: r['function']['parameters'] for r in rows}
        return rows, self.executors()

    def cache_key(self, name, args):
        revision = self.business_revision if name in CAPABILITIES and CAPABILITIES[name].access == 'READ' else 'write'
        if revision != 'write':
            # Service refresh precedes read cache lookup. External cart/version
            # and choice changes invalidate cached price/stock/quote/eligibility.
            revision = str(revision)+':'+hashlib.sha256(json.dumps(self.context['business'],
                sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()
        if name in DISCOVERY_TOOLS:
            return f'{revision}:' + discovery_signature(name, args)
        return f'{revision}:{name}:' + json.dumps(args, sort_keys=True, ensure_ascii=False, separators=(',', ':'))

    def dispatch(self, name, args):
        started = time.monotonic()
        capability = CAPABILITIES.get(name)
        if name == 'confirm_checkout' and self.confirmation_recovery is None:
            self.confirmation_recovery = 'confirm_checkout'
        if name == 'update_order' and isinstance(args, dict):
            args = dict(args)
            if 'order_id' in args and args['order_id'] is not None:
                args['order_id'] = str(args['order_id']).strip()
            if 'changes' in args and isinstance(args['changes'], list):
                norm_changes = []
                for ch in args['changes']:
                    if isinstance(ch, dict):
                        c = dict(ch)
                        if 'order_line_id' in c and c['order_line_id'] is not None:
                            try:
                                c['order_line_id'] = int(str(c['order_line_id']).strip())
                            except (ValueError, TypeError):
                                pass
                        if 'quantity' in c and c['quantity'] is not None:
                            try:
                                c['quantity'] = int(str(c['quantity']).strip())
                            except (ValueError, TypeError):
                                pass
                        if 'product_id' in c and c['product_id'] is not None:
                            c['product_id'] = str(c['product_id']).strip()
                        opts = dict(c.get('options') or {})
                        for opt_key, mapped_key in (('ice', 'luong_da'), ('sugar', 'do_ngot'), ('size', 'kich_co'), ('kich_co', 'kich_co')):
                            if opt_key in c:
                                opts[mapped_key] = c.pop(opt_key)
                            elif opt_key in opts and mapped_key not in opts:
                                opts[mapped_key] = opts[opt_key]
                        if opts:
                            c['options'] = opts
                        norm_changes.append(c)
                    else:
                        norm_changes.append(ch)
                args['changes'] = norm_changes

        if not capability or name not in self.schemas or not validate_args(args, self.schemas[name]):
            spec = self.schemas.get(name) or {}
            denied_msg = None
            if name == 'update_order':
                denied_msg = "Yêu cầu sửa đơn hàng chưa đầy đủ hoặc không hợp lệ. Bạn có thể nói rõ món hoặc số thứ tự món và tuỳ chọn muốn đổi (ví dụ: 'đổi món 2 sang ít đá' hoặc 'đổi món 2 sang Trà Sữa') nhé."
            result = denied('invalid_arguments',
                message=denied_msg,
                required_fields=spec.get('required', []),
                allowed_fields=list(spec.get('properties', {})))
            if name == 'confirm_checkout':
                self.confirmation_recovery = 'confirm_checkout' if name in self.schemas else 'stop'
                result['recovery_tool'] = 'confirm_checkout' if name in self.schemas else None
            self.artifacts.collect(name, args, result)
            record = {'tool_name': name, 'read_or_write': capability.access if capability else 'UNKNOWN',
                'owner': capability.owner if capability else 'unregistered',
                'validated_args_summary': sorted(args) if isinstance(args, dict) else [],
                'guardrail_result': 'invalid_arguments',
                'latency_ms': round((time.monotonic()-started)*1000, 2), 'mutation_evidence_present': False}
            self.provenance.append(record)
            logger.info('[ToolGateway] %s', json.dumps(record))
            return result
        # Reads are scoped to a business revision; writes retain the original
        # operation/signature replay fence and are never memoized as reads.
        if not self.shadow:
            self.context['business'] = business_state(self.session_id)
        if name in DISCOVERY_TOOLS:
            args = dict(args)
            plan = args.get('planned_discovery_reads')
            # Retain the established category safety correction before both
            # authority execution and normalized cache/batch signatures.
            from src.agents.shopping_language import requested_product_category
            category = requested_product_category(self.user_message)
            from src.agents.shopping_language import normalize_shopping
            mixed = bool(re.search(r'\b(?:nuoc|do uong|ly)\b', normalize_shopping(self.user_message))
                         and re.search(r'\b(?:banh|do an)\b', normalize_shopping(self.user_message)))
            if not (type(plan) is int and plan > 1) and not mixed:
                if category or args.get('category') in {'drink', 'food'}:
                    args['category'] = category or 'all'
            if (args.get('category') in {'drink', 'food'} and normalize_shopping(args.get('search_text'))
                    in {'nuoc', 'mon nuoc', 'do uong', 'thuc uong', 'banh', 'do an', 'thuc an'}):
                args['search_text'] = ''  # Category words are not literal product-name constraints.
            scope = self.artifacts.discovery_scope
            if scope:
                args['category'] = scope['category']
                # Retries cannot remove the customer's flavour constraint just
                # to fill a desired result count with unrelated products.
                args['search_text'] = scope['search_text']
                if scope['requested_count']:
                    args['limit' if name == 'filter_catalog' else 'top_k'] = scope['requested_count']
            # A declared multi-arm plan owns each arm's category. The older
            # single-scope correction must not collapse food/drink comparisons.
            args = normalize_discovery_args(name, args)
            if plan is not None:
                args['planned_discovery_reads'] = plan
        signature = self.cache_key(name, args)
        if signature in self.cache and self.confirmation_recovery is None:
            if capability.access == 'READ':
                self.read_cache_hits += 1
                reused = {**deepcopy(self.cache[signature]), 'same_turn_read_reused': True}
                if name in DISCOVERY_TOOLS:
                    self.artifacts.collect(name, args, reused)
                return reused
            return self.cache[signature]
        if self.shadow:
            result = {'status': 'shadow_only', 'proposed_tool': name, 'access': capability.access}
        else:
            state = self.context['business']
            legal_now = capabilities_for_context({**self.context, 'visible': self.artifacts.visible,
                'focus': self.artifacts.focus, 'discovery_candidates_available': bool(self.artifacts.product_candidates)},
                entry_action=self.entry_action, repair_tool=self.repair_tool,
                confirmation_recovery=self.confirmation_recovery)
            if self.confirmation_recovery is not None and (
                    name != self.confirmation_recovery or self.summary_refreshed):
                result = denied('confirmation_operation_locked')
            elif (not state['authenticated'] and state.get('guest_session_id') and name not in {
                    'filter_catalog', 'get_recommendations', 'search_knowledge_base', 'get_product_description',
                    'get_product_options', 'get_product_insights', 'check_price_and_stock', 'find_nearest_branch',
                    'get_cart', 'get_cart_quote', 'add_to_cart', 'update_cart_item', 'remove_cart_item',
                    'discard_pending_product', 'finish_cart'}):
                result = self._login_required()
            elif self.filtering_enabled and name not in legal_now and capability.access != 'READ':
                result = denied('capability_not_available')
            elif capability.access != 'READ' and (not (state['authenticated'] or state.get('guest_session_id')) or not self.client_message_id):
                result = denied('authentication_or_turn_required')
            elif capability.access != 'READ' and name not in {'resolve_location', 'select_location_candidate', 'set_checkout_choices', 'cancel_order', 'update_order', 'reorder_order', 'confirm_order_change', 'discard_order_change'} and not state['cart_verified']:
                result = denied('authoritative_cart_unavailable')
            elif state['checkout'].get('checkout_submission') and capability.access != 'READ' and name not in {'confirm_checkout', 'cancel_order', 'update_order', 'reorder_order', 'confirm_order_change', 'discard_order_change'}:
                result = denied('transaction_completed_or_processing')
            else:
                handler = self.handlers.get(name)
                try:
                    cart_mutations = {'add_to_cart', 'update_cart_item', 'remove_cart_item'}
                    if name in cart_mutations and self.existing_order_request:
                        result = denied('existing_order_tools_required', message='Bạn đang thao tác đơn đã đặt; mình cần dùng đúng đơn đó, không đổi giỏ hàng hiện tại ạ.')
                    elif name in cart_mutations and self.denied_cart_operation not in {None, name}:
                        result = denied('conflicting_cart_operations',
                            active_operation=self.denied_cart_operation, proposed_operation=name)
                    else:
                        result = handler(args) if handler else self._read(name, args)
                        if (name in cart_mutations
                                and result.get('status') not in {'ok', 'already_processed', 'needs_options'}):
                            self.denied_cart_operation = name
                        elif name == self.denied_cart_operation and result.get('status') in {'ok', 'already_processed'}:
                            self.denied_cart_operation = None
                except MutationOutcomeUnknown:
                    raise
                except Exception as exc:
                    if self.write_started and capability.access != 'READ':
                        raise MutationOutcomeUnknown('business write requires reconciliation') from exc
                    logger.warning('[ToolGateway] tool=%s error_type=%s', name, type(exc).__name__)
                    result = denied('provider_unavailable')
        if name in DISCOVERY_TOOLS and self.artifacts.discovery_scope and result.get('status') in {'ok', 'not_found'}:
            from src.agents.product_display import product_bucket
            scope = self.artifacts.discovery_scope
            rows = [row for row in result.get('products') or [] if isinstance(row, dict)
                and product_bucket(row) == scope['category']
                and all(re.search(r'\b' + re.escape(term) + r'\b', normalize_text(' '.join(str(row.get(key) or '')
                    for key in ('product_name', 'category', 'parent_category'))))
                    for term in scope['search_text'].split())]
            result = {**result, 'status': 'ok' if rows else 'not_found', 'products': rows}
            if not rows:
                result['message'] = (f"Dạ, mình chưa tìm thấy món {scope['label']} phù hợp trong Menu lúc này. "
                    'Bạn muốn tham khảo loại bánh khác không ạ?')
        if not self.shadow:
            result = self._presentation_result(name, result)
        from src.agents.tool_artifacts import public_result
        if name == 'confirm_checkout' and result.get('status') != 'invalid_arguments' and self.confirmation_recovery == 'confirm_checkout':
            self.confirmation_recovery = 'stop'
        result = public_result(result)
        if len(self.artifacts.cart_edit_plan) > 1 and name in {'update_cart_item', 'remove_cart_item'}:
            from src.agents.cart_edit_evidence import unfinished_edits
            result['remaining_cart_edits'] = len(unfinished_edits(self.artifacts.cart_edit_plan,
                self.artifacts.logs + [{'tool': name, 'args': args, 'result': result}]))
        if capability.access == 'READ' or result.get('status') in {'ok', 'already_processed', 'needs_options', 'require_confirmation'}:
            self.cache[signature] = result
        self.artifacts.collect(name, args, result)
        if capability.access != 'READ':
            self.business_revision += 1  # Also invalidate on uncertain/denied state adapters.
            if not self.shadow:
                self.context['business'] = business_state(self.session_id)
        self.context['visible'], self.context['focus'] = self.artifacts.visible, self.artifacts.focus
        self.artifacts.business = self.context['business']
        record = {'tool_name': name, 'read_or_write': capability.access, 'owner': capability.owner,
            'validated_args_summary': sorted(args), 'guardrail_result': result.get('status'),
            'reference_source': 'current_authoritative_cart' if 'cart_item_id' in args else
                'canonical_provider_and_session_candidates' if any(k in args for k in ('product_id', 'branch_id', 'candidate_id', 'action_id', 'voucher_code', 'entity_id')) else 'server_scoped_tool',
            'latency_ms': round((time.monotonic()-started)*1000, 2),
            'mutation_evidence_present': capability.access != 'READ' and result.get('changed') is not False and result.get('status') in {'ok', 'already_processed'}}
        if name == 'confirm_checkout' and result.get('reason'):
            record['confirmation_denial_reason'] = result['reason']
        self.provenance.append(record)
        logger.info('[ToolGateway] %s', json.dumps(record))
        return result

    def _presentation_result(self, name, result):
        """Attach fresh read evidence to successful draft milestones for text and UI."""
        milestones = {'add_to_cart', 'update_cart_item', 'remove_cart_item', 'finish_cart',
                      'apply_voucher', 'skip_voucher', 'remove_voucher', 'set_checkout_choices'}
        if name not in milestones or result.get('status') not in {'ok', 'already_processed'}:
            return result
        if name == 'set_checkout_choices' and result.get('changed') is False:
            return result  # Preferences are unchanged; no new price/wallet read is needed.
        result = dict(result)
        if name == 'add_to_cart' and self.entry_cart_lines and not any(
                row.get('role') == 'assistant' and 'gio hang cua ban' in normalize_text(row.get('content'))
                for row in self.context.get('recent') or []):
            result['previous_cart_products'] = list(dict.fromkeys(
                row['product_name'] for row in self.entry_cart_lines if row.get('product_name')))
        # A read failure after a known write must preserve its success and replay identity.
        try:
            quoted = ({'status': 'ok', 'cart': result['cart'], 'quote': result['quote']}
                      if result.get('quote') and result.get('cart') else
                      cart_tools.execute_get_cart_quote(self.session_id))
        except Exception:
            quoted = {'status': 'error'}
        result['quote_status'] = quoted.get('status')
        for key in ('cart', 'quote'):
            if key in quoted:
                result[key] = quoted[key]
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        if (name in {'apply_voucher', 'skip_voucher', 'remove_voucher', 'finish_cart', 'set_checkout_choices'}
                and prefs.get('voucher_decided') and not prefs.get('voucher_revalidation_required')
                and quoted.get('status') == 'ok'):
            from src.agents.checkout_choices import FULFILLMENT_OPTIONS, FULFILLMENT_LABELS
            if not prefs.get('delivery_type'):
                result['fulfillment_options'] = [{'code': code, 'label': label}
                    for code, label in zip(FULFILLMENT_OPTIONS, FULFILLMENT_LABELS)]
            if not prefs.get('payment_method'):
                try:
                    result.update(cart_tools.get_wallet_payment_options(self.session_id,
                        (quoted.get('quote') or {}).get('final_total')))
                except Exception:
                    result['payment_options_status'] = 'unavailable'
        return result

    def _cancel_order(self, args):
        from src.agents.order_management import prepare
        if self._wrong_order_target(args):
            return denied('order_target_mismatch', message='Mã đơn được chọn khác mã bạn yêu cầu. Bạn gửi lại đúng mã đơn nhé.')
        return prepare(self.session_id, 'cancel_order', args, self.client_message_id)

    def _update_order(self, args):
        if args.get('changes'):
            args.pop('edit_request', None)
        elif args.get('edit_request') is not None:
            if normalize_text(args['edit_request']) == normalize_text(self.user_message):
                args['edit_request'] = self.user_message
            if args['edit_request'] != self.user_message or set(args) != {'order_id', 'edit_request'}:
                return denied('invalid_edit_request', message='Yêu cầu chỉnh sửa đơn hàng cần gửi kèm đúng nội dung yêu cầu của bạn.')
            from src.agents.order_edit_dialogue import accepts
            if not accepts(self.user_message, self.entry_order_focus):
                return denied('invalid_edit_request', message='Yêu cầu sửa đơn chưa rõ ràng. Bạn có thể nói rõ số lượng, tuỳ chọn đá/đường/size hoặc món muốn đổi nhé.')
        from src.agents.order_management import prepare
        if self._wrong_order_target(args):
            return denied('order_target_mismatch', message='Mã đơn được chọn khác mã bạn yêu cầu. Bạn gửi lại đúng mã đơn nhé.')
        return prepare(self.session_id, 'update_order', args, self.client_message_id)

    def _reorder_order(self, args):
        from src.agents.order_management import prepare
        if self._wrong_order_target(args):
            return denied('order_target_mismatch', message='Mã đơn được chọn khác mã bạn yêu cầu. Bạn gửi lại đúng mã đơn nhé.')
        return prepare(self.session_id, 'reorder_order', args, self.client_message_id)

    def _wrong_order_target(self, args):
        if self.entry_order_reference:
            return (self.entry_order_reference['status'] != 'ok'
                    or args['order_id'].lower() != self.entry_order_reference['order_id'])
        targets = re.findall(r'\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b', self.user_message.lower())
        return bool((targets and (len(set(targets)) != 1 or args['order_id'].lower() != targets[0])) or
            (not targets and self.entry_order_focus and args['order_id'].lower() != self.entry_order_focus['order_id']))

    def _confirm_order_change(self, args):
        from src.agents.order_management import confirm
        self.write_started = True
        return confirm(self.session_id, self.user_message, self.client_message_id, self.entry_order_action)

    def _discard_order_change(self, args):
        from src.agents.order_management import discard
        if not re.search(r'\b(?:khong|ko|k|chua|khoan|bo qua|dung)\b', normalize_text(self.user_message)):
            return denied('customer_decline_required')
        return discard(self.session_id)

    def _read(self, name, args):
        args = dict(args)
        if name in {'get_order_details', 'track_order_status'} and self._wrong_order_target(args):
            return denied('order_target_mismatch', message='Bạn chọn đúng số thứ tự hoặc mã đơn trong danh sách vừa xem nhé.')
        if name == 'get_order_details':
            from src.agents.order_management import details
            res = details(self.session_id, args['order_id'])
            if res.get('status') == 'ok' and res.get('can_update'):
                from src.common import cart_manager
                cart_manager.set_checkout_context(self.session_id, order_management_action=None, order_management_focus={
                    'kind': 'update_order',
                    'order_id': res['order_id'],
                    'expires_at': time.time() + 1800,
                    'edit_revision': res.get('revision') or (res.get('order') or {}).get('revision'),
                    'edit_lines': [{'id': r['id'], 'product_id': r.get('ma_san_pham'),
                                    'name': r.get('ten_san_pham') or r.get('product_name')} for r in ((res.get('order') or {}).get('chi_tiet') or [])]
                })
            return res
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
        if name in DISCOVERY_TOOLS:
            args.pop('planned_discovery_reads', None)
        if name == 'find_nearest_branch':
            return branch_tools.execute_find_nearest_branch(session_id='',
                cart_items=self.context['business']['cart'].get('items') or [], **args)
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
        rows += list(self.artifacts.product_candidates.values())  # Fresh ID authority, never ordinal authority.
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
            selected = self._add_selection_error(args['product_id']) is None
            self.artifacts.focus['product'] = {'product_id': args['product_id'],
                'product_name': result['product_name'], 'source': 'customer_selected_options'
                if selected else 'canonical_option_provider'}
            from src.agents.option_state import requests_custom_options
            if selected and requests_custom_options(self.user_message):
                staged = next((row for row in self.context['business'].get('pending_products', [])
                               if str(row.get('product_id')) == args['product_id']), {})
                choices = {**staged.get('selected_options', {}),
                    **{k: staged[k] for k in ('size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua') if k in staged}}
                product = self._stage_option_product(args['product_id'], result,
                    staged.get('quantity', 1), choices)
                return denied('needs_options', product=product, option_groups=product['option_schema'])
        return result

    def _stage_option_product(self, product_id, result, quantity, choices):
        """Keep a selected draft through the default/custom choice boundary."""
        from src.agents.option_state import option_schema_from_result
        product = {'product_id': product_id, 'product_name': result['product_name'],
                   'quantity': quantity, 'option_schema': option_schema_from_result(result), **choices}
        self._save_pending_product(product)
        return product

    def _save_pending_product(self, product):
        pending = self.context['business'].get('pending_products') or []
        pending = [product if str(row.get('product_id')) == product['product_id'] else row for row in pending]
        if not any(str(row.get('product_id')) == product['product_id'] for row in pending):
            pending.append(product)
        cart_manager.set_pending_products(self.session_id, pending)
        cart_manager.set_pending_action(self.session_id, 'fill_options', {'count': len(pending)})
        self.context['business'] = business_state(self.session_id)

    def _configured_product(self, product_id, values, defaults=False, require_all=True, quantity=None):
        from src.agents.option_state import (option_schema_from_result, option_field, resolve_option_default,
            uses_global_option_defaults, default_option_fields, declines_toppings)
        result = self._get_product_options({'product_id': product_id})
        if result.get('status') == 'needs_options':
            return None, result
        if result.get('status') != 'ok' or str(result.get('product_id')) != product_id:
            return None, denied('unknown_product')
        if require_all:
            staged = next((row for row in self.context['business'].get('pending_products', [])
                           if str(row.get('product_id')) == product_id), {})
            selected = {**staged.get('selected_options', {}),
                **{k: staged[k] for k in ('size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua') if k in staged}}
            if uses_global_option_defaults(self.user_message):
                # Model guesses are not defaults. Keep prior customer choices
                # and use Menu defaults for the rest, unless this turn changes them.
                for field, value in list(values.items()):
                    requested = value if isinstance(value, list) else [value]
                    if not requested or not all(re.search(r'(?<!\w)' + re.escape(normalize_text(item)) + r'(?!\w)',
                            normalize_text(self.user_message)) for item in requested):
                        values.pop(field, None)
            values = {**selected, **values}
            from src.agents.shopping_language import explicit_shopping_quantity
            explicit_quantity = explicit_shopping_quantity(self.user_message)
            expected_quantity = explicit_quantity if explicit_quantity is not None else staged.get('quantity', 1)
            if staged and quantity is not None and int(quantity) != int(expected_quantity):
                return None, denied('pending_quantity_conflict', expected_quantity=int(expected_quantity),
                    recovery='Preserve the staged quantity unless the current message explicitly changes it.')
            quantity = expected_quantity if staged else (quantity if quantity is not None else 1)
        groups, output, missing = option_schema_from_result(result), {}, []
        from src.agents.option_state import validate_explicit_multi_value_group, literal_option_choices
        option_message = self.user_message if require_all else getattr(self, 'active_edit_clause', self.user_message)
        literal_choices = literal_option_choices(option_message, groups)
        values.update(literal_choices)
        for group in groups:
            evidence = None if declines_toppings(option_message) else validate_explicit_multi_value_group(option_message, group, groups)
            if evidence and evidence['invalid_values']:
                choices = {value: [label for label in evidence['allowed_values']
                    if re.search(r'(?<!\w)' + re.escape(normalize_text(value)) + r'(?!\w)', normalize_text(label))]
                    for value in evidence['invalid_values']}
                if all(len(labels) > 1 for labels in choices.values()):
                    return None, denied('invalid_option', field='toppings', allowed_values=evidence['allowed_values'],
                        option_choices=choices, valid_values=evidence['valid_values'],
                        message='Dạ, mình chưa đổi topping vì **' + ', '.join(choices) + '** có nhiều loại: **' +
                            ', '.join(dict.fromkeys(label for labels in choices.values() for label in labels)) +
                            '**. Bạn chọn loại nào nhé?' + (' Mình đã ghi nhớ **' +
                            ', '.join(evidence['valid_values']) + '** để thêm cùng loại bạn chọn.' if evidence['valid_values'] else ''))
                return None, denied('invalid_option', field='toppings', allowed_values=evidence['allowed_values'],
                    message='Dạ, mình chưa áp dụng topping vì có lựa chọn chưa được xác nhận trong Menu. Bạn chọn giúp mình: **' + ', '.join(evidence['allowed_values']) + '** nhé.')
            if evidence and evidence['valid_values']:
                values['toppings'] = evidence['valid_values']
                literal_choices['toppings'] = evidence['valid_values']
        customizable = any(option_field(group['name']) == 'toppings' or len(group['values']) > 1 for group in groups)
        if defaults and customizable:
            if not uses_global_option_defaults(self.user_message):
                if require_all:
                    self._stage_option_product(product_id, result, quantity, {**selected, **literal_choices})
                return None, denied('defaults_not_authorized',
                    message='Dạ, bạn muốn dùng tùy chọn mặc định của quán hay tự chọn ạ?')
        # Defaults are authorized by the customer's text, even when the model
        # omitted use_defaults. Optional fields follow Menu defaults on omission.
        defaults = defaults or uses_global_option_defaults(self.user_message)
        scoped_defaults = default_option_fields(self.user_message)
        by_field = {option_field(g['name']): g for g in groups if option_field(g['name'])}
        if 'toppings' in by_field and declines_toppings(option_message):
            values['toppings'] = []
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
                # A single paid topping is still optional, never a fixed default.
                default = resolve_option_default(group, result.get('product_data')) if defaults or field in scoped_defaults or not group.get('required') or (
                    group.get('fixed') and field != 'toppings') else None
                if default is not None:
                    output[field] = default
                elif group.get('required'):
                    missing.append(field)
        product = {'product_id': product_id, 'product_name': result['product_name'],
                   'quantity': quantity or 1, 'option_schema': groups, **output}
        if missing:
            product['missing_fields'] = missing
            # merge=True keeps the old same-name row, losing partial options.
            self._save_pending_product(product)
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
        selection_error = self._add_selection_error(args['product_id'])
        if selection_error:
            if selection_error.get('browse_args'):
                # Recover a mistaken add proposal with a read, never another write
                # or model call. The same catalog read retains its normal cache/UI.
                self.dispatch('filter_catalog', selection_error['browse_args'])
            return selection_error
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

    def _add_selection_error(self, product_id):
        from src.agents.shopping_language import interpret_shopping, normalize_shopping
        from src.agents.selection_language import parse_selection_reference, product_reference_category, PRODUCT_REFERENCE_CATEGORIES
        from src.agents.option_state import uses_global_option_defaults, requests_custom_options
        from src.agents.product_display import product_bucket
        pending = self.context['business'].get('pending_products') or []
        text = normalize_shopping(self.user_message)
        option_reply = (uses_global_option_defaults(self.user_message)
                        or requests_custom_options(self.user_message)
                        or bool(re.search(r'\b(?:size|topping|da|ngot|sua)\b', text))
                        or text in {'oke', 'ok', 'dong y', 'duoc', 'oke ban'})
        option_reply = option_reply and '?' not in self.user_message and not re.search(r'\b(?:bao nhieu|la gi|the nao|tham khao|xem truoc)\b', text)
        if option_reply and not pending and self.entry_focus and self.entry_focus.get('source') in {None, 'customer_selected_options'}:
            if str(self.entry_focus.get('product_id')) == product_id:
                return None
        if pending and option_reply:
            if any(str(row.get('product_id')) == product_id for row in pending):
                return None
            return denied('product_choice_required', message='Dạ, mình đang hoàn thiện món bạn đã chọn; mình chưa thêm món khác ạ.')
        if str(self.context.get('selected_product_id') or '') == product_id:
            return None
        reference = parse_selection_reference(self.user_message, active_namespace='PRODUCT', allow_multiple=True)
        targets = []
        for index, ordinal in enumerate(reference.ordinals):
            label = reference.ordinal_labels[index] if index < len(reference.ordinal_labels) else ''
            category = product_reference_category(label)
            rows = [row for row in self.entry_products if not category or product_bucket(row) == category]
            index_field = 'group_display_index' if category else 'display_index'
            targets.extend(row for position, row in enumerate(rows, 1) if (row.get(index_field) or position) == ordinal)
        interpreted = interpret_shopping(self.user_message, snapshot=self.entry_products,
            active_catalog=list(self.artifacts.product_candidates.values()) + list(self.options.values()),
            ordinal_targets=targets, ordinal_requested=reference.requested,
            ordinal_invalid=reference.namespace not in {None, 'PRODUCT'} and not (
                reference.namespace == 'MIXED' and all(label in PRODUCT_REFERENCE_CATEGORIES for label in reference.ordinal_labels)),
            focus=self.entry_focus)
        if (interpreted.act == 'PRODUCT_INFO' and option_reply
                and not re.search(r'\b(?:gia|review|danh gia|thanh phan|ngon)\b', text)
                and re.search(r'\b(?:mua|lay|them|dat)\b', text)):
            if any(str(row.get('product_id')) == product_id and normalize_shopping(row.get('product_name')) in text
                   for row in interpreted.targets):
                return None
        if interpreted.act == 'ADD_ITEM' and any(str(row.get('product_id')) == product_id for row in interpreted.targets):
            return None
        browse = {'category': interpreted.category or 'all', 'search_text': interpreted.search_text or '', 'limit': 5}
        return denied('product_choice_required', **({'browse_args': browse} if interpreted.act == 'BROWSE_FAMILY' else {}),
            message='Dạ, mình chưa thêm món này vào giỏ. Bạn chọn **tên món hoặc số trong danh sách** nhé; yêu cầu xem một loại bánh/nước là để mình tư vấn trước ạ.')

    def _cart_line(self, line_id):
        return next((r for r in self.context['business']['cart']['items']
                     if str(r.get('cart_item_id') or r.get('line_id')) == line_id), None)

    def _cart_target_error(self, line, operation=None):
        """Independently validate explicit ordinal/name evidence before writes."""
        self.active_edit_clause = self.user_message
        if self.cart_option_followup and operation == 'update_cart_item':
            if str(line['cart_item_id']) != self.cart_option_followup['cart_item_id']:
                return denied('cart_reference_conflict', expected_cart_item_id=self.cart_option_followup['cart_item_id'])
            self.active_edit_clause = self.cart_option_followup['clause']
            return None
        if self.entry_cart_option_edit and not self.artifacts.cart_edit_plan:
            return denied('cart_change_not_requested',
                message='Dạ, mình chưa đổi topping. Bạn chọn rõ loại topping cho món đang chờ, hoặc cho mình tên món và thay đổi muốn thực hiện nhé.')
        from src.agents.cart_edit_evidence import edit_clauses, clause_targets, clause_operation
        clauses = edit_clauses(self.user_message, self.entry_cart_lines)
        if not clauses and re.search(r'^(?:tai sao|vi sao|sao)\b|\b(?:khong|chua|dung)\s+(?:(?:muon|can|hay)\s+)?(?:xoa|bo|chinh|sua|doi|tang|giam)\b',
                                     normalize_text(self.user_message)):
            return denied('cart_change_not_requested', message='Dạ, mình giữ nguyên món trong giỏ, chưa thực hiện thay đổi nào ạ.')
        if clauses:
            relevant = [clause for clause in clauses if clause_operation(clause) == operation]
            if not relevant:
                return denied('cart_change_not_requested',
                    message='Dạ, mình giữ nguyên tùy chọn các món còn lại theo yêu cầu hiện tại của bạn ạ.')
            for clause in relevant:
                targets = clause_targets(clause, self.entry_cart_lines)
                if len(targets) == 1 and str(targets[0].get('cart_item_id') or targets[0].get('line_id')) == str(line['cart_item_id']):
                    self.active_edit_clause = clause
                    return None
            if relevant:
                targets = [row for clause in relevant for row in clause_targets(clause, self.entry_cart_lines)]
                if len(targets) > 1:
                    return denied('ambiguous_cart_target', message='Dạ, giỏ có nhiều dòng phù hợp. Bạn chọn **số dòng trong giỏ** giúp mình nhé.')
                from src.agents.selection_language import parse_selection_reference
                if not targets and len(clauses) == 1 and not parse_selection_reference(
                        relevant[0], active_namespace='CART_LINE', allow_multiple=True).requested:
                    focus_rows = [row for row in self.entry_cart_lines if str(row.get('product_id')) == str((self.entry_focus or {}).get('product_id'))]
                    if len(focus_rows) == 1 and str(focus_rows[0]['cart_item_id']) == str(line['cart_item_id']):
                        self.active_edit_clause = relevant[0]
                        return None
                return denied('cart_reference_conflict',
                    expected_cart_item_id=str(targets[0]['cart_item_id']) if len(targets) == 1 else None,
                    message='Dạ, mình chưa sửa món vì chưa xác định đúng dòng bạn muốn đổi. Bạn cho mình **tên món hoặc số trong giỏ** nhé.')
        if operation == 'remove_cart_item':
            return denied('cart_change_not_requested',
                message='Dạ, món này đang có trong giỏ từ trước. Mình chưa xóa món; bạn có muốn **bỏ món đó khỏi giỏ** không ạ?')
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
        target_error = self._cart_target_error(line, 'update_cart_item')
        if target_error:
            return target_error
        entry_line = next((row for row in self.entry_cart_lines if str(row['cart_item_id']) == args['cart_item_id']), line)
        if args.get('cart_line_ordinal') and entry_line.get('display_index') != args['cart_line_ordinal']:
            expected = next((row for row in self.entry_cart_lines
                             if int(row.get('display_index') or 0) == args['cart_line_ordinal']), None)
            return denied('cart_reference_conflict', proposed_ordinal=line.get('display_index'),
                expected_cart_item_id=str(expected.get('cart_item_id') or expected.get('line_id')) if expected else None,
                expected_product_name=expected.get('product_name') if expected else None)
        patch = dict(args['desired_state'])
        if self.cart_option_followup:
            # Models may echo the complete existing configuration for a short
            # answer. Repeated values are not additional customer changes.
            # Bind to the saved line, discard unchanged fields, and validate
            # only the customer's saved + current topping choices against Menu.
            if any(line.get(key) != value for key, value in patch.items() if key != 'toppings'):
                return denied('cart_fields_not_requested', requested_fields=['toppings'],
                    message='Dạ, mình chưa cập nhật vì đề xuất còn thay đổi tùy chọn khác ngoài topping bạn vừa chọn. Bạn nhắc lại loại topping muốn chọn nhé.')
            patch = {'toppings': patch.get('toppings', [])}
        request = next((row for row in self.artifacts.cart_edit_plan
            if row['tool'] == 'update_cart_item' and row['cart_item_id'] == args['cart_item_id']), None)
        if len(self.artifacts.cart_edit_plan) > 1 and request and request['fields'] and set(patch) - set(request['fields']):
            return denied('cart_fields_not_requested', requested_fields=request['fields'],
                message='Dạ, mình chưa sửa món vì tùy chọn đề xuất chưa khớp yêu cầu của bạn. Bạn nhắc lại tùy chọn muốn đổi giúp mình nhé.')
        if 'quantity' in patch:
            from src.agents.cart_edit_evidence import edit_quantity
            expected_quantity = edit_quantity(getattr(self, 'active_edit_clause', self.user_message))
            if expected_quantity is not None and int(patch['quantity']) != expected_quantity:
                return denied('cart_quantity_conflict', expected_quantity=expected_quantity,
                    proposed_quantity=int(patch['quantity']),
                    recovery='Use the explicit absolute quantity from the current customer message.')
        values = {k: v for k, v in patch.items() if k != 'quantity'}
        if values:
            configured, error = self._configured_product(str(line['product_id']), values, require_all=False)
            if error:
                if error.get('option_choices'):
                    cart_manager.set_checkout_context(self.session_id, pending_cart_option_edit={
                        'cart_item_id': str(line['cart_item_id']), 'product_id': str(line['product_id']),
                        'product_name': line['product_name'], 'choices': error['option_choices'],
                        'valid_values': error['valid_values'],
                        'line_state': {key: deepcopy(line.get(key)) for key in
                                       ('quantity', 'size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua')},
                    })
                    error['message'] = '**' + line['product_name'] + '**: ' + error['message']
                return error
            patch = {**patch, **{key: configured[key] for key in ('size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua') if key in configured}}
        if all(line.get(key) == value for key, value in patch.items()):
            if self.cart_option_followup:
                cart_manager.set_checkout_context(self.session_id, pending_cart_option_edit=None)
            return {'status': 'already_processed', 'cart': cart_manager.get_cart(self.session_id), 'changed': False,
                'applied_state': patch}
        args = {**args, 'desired_state': patch}
        result = self._write('update_cart_item', args, lambda: cart_tools.execute_update_cart_item(
            self.session_id, args['cart_item_id'], patch, operation_id=self._operation_id('update_cart_item', args)))
        if result.get('status') == 'ok':
            pending = cart_manager.get_checkout_prefs(self.session_id).get('pending_cart_option_edit') or {}
            if pending.get('cart_item_id') == str(line['cart_item_id']):
                cart_manager.set_checkout_context(self.session_id, pending_cart_option_edit=None)
            self._invalidate_summary()
            self.updated_products.add(str(line['product_id']))
            result = {**result, 'applied_state': patch}
        return result

    def _remove_cart_item(self, args):
        line = self._cart_line(args['cart_item_id'])
        if not line:
            return denied('unknown_cart_line')
        target_error = self._cart_target_error(line, 'remove_cart_item')
        if target_error:
            return target_error
        entry_line = next((row for row in self.entry_cart_lines if str(row['cart_item_id']) == args['cart_item_id']), line)
        if args.get('cart_line_ordinal') and entry_line.get('display_index') != args['cart_line_ordinal']:
            expected = next((row for row in self.entry_cart_lines
                             if int(row.get('display_index') or 0) == args['cart_line_ordinal']), None)
            return denied('cart_reference_conflict', proposed_ordinal=line.get('display_index'),
                expected_cart_item_id=str(expected.get('cart_item_id') or expected.get('line_id')) if expected else None,
                expected_product_name=expected.get('product_name') if expected else None)
        result = self._write('remove_cart_item', args, lambda: cart_tools.execute_remove_cart_item(
            self.session_id, args['cart_item_id'], operation_id=self._operation_id('remove_cart_item', args)))
        if result.get('status') == 'ok':
            pending = cart_manager.get_checkout_prefs(self.session_id).get('pending_cart_option_edit') or {}
            if pending.get('cart_item_id') == str(line['cart_item_id']):
                cart_manager.set_checkout_context(self.session_id, pending_cart_option_edit=None)
            self._invalidate_summary()
        return result

    def _invalidate_summary(self):
        cart_manager.set_checkout_context(self.session_id, summary_fingerprint=None,
            checkout_action_id=None, checkout_action_expires_at=None, summary_amounts=None)
        if (cart_manager.get_pending_action(self.session_id) or {}).get('type') == 'confirm_checkout':
            cart_manager.clear_pending_action(self.session_id)
        self.artifacts.checkout = None

    def _login_required(self):
        return denied('login_required',
            message='Dạ, mình đã giữ giỏ hàng của bạn ạ. Bạn **đăng nhập để dùng voucher hoặc tiếp tục đặt hàng** nhé. Bạn vẫn có thể thêm, sửa hoặc xóa món trước khi đăng nhập.',
            login_action={'label': 'Đăng nhập để tiếp tục', 'href': '/?tab=login', 'return_tab': 'cart'})

    def _finish_cart(self, args):
        if not self.context['business']['authenticated'] and self.context['business'].get('guest_session_id'):
            return self._login_required()
        state = self.context['business']
        if not state['cart']['items']:
            return denied('empty_cart')
        if state['pending_products']:
            return denied('needs_options')
        if not state['authenticated']:
            return self._login_required()
        # Reuse the established voucher boundary, not its language router.
        from src.agents.order_flow_graph import _offer_voucher_gate
        result = _offer_voucher_gate(self.session_id)
        value = next((r['result'] for r in result.get('tool_calls_log', []) if r['tool'] == 'get_applicable_vouchers'), {})
        quoted = next((r['result'] for r in result.get('tool_calls_log', []) if r['tool'] == 'get_cart_quote'), {})
        if quoted.get('status') not in {None, 'ok'} or value.get('status') == 'error':
            return {'status': 'error', 'message': result['reply']}
        return {**value, 'status': 'ok', 'vouchers': value.get('vouchers') or [],
                'cart': quoted.get('cart') or {}, 'quote': quoted.get('quote') or {},
                'message': result['reply']}

    def _skip_voucher(self, args):
        from src.agents.customer_choice_authority import skips_voucher
        pending_type = (self.context['business'].get('pending') or {}).get('type')
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        # The five-minute pending action may expire while the customer is
        # still answering the durable voucher offer. The offer owns a short
        # refusal only while that decision remains outstanding.
        if (not pending_type and prefs.get('voucher_offer_pending')
                and (not prefs.get('voucher_decided') or prefs.get('voucher_revalidation_required'))
                and not prefs.get('checkout_submission') and not prefs.get('completed_order_id')
                and not self.context['business'].get('pending_products')):
            pending_type = 'select_voucher'
        if not skips_voucher(self.user_message, pending_type):
            return denied('voucher_choice_required', message='Dạ, bạn chọn mã giảm giá hoặc nói **bỏ qua mã** nhé. Hoàn tất giỏ chưa đồng nghĩa với bỏ qua ưu đãi ạ.')
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
        from src.agents.customer_choice_authority import voucher_choice
        code = args['voucher_code'].strip().upper()
        requested = voucher_choice(self.user_message, self.entry_vouchers)
        # A current literal code is explicit even before a fresh eligibility read.
        if not requested:
            requested = voucher_choice(self.user_message, [{'ma_voucher': code}])
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        revalidation = bool(prefs.get('voucher_revalidation_required') and str(prefs.get('voucher_code') or '').upper() == code)
        noop = bool(prefs.get('voucher_decided') and str(prefs.get('voucher_code') or '').upper() == code)
        if not requested and not revalidation and not noop:
            return denied('voucher_choice_required', message='Dạ, mình chưa áp mã nào. Bạn chọn mã theo số hoặc mã, chọn **mã tốt nhất**, hoặc **bỏ qua mã** nhé.')
        if requested not in {None, 'BEST', code}:
            return denied('voucher_selection_conflict', expected_voucher_code=requested,
                recovery='Apply the exact code the customer selected from the prior displayed voucher list.')
        listed = voucher_tools.execute_get_applicable_vouchers(self.session_id)
        candidates = listed.get('vouchers') or []
        if listed.get('status') != 'ok' or not self.context['business']['cart']['items'] or not any(str(r.get('ma_voucher') or r.get('voucher_code')).upper() == code for r in candidates):
            return denied('voucher_not_eligible')
        # Validate "best" against current provider savings, independent of the model.
        if requested == 'BEST':
            best = max(candidates, key=lambda row: float(row.get('so_tien_giam_du_kien') or 0))
            chosen = next(row for row in candidates if str(row.get('ma_voucher') or row.get('voucher_code')).upper() == code)
            if float(chosen.get('so_tien_giam_du_kien') or 0) < float(best.get('so_tien_giam_du_kien') or 0):
                return denied('voucher_selection_conflict',
                    expected_voucher_code=str(best.get('ma_voucher') or best.get('voucher_code')).upper(),
                    recovery='Apply the currently eligible voucher with the greatest estimated saving.')
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        facts = {'cart': self.context['business']['cart'], 'choices': {
            key: prefs.get(key) for key in ('delivery_type', 'payment_method', 'delivery_address', 'address_confirmed')}}
        binding = hashlib.sha256(json.dumps(facts, sort_keys=True,
            ensure_ascii=False).encode()).hexdigest()
        fresh = (prefs.get('voucher_binding_fingerprint') == binding or (
            prefs.get('summary_fingerprint') == cart_manager.cart_fingerprint(self.session_id)))
        candidate = next(r for r in candidates if str(r.get('ma_voucher') or r.get('voucher_code')).upper() == code)
        discount_matches = (candidate.get('so_tien_giam_du_kien') is None or
                            candidate['so_tien_giam_du_kien'] == prefs.get('discount_amount'))
        if (str(prefs.get('voucher_code') or '').strip().upper() == code and prefs.get('voucher_decided')
                and not prefs.get('voucher_revalidation_required') and fresh and discount_matches):
            return {'status': 'already_processed', 'changed': False, 'voucher_code': code,
                'message': 'Mã giảm giá này đang được áp dụng cho giỏ hàng.'}
        result = self._write('apply_voucher', args, lambda: voucher_tools.execute_apply_voucher(self.session_id, code))
        if result.get('status') == 'ok':
            self._invalidate_summary()
            cart_manager.set_checkout_context(self.session_id, voucher_binding_fingerprint=binding,
                voucher_offer_pending=None, voucher_candidates=None, flow_stage='CART_READY')
            cart_manager.clear_pending_action(self.session_id)
        return result

    def _remove_voucher(self, args):
        result = self._write('remove_voucher', args, lambda: voucher_tools.execute_remove_voucher(self.session_id))
        if result.get('status') == 'ok':
            self._invalidate_summary()
        return result

    def _set_session_branch(self, args):
        bid = args['branch_id']
        if bid not in self.entry_branches:
            return denied('customer_branch_selection_required',
                branches=list(self.artifacts.ui.get('branches') or self.artifacts.visible.get('branches') or []),
                message='Dạ, bạn chọn giúp mình một chi nhánh trong danh sách vừa gửi nhé.')
        row = next((r for r in self.artifacts.visible.get('branches', []) if str(r.get('branch_id') or r.get('ma_chi_nhanh')) == bid), None)
        if not row:
            return denied('branch_unavailable_or_unknown',
                message='Dạ, mình chưa xác định được chi nhánh bạn chọn. Bạn chọn lại từ danh sách nhé.')
        from src.common.inventory_validation import validate_cart_at_branch
        from src.function_calling.helpers import _get_engine
        cart = {**cart_manager.get_cart(self.session_id), 'branch_id': bid}
        engine = _get_engine()
        checked = validate_cart_at_branch(engine, cart)

        def unavailable_result(availability):
            updated = {**row, **branch_tools._availability_fields(availability)}
            branches = [updated if str(b.get('branch_id') or b.get('ma_chi_nhanh')) == bid else b
                        for b in (self.artifacts.ui.get('branches') or self.artifacts.visible.get('branches') or [])]
            return denied('branch_unavailable_or_unknown', branches=branches,
                unavailable_products=availability['unavailable'], unverified_products=availability['unverified'],
                message='Dạ, chi nhánh này chưa thể nhận đủ các món trong giỏ. Đơn của bạn chưa được tạo; bạn chọn quán khác hoặc sửa món nhé.')
        if checked['unavailable'] or checked['unverified']:
            return unavailable_result(checked)
        if str(cart_manager.get_cart(self.session_id).get('branch_id')) == bid:
            if not branch_tools.branch_identity_available(engine, bid):
                return denied('branch_unavailable_or_unknown')
            return {'status': 'already_processed', 'changed': False,
                'message': 'Chi nhánh này đã được chọn cho đơn hàng.'}
        result = self._write('set_session_branch', args, lambda: branch_tools.execute_set_session_branch(
            self.session_id, bid, row.get('branch_name') or row.get('ten_chi_nhanh') or '', customer_selected=True))
        if result.get('status') == 'stock_conflict':
            return unavailable_result({
                'available': result.get('available_products') or [],
                'unavailable': result.get('unavailable_products') or [],
                'unverified': result.get('unverified_products') or [],
                'product_statuses': result.get('product_availability') or [],
                'is_fully_available': False})
        if result.get('status') == 'ok':
            self._invalidate_summary()
            cart_manager.set_checkout_context(self.session_id, location_pending=None, address_change_requested=None)
        return result

    def _set_checkout_choices(self, args):
        if not args:
            return denied('missing_choice')
        # Reuse the established deterministic parser only as independent safety
        # evidence for explicit choices. The model still owns intent/planning.
        from src.agents.agent_service import _explicit_checkout_choices, _checkout_choice_conflict
        if _checkout_choice_conflict(self.user_message):
            return denied('missing_choice', message='Dạ, bạn đang nhắc đến nhiều cách nhận hoặc thanh toán. Bạn chọn **một cách nhận và một phương thức thanh toán** giúp mình nhé.')
        explicit = _explicit_checkout_choices(self.user_message)
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        if not explicit and all(prefs.get(key) == value for key, value in args.items()):
            return {'status': 'already_processed', 'changed': False, 'choices': args,
                'message': 'Các lựa chọn này đã được ghi nhận.'}
        if any(key not in explicit for key in args):
            return denied('checkout_choice_not_selected',
                message='Dạ, bạn chọn giúp mình cách nhận hàng và phương thức thanh toán mong muốn nhé.')
        # Explicit customer evidence owns the values, including pickup=MANG_DI.
        # Preserve both choices in one sentence even if the model emits only one.
        args = explicit
        if args.get('payment_method') == 'VI_DIEN_TU':
            wallet_error = cart_tools.validate_wallet_selection(self.session_id)
            if wallet_error:
                if wallet_error.get('wallet_topup') and args.get('delivery_type'):
                    labels = {'TAI_CHO': 'dùng tại chỗ', 'MANG_DI': 'lấy tại quán', 'GIAO_TAN_NOI': 'giao tận nơi'}
                    wallet_error['wallet_topup']['resume_message'] = 'Tôi chọn ' + labels[args['delivery_type']] + ' và thanh toán bằng Ví Avengers'
                return denied('wallet_unavailable', message=wallet_error.get('reply'),
                    **{key: wallet_error[key] for key in ('payment_options', 'wallet_topup') if key in wallet_error})
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        changed = any(prefs.get(key) != value for key, value in args.items())
        if not changed:
            return {'status': 'already_processed', 'changed': False, 'choices': args,
                'message': 'Các lựa chọn này đã được ghi nhận.'}
        if any(key not in explicit for key in args):
            return denied('checkout_choice_not_selected',
                message='Dạ, bạn chọn giúp mình cách nhận hàng và phương thức thanh toán mong muốn nhé.')
        cart_manager.set_checkout_prefs(self.session_id, **args)
        if args.get('delivery_type'):
            cart_manager.set_checkout_context(self.session_id, checkout_requested=True)
        if args.get('delivery_type') and args['delivery_type'] != prefs.get('delivery_type'):
            cart_manager.clear_branch(self.session_id)
            cart_manager.set_checkout_context(self.session_id, address_confirmed=None, branch_candidates=None)
            self.artifacts.visible['branches'] = []
        if changed:
            self._invalidate_summary()
        result = {'status': 'ok', 'changed': True, 'choices': args}
        if args.get('delivery_type') and args['delivery_type'] != prefs.get('delivery_type'):
            result['profile_location'] = self._offer_profile_location(args['delivery_type'])
        return result

    def _offer_profile_location(self, delivery_type):
        """Offer the actual saved address for every fulfillment, before geo/branch discovery."""
        from src.agents.location_parser import parse_location, canonical_address
        literal = parse_location(self.user_message)
        cart_manager.set_checkout_context(self.session_id, profile_location_offer=None,
            profile_location_checked_for=delivery_type)
        if literal.kind in {'address', 'area', 'poi'} and literal.value:
            return {'status': 'explicit_location'}  # Respect a location already supplied this turn.
        try:
            profile = TOOL_EXECUTORS['get_user_profile']({}, self.session_id)
        except Exception:
            profile = {'status': 'error'}
        if profile.get('status') != 'ok':
            return {'status': 'unavailable'}
        address = canonical_address(profile.get('default_address'))
        addresses = []
        for row in profile.get('address_items') or []:
            full_address = canonical_address(row.get('full_address'))
            if full_address and not any(item['full_address'] == full_address for item in addresses):
                addresses.append({'full_address': full_address, 'label': row.get('label') or '',
                    'is_default': bool(row.get('is_default') or full_address == address)})
        if address and not any(row['full_address'] == address for row in addresses):
            addresses.insert(0, {'full_address': address, 'label': '', 'is_default': True})
        addresses.sort(key=lambda row: not row['is_default'])
        if not address and addresses:
            address = addresses[0]['full_address']
        if not address:
            return {'status': 'empty'}
        offer = {'address': address, 'addresses': addresses, 'delivery_type': delivery_type,
                 'purpose': 'delivery' if delivery_type == 'GIAO_TAN_NOI' else 'nearby_branches'}
        cart_manager.set_checkout_context(self.session_id, profile_location_offer=offer,
            suggested_address=address, location_source='profile_saved')
        cart_manager.set_pending_action(self.session_id, 'confirm_address', {})
        return {'status': 'offered', **offer}

    def _resolve_location(self, args):
        from src.agents.order_flow_graph import _handle_location_request, _persist_branch_candidates_from_result
        from src.agents.location_parser import Location
        args = dict(args)
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        offer = prefs.get('profile_location_offer')
        offered_addresses = (offer or {}).get('addresses') or ([{'full_address': offer['address']}] if offer else [])
        from src.agents.location_parser import parse_location, locality_matches
        literal = parse_location(self.user_message)
        if offer and prefs.get('delivery_type') == 'GIAO_TAN_NOI' and literal.kind == 'area':
            matching = [row for row in offered_addresses if locality_matches(row['full_address'], literal.value)]
            if len(matching) == 1:
                # A ward identifies a saved candidate, not its house number.
                # Retain an actual offer so a subsequent "tôi đang ở đó" has an owner.
                narrowed = {**offer, 'address': matching[0]['full_address'], 'addresses': matching}
                cart_manager.set_checkout_context(self.session_id, profile_location_offer=narrowed,
                    suggested_address=narrowed['address'], location_source='profile_saved')
                cart_manager.set_pending_action(self.session_id, 'confirm_address', {})
                return denied('profile_location_confirmation_required',
                    message=f"Dạ, trong hồ sơ bạn có địa chỉ tại khu vực này: **{narrowed['address']}**.\n\nBạn đang ở **đúng địa chỉ này** và muốn giao đến đây phải không ạ?")
        if offer and not any(normalize_text(args['location']) == normalize_text(row['full_address']) for row in offered_addresses):
            from src.agents.location_parser import parse_location
            literal = parse_location(self.user_message)
            if literal.kind not in {'address', 'area', 'poi'} or not literal.value:
                return denied('profile_location_confirmation_required',
                    message='Dạ, bạn chọn địa chỉ đã lưu hoặc cho mình địa chỉ/khu vực hiện tại nhé.')
        if offer and any(normalize_text(args['location']) == normalize_text(row['full_address']) for row in offered_addresses):
            from src.agents.customer_choice_authority import profile_location_decision
            from src.agents.order_flow_graph import _profile_address_choice
            decision = profile_location_decision(self.user_message)
            selection = _profile_address_choice(self.user_message, offered_addresses)
            if '?' in self.user_message or re.search(r'\b(?:la gi|dia chi nao|co phai)\b', normalize_text(self.user_message)):
                selection = None
            if selection and selection.get('other'):
                decision = 'NO'
            selected_address = None if decision == 'NO' else (
                (selection or {}).get('address') or (offer['address'] if decision == 'YES' else None))
            if (not self.entry_profile_offer or self.entry_profile_offer != offer
                    or not selected_address
                    or normalize_text(selected_address) != normalize_text(args['location'])):
                if decision == 'NO':
                    cart_manager.set_checkout_context(self.session_id, profile_location_offer=None, suggested_address=None)
                    cart_manager.clear_pending_action(self.session_id)
                    return denied('needs_new_location', message='Dạ, bạn cho mình địa chỉ hoặc khu vực khác để tiếp tục nhé.')
                return denied('profile_location_confirmation_required',
                    message=f"Dạ, bạn đang ở **{offer['address']}** hay muốn dùng địa chỉ khác ạ?")
            actual = parse_location(selected_address)
            if actual.kind in {'area', 'address', 'poi'}:
                args['kind'] = actual.kind
        if offer:
            cart_manager.set_checkout_context(self.session_id, profile_location_offer=None, suggested_address=None)
            if (cart_manager.get_pending_action(self.session_id) or {}).get('type') == 'confirm_address':
                cart_manager.clear_pending_action(self.session_id)
        # Pickup locations are origins for discovery, never delivery addresses.
        if cart_manager.get_checkout_prefs(self.session_id).get('delivery_type') in {'MANG_DI', 'TAI_CHO'}:
            args['for_checkout'] = False
        location_purpose = ('nearby_branches' if prefs.get('delivery_type') in {'MANG_DI', 'TAI_CHO'}
                            else 'delivery' if args.get('for_checkout') else None)
        if args.get('for_checkout'):
            if not self.context['business']['cart']['items'] or not cart_manager.get_checkout_prefs(self.session_id).get('delivery_type'):
                return denied('checkout_location_preconditions_missing')
            cart_manager.set_checkout_context(self.session_id, checkout_requested=True)
        state = {'session_id': self.session_id, 'user_message': args['location'], 'history': [],
            'cart': cart_manager.get_cart(self.session_id), 'force_read_only_location': not args.get('for_checkout'),
            'location_override': Location(args['kind'], args['location'])}
        if location_purpose == 'nearby_branches':
            state['location_purpose'] = location_purpose
        if getattr(self, '_selected_location', None):
            state['resolved_location_candidate'] = self._selected_location
        result = _handle_location_request(state)
        if args.get('for_checkout'):
            _persist_branch_candidates_from_result(self.session_id, result)
        nearest = next((r['result'] for r in result.get('tool_calls_log', []) if r['tool'] == 'find_nearest_branch'), {})
        # The established delivery adapter may prepare a summary after geo and
        # compatible-branch validation. Preserve that actual authority/UI;
        # do not hide it and prompt another redundant summary operation.
        summary = None
        for entry in result.get('tool_calls_log') or []:
            if entry.get('tool') in {'set_session_branch', 'request_checkout'}:
                evidence = entry.get('result') or {}
                actual_args = {'branch_id': str(cart_manager.get_cart(self.session_id).get('branch_id') or '')} if entry['tool'] == 'set_session_branch' else {}
                self.artifacts.collect(entry['tool'], actual_args, evidence)
                if entry['tool'] == 'request_checkout' and evidence.get('status') == 'require_confirmation':
                    summary = evidence.get('order_summary')
        # The generic business adapter owns promotion. A selected provider
        # candidate is reused with immutable coordinates, never re-geocoded.
        if (getattr(self, '_selected_location', None) and args.get('for_checkout')
                and cart_manager.get_checkout_prefs(self.session_id).get('address_confirmed')):
            cart_manager.set_checkout_context(self.session_id, location_candidate_snapshot=None,
                selected_location_candidate=None, location_pending=None)
            if (cart_manager.get_pending_action(self.session_id) or {}).get('type') == 'select_location_candidate':
                cart_manager.clear_pending_action(self.session_id)
            self.artifacts.visible['location_candidates'] = []
        return {**nearest, 'status': 'require_confirmation' if summary else nearest.get('status') or 'needs_location',
            'location_purpose': location_purpose,
            'message': result['reply'], **({'order_summary': summary} if summary else {})}

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
        missing = missing_checkout_fields(self.context['business'])
        if missing:
            return denied('checkout_preconditions_missing', missing=missing, message=checkout_guidance(missing))
        fresh = (prefs.get('checkout_action_id') and prefs.get('summary_fingerprint') == cart_manager.cart_fingerprint(self.session_id)
                 and float(prefs.get('checkout_action_expires_at') or 0) > time.time())
        result = cart_tools.execute_request_checkout(self.session_id, reuse_summary=bool(fresh) or args.get('reuse_summary', False))
        if self.confirmation_recovery is not None:
            self.summary_refreshed = True
        return result

    def _confirm_checkout(self, args):
        from src.agents.tier1 import classify_confirmation
        prefs = cart_manager.get_checkout_prefs(self.session_id)
        current = cart_manager.cart_fingerprint(self.session_id)
        pending = cart_manager.get_pending_action(self.session_id) or {}
        reason = None
        if not self.entry_action:
            reason = 'no_prior_action'
        elif self.entry_action != prefs.get('checkout_action_id'):
            reason = 'action_mismatch'
        elif current != self.entry_fingerprint:
            reason = 'state_changed_during_turn'
        elif classify_confirmation(self.user_message, 'confirm_checkout') != 'YES':
            reason = 'not_explicit_confirmation'
        elif prefs.get('summary_fingerprint') != current:
            reason = 'summary_cart_changed'
        elif float(prefs.get('checkout_action_expires_at') or 0) <= time.time():
            reason = 'summary_expired'
        elif pending.get('type') != 'confirm_checkout' or float(pending.get('expires_at') or 0) <= time.time():
            reason = 'pending_confirmation_missing'
        elif missing_checkout_fields(self.context['business']):
            reason = 'checkout_preconditions_missing'
        self.confirmation_recovery = 'stop'
        if reason:
            missing = missing_checkout_fields(self.context['business'])
            if not missing and reason != 'not_explicit_confirmation':
                self.confirmation_recovery = 'request_checkout'
            message = (checkout_guidance(missing) if missing else
                'Bạn xác nhận đặt đơn theo bản tóm tắt này nhé.' if reason == 'not_explicit_confirmation' else
                'Bản tóm tắt cần được làm mới. Bạn xem lại rồi xác nhận ở lượt tiếp theo nhé.')
            return denied('confirmation_required', reason=reason, recovery_tool=(
                'request_checkout' if self.confirmation_recovery == 'request_checkout' else None),
                missing=missing, message=message)
        return self._write('confirm_checkout', {}, lambda: cart_tools.execute_confirm_checkout(
            self.session_id, action_id=self.entry_action))

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
        return {'status': 'ok', **cart_tools.get_wallet_payment_options(self.session_id, amount),
                'quote_status': quoted.get('status'),
                **{key: quoted[key] for key in ('cart', 'quote') if key in quoted}}

    def model_result(self, result, tool_name=None):
        from src.agents.tool_artifacts import model_tool_result
        return model_tool_result(tool_name, result, self.artifacts)
