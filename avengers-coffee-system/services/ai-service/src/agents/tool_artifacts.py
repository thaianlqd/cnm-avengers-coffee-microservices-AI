"""Canonical UI artifacts are derived from tool results, never model prose."""
import hashlib
import json
import re
from copy import deepcopy
from src.agents.agent_memory import compact, snapshot, safe_text
from src.agents.discovery_contract import (DISCOVERY_TOOLS, DISCOVERY_RESPONSE_CONTRACT,
    normalize_discovery_args, discovery_signature, complementary_pair_complete)
from src.rag.documents import normalize_text
from src.agents.product_display import numbered_products, PRODUCT_GROUP_LABELS, PRODUCT_REFERENCE_LABELS

SUCCESS = {'success', 'ok', 'require_confirmation', 'already_processed', 'need_branch_selection', 'ambiguous'}
RAG_TOOLS = {'search_knowledge_base', 'get_product_description'}


def public_result(value, depth=0):
    """Remove server replay/auth internals without truncating canonical UI rows."""
    if depth > 10:
        return None
    if isinstance(value, dict):
        return {k: public_result(v, depth+1) for k, v in value.items()
                if k not in {'processed_order_turns', 'checkout_submission', 'completed_result'}
                and not any(part in str(k).lower() for part in ('authorization', 'password', 'secret', 'api_key', 'token'))}
    if isinstance(value, list):
        return [public_result(v, depth+1) for v in value]
    return safe_text(value, 3000) if isinstance(value, str) else value


def candidate_id(row):
    identity = {k: row.get(k) for k in ('normalized_label', 'display_address', 'lat', 'lng')}
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:24]


def model_tool_result(name, result, artifacts=None):
    """Per-tool inference projection. Full evidence/UI results stay server-side."""
    from src.agents.agent_context import model_cart, model_snapshot
    if not isinstance(result, dict):
        return compact(result)
    if name in RAG_TOOLS:
        docs, seen = [], set()
        for doc in result.get('results') or []:
            identity = (doc.get('id'), doc.get('content'))
            if identity in seen:
                continue
            seen.add(identity)
            # Complete approved content is necessary for LAN21 exact quotations.
            docs.append({key: doc[key] for key in ('id', 'title', 'content', 'domain',
                'entity_type', 'entity_id', 'source', 'authority') if key in doc})
        return {**{key: result[key] for key in ('status', 'message', 'grounding') if key in result},
                'results': docs}
    if name == 'get_user_profile':
        return {**{key: result[key] for key in ('status', 'default_address') if key in result},
            'address_items': [{key: row[key] for key in ('label', 'full_address', 'is_default') if key in row}
                for row in result.get('address_items') or [] if isinstance(row, dict)]}
    if result.get('status') not in SUCCESS | {'no_applicable_voucher', 'empty_cart'}:
        return compact(result)  # Preserve every denial/recovery field.
    value = {key: compact(result[key]) for key in ('status', 'message', 'changed',
        'same_turn_read_reused', 'product_id', 'product_name', 'quantity', 'unit_price',
        'voucher_code', 'voucher_decided', 'discount_amount', 'so_tien_giam', 'final_total',
        'ranking', 'period', 'period_anchor', 'period_start', 'period_end', 'new_product_basis',
        'quote_status', 'payment_options_status', 'total_cart', 'choices', 'profile_location', 'remaining_cart_edits',
        'order_id', 'order_status', 'payment_method', 'total_price', 'normalized_location') if key in result}
    if isinstance(result.get('cart'), dict):
        value['cart'] = model_cart(result['cart'])
        for row in value['cart']['items']:
            row['display_index'] = (getattr(artifacts, 'turn_cart_ordinals', {}) or {}).get(str(row.get('cart_item_id')), row['display_index'])
    if isinstance(result.get('quote'), dict):
        value['quote'] = {key: result['quote'][key] for key in ('subtotal', 'discount_amount',
            'delivery_fee', 'final_total', 'voucher_code', 'voucher_valid') if key in result['quote']}
    for kind in ('products', 'vouchers', 'branches', 'location_candidates', 'payment_options', 'fulfillment_options'):
        if not isinstance(result.get(kind), list):
            continue
        rows = result[kind]
        if kind == 'products':
            rows = [{**row, 'product_id': str(row.get('product_id') or row.get('ma_san_pham') or ''),
                     'product_name': row.get('product_name') or row.get('ten_san_pham')}
                    for row in rows if isinstance(row, dict)]
        indices = {}
        if artifacts and kind in {'products', 'branches', 'vouchers'}:
            def identity(row):
                return str(next((row[key] for key in ('product_id', 'branch_id', 'ma_chi_nhanh',
                    'voucher_code', 'ma_voucher') if row.get(key)), ''))
            indices = {identity(row): row.get('display_index')
                       for row in artifacts.visible.get(kind) or []}
            if kind != 'products':
                shown = [row for row in rows if identity(row) in indices]
                if len(shown) != len(rows):
                    value[kind+'_omitted_count'] = len(rows)-len(shown)
                rows = shown
        if artifacts and kind == 'location_candidates':
            rows = artifacts.visible.get(kind) or []  # Canonical IDs assigned by collect().
        projected = ([{key: row[key] for key in ('code', 'label') if key in row} for row in rows]
                     if kind == 'fulfillment_options' else model_snapshot(kind, rows))
        for index, (row, original) in enumerate(zip(projected, rows), 1):
            if kind == 'products' and name in DISCOVERY_TOOLS:
                for key in ('display_index', 'group_display_index', 'global_display_index'):
                    row.pop(key, None)
                row['result_rank'] = index  # Batch rank, never a customer-visible ordinal.
            elif artifacts and kind in {'products', 'branches', 'vouchers'}:
                row['display_index'] = indices.get(identity(original))
                if row['display_index'] is None:
                    row['not_displayed'] = True  # Fresh facts remain available; no invented ordinal.
            else:
                row['display_index'] = original.get('display_index', index)
            if kind == 'products':
                for key in ('product_id', 'product_name', 'final_price', 'price', 'category',
                    'rating', 'avg_rating', 'total_reviews', 'sold_count', 'order_count', 'la_moi', 'stock', 'stock_quantity', 'in_stock', 'is_active',
                    'base_price', 'size_surcharge', 'parent_category', 'branch_id',
                    'availability_status', 'size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua'):
                    if key in original:
                        row[key] = compact(original[key])
            elif kind == 'vouchers':
                for key in ('so_tien_giam_du_kien', 'eligible', 'reason'):
                    if key in original:
                        row[key] = compact(original[key])
            elif kind == 'branches':
                for key in ('distance_basis', 'distance_estimated', 'avg_rating', 'total_reviews',
                            'unavailable_products', 'unverified_products'):
                    if key in original:
                        row[key] = compact(original[key])
        value[kind] = projected
    if name == 'get_product_options':
        for key in ('option_groups', 'available_sizes', 'options', 'defaults', 'missing_fields'):
            if key in result:
                value[key] = compact(result[key])
        if value.get('option_groups'):
            value.pop('options', None)  # Same labels/values already present in groups.
    if name in {'request_checkout', 'resolve_location', 'select_location_candidate'} and isinstance(result.get('order_summary'), dict):
        summary = result['order_summary']
        value['order_summary'] = {key: compact(summary[key]) for key in ('branch_id', 'branch_name',
            'subtotal', 'total_price', 'discount_amount', 'delivery_fee', 'final_total',
            'voucher_code', 'delivery_type', 'payment_method', 'delivery_address') if key in summary}
        value['order_summary']['items'] = model_cart({'items': summary.get('items') or []})['items']
    if name in {'get_cart', 'get_cart_quote', 'filter_catalog', 'get_recommendations',
                'check_price_and_stock', 'get_applicable_vouchers', 'finish_cart',
                'apply_voucher', 'remove_voucher', 'skip_voucher', 'add_to_cart', 'update_cart_item',
                'remove_cart_item', 'request_checkout', 'set_checkout_choices', 'set_session_branch',
                'resolve_location', 'select_location_candidate', 'get_payment_options', 'get_product_options',
                'ask_branch', 'find_nearest_branch', 'get_top_rated_stores'}:
        return value
    # Profile, review and completed-order responses have separate fact contracts;
    # preserve them conservatively, only removing UI/provider noise recursively.
    def lean(data):
        if isinstance(data, dict):
            return {key: lean(item) for key, item in data.items() if key not in {
                'hinh_anh_url', 'image_url', 'provider_metadata', 'product_data', 'operation_id'}}
        if isinstance(data, list):
            return [lean(item) for item in data]
        return data
    return compact(lean(result))


class ToolArtifacts:
    def __init__(self, memory, knowledge_question=None, context=None):
        # Existing knowledge authority is an output safety boundary for
        # ingredient/allergen claims, even if the model proposes a wrong read.
        from src.rag.authority import knowledge_route
        route = knowledge_route(knowledge_question or '')
        self.safety_facet = route.get('facet') if route.get('owner') == 'rag' else None
        self.knowledge_question = knowledge_question or ''
        from src.agents.shopping_language import requested_discovery_family
        self.discovery_scope = requested_discovery_family(self.knowledge_question)
        self.visible = dict(memory.get('visible_snapshots') or {})
        self.focus = dict(memory.get('focus') or {})
        pending_products = ((context or {}).get('business') or {}).get('pending_products') or []
        self.has_canonical_product = bool(self.focus.get('product') or len(pending_products) == 1)
        pending = ((context or {}).get('business') or {}).get('pending') or {}
        self.has_pending_confirmation = pending.get('type') == 'confirm_checkout'
        self.logs = []
        self.ui = {'products': [], 'vouchers': [], 'branches': [], 'actions': []}
        self.product_candidates = {}  # Complete turn authority; UI budget is separate.
        self.checkout = None
        self.business = ((context or {}).get('business') or {})
        self.response_validation_issue = None
        self.display_unresolved = False
        self.discovery_batches = []  # Turn-local IDs/args only; never persisted as memory.
        self.discovery_read_count = 0
        self.discovery_read_reused_count = 0
        self.planned_discovery_reads = 0
        self.display_selection_source = None
        self.validated_display_product_count = 0

    def discovery_complete(self):
        if not self.logs or any(row['tool'] not in DISCOVERY_TOOLS
                                or row['result'].get('status') != 'ok' for row in self.logs):
            return False
        if self.discovery_read_reused_count:
            return True
        if self.planned_discovery_reads:
            return len(self.discovery_batches) >= self.planned_discovery_reads
        return complementary_pair_complete(self.discovery_batches)

    def _publish_products(self, ids, source):
        canonical = {**self.product_candidates,
            **{str(row['product_id']): row for row in self.ui['products']}}
        self.ui['products'] = numbered_products([canonical[key] for key in ids])
        self.visible['products'] = snapshot('products', self.ui['products'])
        self.display_selection_source = source
        self.validated_display_product_count = len(ids)
        focus = self.focus.get('product') or {}
        pending_ids = {str(row.get('product_id')) for row in self.business.get('pending_products') or []}
        focus_id = str(focus.get('product_id'))
        if (focus_id not in ids and focus_id not in pending_ids
                and (focus.get('source') in DISCOVERY_TOOLS
                     or (not focus.get('source') and focus_id in self.product_candidates))):
            self.focus.pop('product', None)

    def finalize_display(self):
        """Presentation barrier: candidate authority alone never publishes a multi-read pool."""
        if any(row['tool'] == 'confirm_checkout' and row['result'].get('status') in {'ok', 'success', 'already_processed'}
               for row in self.logs):
            self.ui['products'] = []
            self.visible.pop('products', None)
            self.validated_display_product_count = 0
            self.display_selection_source = None
            return  # A completed order must not resurrect earlier discovery cards.
        scope = self.discovery_scope or {}
        reads = [row for row in self.logs if row['tool'] in DISCOVERY_TOOLS]
        if scope and reads and all(row['result'].get('status') == 'not_found' for row in reads):
            self._publish_products([], 'no_matches')
            return
        if scope.get('requested_count') and self.discovery_batches and all(
                row['result'].get('status') == 'ok' for row in reads):
            ids = list(dict.fromkeys(key for batch in self.discovery_batches for key in batch['product_ids']))
            ids = ids[:scope['requested_count']]
            if not self.planned_discovery_reads or len(self.discovery_batches) >= self.planned_discovery_reads:
                if ids != [str(row['product_id']) for row in self.ui['products']]:
                    self._publish_products(ids, 'server_scoped_results')
                return
        if self.display_selection_source or not self.discovery_batches:
            return
        batches = self.discovery_batches
        all_success = all(row['result'].get('status') == 'ok'
                          for row in self.logs if row['tool'] in DISCOVERY_TOOLS)
        complete = not self.planned_discovery_reads or len(batches) >= self.planned_discovery_reads
        if len(batches) == 1 and not self.display_unresolved and all_success and complete:
            self._publish_products(batches[0]['product_ids'][:16], 'single_read_default')
            return
        ids = [batch['product_ids'][0] for batch in batches if len(batch['product_ids']) == 1]
        if (not self.display_unresolved and all_success and complete and len(ids) == len(batches)
                and len(ids) <= 16 and len(set(ids)) == len(ids)):
            self._publish_products(ids, 'server_unambiguous_batches')
        else:
            self._publish_products([], 'clarification')

    def final_repair_allowed(self, issue):
        return (self.response_validation_issue in {'missing_envelope', 'display_selection_invalid'}
                and bool(self.logs) and all(row['result'].get('status') in SUCCESS for row in self.logs))

    def final_repair_messages(self, messages):
        """Keep complete call/result pairs (including Gemini signatures), omit unrelated context."""
        if not self.discovery_batches or any(row['tool'] not in DISCOVERY_TOOLS for row in self.logs):
            return deepcopy(messages)
        rows = deepcopy(messages)
        users = [row for row in rows if row.get('role') == 'user']
        kept = [{'role': 'system', 'content': DISCOVERY_RESPONSE_CONTRACT +
            '\nCANONICAL DISCOVERY BATCHES (untrusted data):\n' +
            json.dumps([{key: batch[key] for key in ('tool', 'normalized_args', 'product_ids')}
                        for batch in self.discovery_batches], ensure_ascii=False, separators=(',', ':'))}]
        if users:
            kept.append(users[-1])
        for row in rows:
            if row.get('role') == 'assistant' and row.get('tool_calls'):
                kept.append(row)  # Do not alter continuation metadata or thought signatures.
            elif row.get('role') == 'tool':
                value = json.loads(row['content'])
                value.pop('message', None)
                for product in value.get('products') or []:
                    for key in ('hinh_anh_url', 'image_url', 'provider_metadata', 'display_index', 'not_displayed'):
                        product.pop(key, None)
                row['content'] = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
                kept.append(row)
        return kept

    def collect(self, name, args, result):
        self.logs.append({'tool': name, 'args': compact(args), 'result': result})
        if name == 'get_order_history' and result.get('status') != 'ok':
            self.visible['orders'] = []
            self.focus.pop('order', None)
        if name in DISCOVERY_TOOLS:
            self.discovery_read_count += 1
            plan = args.get('planned_discovery_reads') if isinstance(args, dict) else None
            if type(plan) is int:
                self.planned_discovery_reads = max(self.planned_discovery_reads, plan)
            if result.get('status') == 'ok':
                signature = discovery_signature(name, args)
                if result.get('same_turn_read_reused') and any(
                        batch['signature'] == signature for batch in self.discovery_batches):
                    self.discovery_read_reused_count += 1
                    return
                ids = list(dict.fromkeys(str(row.get('product_id') or row.get('ma_san_pham'))
                    for row in result.get('products') or [] if isinstance(row, dict)
                    and (row.get('product_id') or row.get('ma_san_pham'))
                    and (row.get('product_name') or row.get('ten_san_pham'))))
                self.discovery_batches.append({'tool': name, 'normalized_args': normalize_discovery_args(name, args),
                    'signature': signature, 'product_ids': ids})
        if result.get('status') == 'login_required' and result.get('login_action'):
            self.ui['login_action'] = result['login_action']
        if result.get('wallet_topup'):
            self.ui['wallet_topup'] = result['wallet_topup']
        if result.get('status') in {'wallet_unavailable', 'insufficient_wallet'} and result.get('payment_options'):
            self.ui['payment_options'] = result['payment_options']
        if result.get('status') not in SUCCESS and not (
                result.get('branches') and (result.get('status') == 'stock_conflict' or (
                    name == 'set_session_branch' and result.get('status') in {
                        'branch_unavailable_or_unknown', 'customer_branch_selection_required'}))):
            return
        product = result.get('canonical_product')
        if product and product.get('product_id') and product.get('product_name'):
            self.focus['product'] = {**product, 'source': name}
        if name == 'get_order_details' and result.get('order_id'):
            self.focus['order'] = {'order_id': result['order_id']}
        if name == 'update_cart_item':
            line = next((r for r in (result.get('cart') or {}).get('items', [])
                         if str(r.get('cart_item_id')) == args['cart_item_id']), None)
            if line:
                self.focus['cart_line'] = {'line_id': args['cart_item_id'],
                    'product_id': str(line['product_id']), 'product_name': line['product_name']}
        if name == 'remove_cart_item' and (self.focus.get('cart_line') or {}).get('line_id') == args['cart_item_id']:
            self.focus.pop('cart_line', None)
        if name == 'apply_voucher':
            self.focus['voucher'] = {'voucher_code': result.get('voucher_code') or args['voucher_code']}
        if name in {'remove_voucher', 'skip_voucher'}:
            self.focus.pop('voucher', None)
        if name == 'set_session_branch' and result.get('status') in SUCCESS:
            branch = next((r for r in self.visible.get('branches', [])
                           if str(r.get('branch_id') or r.get('ma_chi_nhanh')) == args['branch_id']), None)
            if branch:
                self.focus['branch'] = {'branch_id': args['branch_id'],
                    'branch_name': branch.get('branch_name') or branch.get('ten_chi_nhanh')}
        if name in {'resolve_location', 'select_location_candidate'} and result.get('normalized_location'):
            self.focus['location'] = {'normalized_label': result['normalized_location']}
        for kind in ('products', 'vouchers', 'branches', 'location_candidates', 'payment_options'):
            rows = result.get(kind)
            if not isinstance(rows, list) or not rows:
                continue
            if kind == 'products':
                rows = [{**row, 'product_id': str(row.get('product_id') or row.get('ma_san_pham') or ''),
                         'product_name': row.get('product_name') or row.get('ten_san_pham')}
                        for row in rows if isinstance(row, dict)]
                rows = [row for row in rows if row['product_id'] and row['product_name']]
                self.product_candidates.update({row['product_id']: row for row in rows})
                if name in DISCOVERY_TOOLS:
                    continue  # Candidates have no customer-visible ordinals until final selection.
            if kind == 'location_candidates':
                rows = [{**row, 'candidate_id': candidate_id(row)} for row in rows]
            if kind in ('products', 'branches', 'vouchers'):
                # Eligibility is a complete current snapshot, not an additive pool.
                previous = [] if kind in {'vouchers', 'branches'} else (self.ui.get(kind) or [])
                def identity(row):
                    return str(next((row[k] for k in ('product_id', 'branch_id', 'ma_chi_nhanh', 'voucher_code', 'ma_voucher') if row.get(k)), row))
                combined = {identity(row): row for row in previous + rows}
                rows = list(combined.values())
                if kind != 'vouchers':
                    rows = rows[:16 if kind == 'products' else 5]
            rows = [{**row, 'display_index': i} for i, row in enumerate(rows, 1)]
            if kind == 'products':
                rows = numbered_products(rows)
            self.ui[kind] = rows
            self.visible[kind] = snapshot(kind, rows)
        if result.get('fulfillment_options'):
            self.ui['fulfillment_options'] = result['fulfillment_options']
        if name in {'apply_voucher', 'skip_voucher', 'remove_voucher'}:
            self.ui['vouchers'] = []
            self.visible['vouchers'] = []
        if len(result.get('products') or []) == 1:
            row = result['products'][0]
            if row.get('product_id') and (row.get('product_name') or row.get('ten_san_pham')):
                self.focus['product'] = {'product_id': str(row['product_id']),
                    'product_name': row.get('product_name') or row['ten_san_pham'], 'source': name}
        if name == 'request_checkout' and result.get('status') == 'require_confirmation':
            self.checkout = result.get('order_summary')
        if name == 'confirm_checkout' and result.get('status') in {'ok', 'success', 'already_processed'}:
            self.visible = {}
            self.focus = {}
            self.checkout = None
            self.ui.update(products=[], vouchers=[], branches=[], location_candidates=[], payment_options=[])

    def memory_update(self, memory, user_message, reply, stage):
        self.finalize_display()
        return {**memory, 'visible_snapshots': self.visible, 'focus': self.focus,
            'recent_turns': list(memory.get('recent_turns') or []) + [
                {'role': 'user', 'content': safe_text(user_message)}, {'role': 'assistant', 'content': safe_text(reply)}],
            'last_active_business_stage': stage,
            'last_tool_summary': [{'tool': row['tool'], 'status': row['result'].get('status'),
                'count': len(row['result'].get('products') or row['result'].get('results') or [])} for row in self.logs[-8:]]}

    def factual_fallback(self):
        self.used_factual_fallback = True  # Turn-local observability, never business state.
        self.finalize_display()
        flow_reply = self.customer_flow_reply()
        if flow_reply:
            return flow_reply
        from src.agents.tool_capabilities import WRITES
        # Final-write evidence and denials take priority over older draft facts.
        for row in reversed(self.logs):
            if row['tool'] == 'confirm_checkout' and row['result'].get('message'):
                if not any(later['tool'] == 'request_checkout'
                           for later in self.logs[self.logs.index(row)+1:]):
                    return safe_text(row['result']['message'], 3000)
        checkout_tools = {'set_checkout_choices', 'get_payment_options', 'request_checkout', 'set_session_branch'}
        if (any(row['tool'] in checkout_tools and row['result'].get('status') in SUCCESS for row in self.logs)
                or (self.business.get('cart_verified') and (self.business.get('cart') or {}).get('items')
                    and (self.business.get('checkout') or {}).get('checkout_requested')
                    and (not self.logs or (all(row['result'].get('status') not in SUCCESS for row in self.logs)
                        and any(row['tool'] in checkout_tools | {'confirm_checkout'} for row in self.logs))))):
            from src.agents.checkout_contract import missing_checkout_fields, checkout_guidance
            missing = missing_checkout_fields(self.business)
            if missing:
                prefs = self.business.get('checkout') or {}
                fulfillment = {'TAI_CHO': 'dùng tại quán', 'MANG_DI': 'mang đi', 'GIAO_TAN_NOI': 'giao tận nơi'}
                prefix = ('Đã ghi nhận hình thức ' + fulfillment[prefs['delivery_type']] + '. '
                    if any(row['tool'] == 'set_checkout_choices' and row['result'].get('status') in SUCCESS
                           for row in self.logs) and prefs.get('delivery_type') in fulfillment else '')
                return prefix + checkout_guidance(missing)
        for row in reversed(self.logs):
            result = row['result']
            if row['tool'] in WRITES and result.get('status') in {'ok', 'success', 'already_processed', 'require_confirmation'}:
                if result.get('message'):
                    return safe_text(result['message'], 3000)
                if row['tool'] == 'skip_voucher':
                    return 'Đã ghi nhận lựa chọn không dùng mã giảm giá.'
        if self.display_selection_source == 'clarification' or self.display_unresolved:
            failed = [row['result'] for row in self.logs
                      if row['tool'] in DISCOVERY_TOOLS and row['result'].get('status') != 'ok']
            if failed:
                return safe_text(failed[-1].get('message') or 'Mình chưa xác minh đủ kết quả. Bạn thử lại yêu cầu này nhé.', 3000)
            return 'Bạn muốn tổng cộng bao nhiêu món trong danh sách so sánh này?'
        lines = [f"- **{r['product_name']}**: **{float(r['final_price']):,.0f}đ**" for r in self.ui['products'] if r.get('final_price') is not None]
        if lines:
            return 'Dạ, mình gửi bạn các món phù hợp nhé:\n\n' + '\n'.join(lines) + '\n\nBạn muốn chọn món nào ạ?'
        for row in reversed(self.logs):
            result = row['result']
            if row['tool'] == 'get_product_insights' and result.get('status') == 'ok':
                name, rating = result.get('product_name'), result.get('rating')
                if name and rating is not None:
                    return f"{name} hiện có điểm đánh giá {rating}/5 từ dữ liệu khách hàng."
        for row in reversed(self.logs):
            result = row['result']
            cart = result.get('cart') or {}
            if result.get('status') in {'ok', 'success', 'already_processed'} and cart.get('items'):
                items = [f"{r['product_name']} x{r['quantity']}" for r in cart['items']
                         if r.get('product_name') and r.get('quantity')]
                if items:
                    return 'Giỏ hàng hiện tại:\n' + '\n'.join(items)
        return next((safe_text(row['result'].get('message')) for row in reversed(self.logs)
                     if row['result'].get('message')), 'Mình chưa xác minh được kết quả. Bạn thử lại đúng tin nhắn này nhé.')

    def customer_flow_reply(self):
        from src.agents.order_management import ORDER_TOOLS
        order_results = [row['result'] for row in self.logs if row['tool'] in ORDER_TOOLS]
        if order_results and order_results[-1].get('message'):
            return order_results[-1]['message']
        order_reads = [row for row in self.logs if row['tool'] in {'get_order_history', 'get_order_details', 'track_order_status'}]
        if order_reads and order_reads[-1]['tool'] == 'get_order_history':
            from src.agents.order_management import order_history_reply, history_snapshot
            row = order_reads[-1]
            self.used_customer_flow = True
            self.visible['orders'] = snapshot('orders', history_snapshot(row['result'], row['args'].get('limit', 5)))
            self.focus.pop('order', None)
            return order_history_reply(row['result'], row['args'].get('limit', 5))
        if order_reads and order_reads[-1]['tool'] == 'get_order_details':
            row = order_reads[-1]
            self.used_customer_flow = True
            if row['result'].get('status') == 'ok':
                from src.agents.order_management import order_details_reply
                return order_details_reply(row['result'])
            if row['result'].get('message'):
                return row['result']['message']
        if order_reads and order_reads[-1]['tool'] == 'track_order_status' and order_reads[-1]['result'].get('message'):
            self.used_customer_flow = True
            return order_reads[-1]['result']['message']
        if self.safety_facet:
            return None
        if self.discovery_batches and not any(row['tool'] in {
                'add_to_cart', 'update_cart_item', 'remove_cart_item', 'finish_cart',
                'apply_voucher', 'skip_voucher', 'remove_voucher', 'set_checkout_choices'} for row in self.logs):
            return None  # Extra option reads during discovery do not select/configure a product.
        from src.agents.customer_flow_presentation import customer_flow_reply
        self.finalize_display()
        discovery_reply = self.discovery_product_reply(allow_cart_mutations=True)
        reply = customer_flow_reply(self.logs, self.business, discovery_reply)
        from src.agents.cart_edit_evidence import unfinished_edits
        pending_edits = unfinished_edits(getattr(self, 'cart_edit_plan', []), self.logs)
        if reply and len(getattr(self, 'cart_edit_plan', [])) > 1 and pending_edits:
            completed = [row for row in self.logs if row['tool'] in {'update_cart_item', 'remove_cart_item'}
                         and row['result'].get('status') in {'ok', 'already_processed'}]
            if completed:
                reply = customer_flow_reply(completed, self.business) or reply
            details = []
            for request in pending_edits:
                denial = next((row['result'].get('message') for row in reversed(self.logs)
                    if row['tool'] == request['tool'] and str(row['args'].get('cart_item_id')) == request['cart_item_id']
                    and row['result'].get('status') == 'invalid_option' and row['result'].get('message')), None)
                details.append(denial or ('Sửa' if request['tool'] == 'update_cart_item' else 'Xóa') +
                               ' **' + request['product_name'] + '**')
            prefix = ('Dạ, mình mới cập nhật được **một phần yêu cầu** của bạn ạ.' if completed else
                      'Dạ, mình chưa cập nhật các món theo yêu cầu này ạ.')
            reply = (prefix + '\n\n' + reply +
                     '\n\n**Còn chưa thực hiện:**\n' + '\n'.join('- ' + detail for detail in details))
        if reply:
            self.used_customer_flow = True
        return reply

    def discovery_product_reply(self, allow_cart_mutations=False):
        """A catalog row is not evidence for taste, ingredients or popularity."""
        allowed = DISCOVERY_TOOLS | RAG_TOOLS | {'get_product_options'}
        if allow_cart_mutations:
            allowed |= {'add_to_cart', 'update_cart_item', 'remove_cart_item'}
        if self.safety_facet or any(row['tool'] not in allowed for row in self.logs):
            return None
        reads = [row for row in self.logs if row['tool'] in DISCOVERY_TOOLS]
        if self.discovery_scope and reads and all(row['result'].get('status') == 'not_found' for row in reads):
            self.used_product_facts = True
            return reads[-1]['result']['message']
        if not self.discovery_batches or not self.ui['products']:
            return None
        descriptions = {}
        for row in self.logs:
            if row['tool'] not in RAG_TOOLS or row['result'].get('status') != 'ok':
                continue
            for doc in row['result'].get('results') or []:
                if doc.get('domain') == 'product_description' and doc.get('entity_type') == 'product':
                    descriptions.setdefault(str(doc.get('entity_id')), []).append(doc['content'])
        from src.agents.customer_flow_presentation import money
        lines = ['Dạ, mình gửi bạn các món phù hợp nhé:']
        ranking = next((r['result'] for r in reversed(self.logs) if r['result'].get('ranking') == 'completed_paid_quantity'), None)
        if ranking:
            labels = {'day': 'ngày', 'week': 'tuần', 'month': 'tháng', 'year': 'năm', 'all': 'toàn bộ thời gian'}
            period = labels.get(ranking.get('period'), 'khoảng đã chọn')
            anchor = ranking.get('period_anchor')
            lines[0] = f'Dạ, các món có số lượng bán nhiều nhất trong **{period}' + (f' chứa ngày {anchor}' if anchor else ' hiện tại' if period != 'toàn bộ thời gian' else '') + '** (đơn đã hoàn thành và thanh toán):'
        products = self.ui['products']
        scope = self.discovery_scope or {}
        requested = scope.get('requested_count')
        if requested and len(products) < requested:
            lines[0] = (f"Dạ, hiện mình tìm được **{len(products)} món {scope['label']}** phù hợp trong Menu, "
                f"chưa đủ **{requested} món** bạn muốn xem. Mình gửi bạn các món này nhé:")
        buckets = list(dict.fromkeys(row['menu_bucket'] for row in products))
        mixed = len(buckets) > 1
        display_rows = ([row for bucket in buckets for row in products if row['menu_bucket'] == bucket]
                        if mixed else products)
        previous_bucket = None
        for product in display_rows:
            bucket = product['menu_bucket']
            if mixed and bucket != previous_bucket:
                lines.append('**' + PRODUCT_GROUP_LABELS[bucket] + ':**')
                previous_bucket = bucket
            index = product['display_index']
            price = product.get('final_price', product.get('price'))
            line = f"{index}. **{product['product_name']}**" + (f" — **{money(price)}**" if price is not None else '')
            if product.get('sold_count') is not None:
                line += f"\nĐã bán **{product['sold_count']}** sản phẩm trong **{product.get('order_count', 0)}** đơn."
            if product.get('la_moi') and not ranking:
                line += '\nMón mới trong Menu.'
            if mixed and bucket in PRODUCT_REFERENCE_LABELS:
                line += f" ({PRODUCT_REFERENCE_LABELS[bucket]} số {product['group_display_index']})"
            # Keep the exact product identity; never use another product's text
            # or infer its contents from the display name/category.
            source = list(dict.fromkeys(descriptions.get(str(product['product_id']), [])))
            if source:
                line += '\n' + '\n\n'.join(source)
            lines.append(line)
        lines.append('Bạn muốn chọn món nào, hoặc xem mô tả chi tiết món nào ạ?')
        self.used_product_facts = True
        return '\n\n'.join(lines)

    def completed_customer_step(self):
        """A customer-choice boundary has enough authoritative evidence to render now."""
        if not self.logs:
            return None
        meaningful = [row for row in self.logs if not (row['tool'] == 'set_checkout_choices'
            and row['result'].get('changed') is False)]
        if not meaningful:
            return None
        last = meaningful[-1]
        status, name = last['result'].get('status'), last['tool']
        from src.agents.cart_edit_evidence import unfinished_edits
        edit_plan = getattr(self, 'cart_edit_plan', [])
        unfinished = unfinished_edits(edit_plan, self.logs)
        edits_complete = bool((len(edit_plan) > 1 or getattr(self, 'cart_option_followup', None)) and not unfinished)
        needs_option_choice = bool(edit_plan and unfinished and all(any(
            row['tool'] == request['tool'] and str(row['args'].get('cart_item_id')) == request['cart_item_id']
            and row['result'].get('status') == 'invalid_option' for row in self.logs) for request in unfinished))
        from src.agents.order_management import ORDER_TOOLS
        stop = ((name in ORDER_TOOLS and last['result'].get('message')) or (name in {'resolve_location', 'select_location_candidate', 'find_nearest_branch', 'ask_branch'}
                 and (last['result'].get('branches') or last['result'].get('order_summary') or last['result'].get('location_candidates')))
                or status in {'branch_unavailable_or_unknown', 'customer_branch_selection_required'}
                or (name == 'request_checkout' and status == 'require_confirmation')
                or (name == 'confirm_checkout' and status in {'ok', 'success', 'already_processed'})
                or (name == 'finish_cart' and status == 'ok')
                or (name in {'apply_voucher', 'skip_voucher'} and status in {'ok', 'success', 'already_processed'})
                or status in {'needs_options', 'defaults_not_authorized', 'voucher_choice_required',
                             'profile_location_confirmation_required', 'needs_new_location', 'login_required',
                             'product_choice_required', 'cart_change_not_requested', 'wallet_unavailable', 'insufficient_wallet'}
                or edits_complete or needs_option_choice
                or (name == 'set_checkout_choices' and (
                    (self.business.get('checkout') or {}).get('profile_location_offer')
                    or (last['result'].get('profile_location') or {}).get('status') in {'empty', 'unavailable'})))
        reply = self.customer_flow_reply() if stop else None
        if not reply:
            return None
        self.response_validation_issue = None
        return json.dumps({'response_kind': 'action', 'reply': reply,
                           'mutation_claims': [], 'evidence_quotes': []}, ensure_ascii=False)

    def response_issue(self, raw):
        self.response_validation_issue = None
        issue = self._response_issue(raw)
        if issue:
            if self.response_validation_issue is None:
                self.response_validation_issue = 'missing_tool_evidence' if issue.startswith('TOOL_REQUIRED:') else 'missing_envelope'
        return issue

    def _display_issue(self, envelope):
        selection, count = envelope.get('display_product_ids'), envelope.get('display_product_count')
        if len(self.discovery_batches) > 1 and (selection is None or count is None):
            return 'Declare display_product_count as the requested TOTAL across all discovery reads and select display_product_ids. If total versus each is ambiguous, ask one clarification and display no products (count 0, ids []).'
        if count is not None and (type(count) is not int or not 0 <= count <= 16
                                  or not isinstance(selection, list) or len(selection) != count):
            return 'display_product_ids must contain exactly display_product_count canonical IDs, the requested TOTAL across all reads, not the limit per read.'
        if selection is not None:
            canonical = set(self.product_candidates) | {str(row['product_id']) for row in self.ui['products']}
            if (not isinstance(selection, list) or len(selection) > 16
                    or any(not isinstance(key, str) or key not in canonical for key in selection)
                    or len(set(selection)) != len(selection)):
                return 'Select unique canonical display_product_ids from this turn only.'
        return None

    def _response_issue(self, raw):
        try:
            envelope = json.loads(raw)
        except (ValueError, TypeError):
            return 'Return the required JSON envelope with response_kind, reply, mutation_claims and evidence_quotes.'
        if not isinstance(envelope, dict) or not isinstance(envelope.get('reply'), str):
            return 'Return the required JSON envelope with a string reply.'
        display_issue = self._display_issue(envelope)
        self.display_unresolved = bool(display_issue)
        if display_issue:
            self.response_validation_issue = 'display_selection_invalid'
            return display_issue
        if not self.logs and envelope.get('response_kind') not in {'social', 'clarification'}:
            return ('TOOL_REQUIRED: There is no current tool evidence. You MUST call the appropriate capability now. '
                    'For product discovery use filter_catalog/get_recommendations; for a fact use its authority. History is not factual authority.')
        if (not self.logs and envelope.get('response_kind') == 'clarification'
                and self.safety_facet and self.has_canonical_product):
            return ('TOOL_REQUIRED: One canonical product is already established. Use get_product_description '
                    'or search_knowledge_base for this static product facet instead of asking which product.')
        denied_statuses = {'wrong_authority', 'requires_product', 'unknown_product_reference'}
        if (envelope.get('response_kind') and self.logs
                and all(row['result'].get('status') in denied_statuses for row in self.logs)):
            return ('TOOL_REQUIRED: The proposed authority/target was denied. Call a capability from the structured '
                    'recovery information, or ask one clarification when no safe canonical target exists.')
        from src.agents.tool_capabilities import WRITES
        successful_writes = {row['tool'] for row in self.logs
            if row['tool'] in WRITES and row['result'].get('changed') is not False and row['result'].get('status') in {'ok', 'success', 'already_processed'}}
        successful_tools = {row['tool'] for row in self.logs
            if row['result'].get('status') in SUCCESS}
        if (self.has_pending_confirmation and not any(row['tool'] == 'confirm_checkout' for row in self.logs)
                and {'get_cart', 'get_cart_quote'} <= successful_tools
                and 'request_checkout' not in successful_tools):
            return ('TOOL_REQUIRED: Cart lines and a quote do not render the canonical confirmation UI. '
                    'Call request_checkout with reuse_summary=true to show the pending order summary again.')
        from src.agents.cart_edit_evidence import unfinished_edits
        unfinished = unfinished_edits(getattr(self, 'cart_edit_plan', []), self.logs)
        needs_option_choice = bool(unfinished and all(any(
            row['tool'] == request['tool'] and str(row['args'].get('cart_item_id')) == request['cart_item_id']
            and row['result'].get('status') == 'invalid_option' for row in self.logs) for request in unfinished))
        if len(getattr(self, 'cart_edit_plan', [])) > 1 and unfinished and not needs_option_choice:
            return ('TOOL_REQUIRED: Complete every requested cart edit against the original turn cart IDs: ' +
                    json.dumps([{key: request[key] for key in ('tool', 'cart_item_id', 'fields')}
                                for request in unfinished], ensure_ascii=False) + '.')
        recoverable_write_denials = {'unknown_product_reference', 'cart_reference_conflict',
            'pending_quantity_conflict', 'cart_quantity_conflict', 'checkout_choice_conflict',
            'voucher_selection_conflict', 'conflicting_cart_operations'}
        unresolved_denials = []
        for row in self.logs:
            result = row['result']
            if row['tool'] not in WRITES or result.get('status') not in recoverable_write_denials:
                continue
            expected_tool = (result.get('active_operation')
                             if result.get('status') == 'conflicting_cart_operations' else row['tool'])
            if expected_tool not in successful_writes:
                unresolved_denials.append(expected_tool)
        if envelope.get('response_kind') and unresolved_denials:
            return ('TOOL_REQUIRED: A requested write was denied by independent safety evidence. '
                    'Correct the canonical target/arguments from the structured result and retry the unresolved operation: '
                    + ', '.join(sorted(set(unresolved_denials))) + '.')
        if self.logs and all(row['result'].get('status') == 'invalid_arguments' for row in self.logs):
            return 'The tool arguments failed schema validation. Correct them using required_fields and allowed_fields from the result, then call the appropriate capability.'
        return None

    def validate_reply(self, raw):
        """Validate evidence/protocol claims, not natural-language intent."""
        envelope = None
        try:
            envelope = json.loads(raw)
        except (ValueError, TypeError, AttributeError):
            if isinstance(raw, str):
                match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)
                if match:
                    try:
                        envelope = json.loads(match.group(1))
                    except (ValueError, TypeError):
                        pass
        if not isinstance(envelope, dict):
            return self._fallback('missing_envelope')
        reply = str(envelope.get('reply') or '')
        claims = envelope.get('mutation_claims') or []
        if not isinstance(claims, list) or any(not isinstance(name, str) for name in claims):
            return self._fallback('mutation_claim_mismatch')
        if self._display_issue(envelope):
            self.display_unresolved = True
            return self._fallback('display_selection_invalid')
        if self.safety_facet in {'ingredient', 'allergen'}:
            from src.function_calling.tools.knowledge_tools import INSUFFICIENT_MESSAGE
            evidence = [row['result'] for row in self.logs if row['tool'] in RAG_TOOLS]
            docs = [doc for result in evidence for doc in result.get('results', [])]
            if self.safety_facet == 'allergen':
                return next((result['message'] for result in evidence if result.get('message')), INSUFFICIENT_MESSAGE)
            requested = [term for term in ('sua', 'caffein', 'caffeine')
                         if term in normalize_text(self.knowledge_question).split()]
            if not docs or not all(any(term in normalize_text(doc['content']).split() for doc in docs) for term in requested):
                return INSUFFICIENT_MESSAGE
        selection = envelope.get('display_product_ids')
        if isinstance(selection, list):
            self.display_unresolved = False
            self._publish_products(selection, 'llm_validated' if selection else 'clarification')
        rag = [r['result'] for r in self.logs if r['tool'] in RAG_TOOLS]
        if rag:
            docs = {d['id']: d for result in rag for d in result.get('results', [])}
            if not docs:
                return next((r.get('message') for r in rag if r.get('message')), 'Tài liệu hiện có chưa đủ thông tin để trả lời.')
            quotes = []
            proposed_quotes = envelope.get('evidence_quotes') or []
            if not isinstance(proposed_quotes, list):
                proposed_quotes = []
            for claim in proposed_quotes[:3]:
                if not isinstance(claim, dict) or not isinstance(claim.get('document_id'), str):
                    quotes = []
                    break
                doc, quote = docs.get(claim.get('document_id')), claim.get('quote')
                if not doc or not isinstance(quote, str) or quote not in doc['content'] or len(quote) < 12:
                    quotes = []
                    break
                # Keep complete evidence, including qualifiers/negations.
                if quote.strip() != doc['content'].strip():
                    quotes = []
                    break
                quotes.append(quote)
            valid_grounding = bool(quotes)
            if not quotes:
                quotes = [d['content'] for d in list(docs.values())[:2]]
            evidence_words = {word for quote in quotes for word in normalize_text(quote).split()
                              if len(word) >= 3 and word not in {'theo', 'hien', 'thong', 'tin', 'khach', 'hang'}}
            reply_words = set(normalize_text(reply).split())
            natural_grounding_visible = bool(evidence_words & reply_words)
            # Normal static knowledge may use a cited natural paraphrase when
            # its customer-facing text visibly overlaps the approved evidence.
            # Safety facets, invalid citations and generic filler keep exact text.
            if (not valid_grounding or not natural_grounding_visible
                    or any(doc.get('domain') == 'product_description' for doc in docs.values())
                    or self.safety_facet in {'ingredient', 'allergen'}):
                # Product descriptions keep complete Menu evidence; mere word
                # overlap does not justify an invented flavour/ingredient claim.
                reply = 'Dạ, theo mô tả hiện có của quán:\n\n' + '\n\n'.join(quotes) if any(
                    doc.get('domain') == 'product_description' for doc in docs.values()) else 'Theo tài liệu hiện có:\n' + '\n'.join(quotes)
            # A compound consultation may also request current price. Preserve
            # the approved knowledge qualifiers and append only provider facts.
            prices = [r for row in self.logs if row['tool'] == 'check_price_and_stock'
                      and row['result'].get('status') == 'ok'
                      for r in row['result'].get('products', [])]
            facts = [f"{r['product_name']}: {float(r['final_price']):,.0f}đ"
                     for r in prices if r.get('product_name') and r.get('final_price') is not None]
            if facts:
                reply += '\nGiá hiện tại:\n' + '\n'.join(facts)
        successful = {r['tool'] for r in self.logs
                      if r['result'].get('changed') is not False and r['result'].get('status') in {'ok', 'success', 'already_processed', 'require_confirmation'}}
        changed = {r['tool'] for r in self.logs if r['tool'] in successful and r['result'].get('changed') is not False}
        if any(name not in changed for name in claims):
            return self._fallback('mutation_claim_mismatch')
        normalized = normalize_text(reply)
        # Output claims require evidence for that specific business operation.
        # These checks validate response claims; they never route user language.
        for pattern, tools in (
            (r'\bda\s+(?:duoc\s+)?(?:dat|tao)\s+don\b', {'confirm_checkout'}),
            (r'\bda\s+(?:duoc\s+)?ap\s+(?:voucher|ma)\b', {'apply_voucher'}),
            (r'\bda\s+(?:duoc\s+)?them\b', {'add_to_cart', 'confirm_order_change'}),
            (r'\bda\s+(?:duoc\s+)?xoa\b', {'remove_cart_item', 'remove_voucher', 'discard_pending_product'}),
            (r'\bda\s+(?:duoc\s+)?cap nhat\b', {'update_cart_item', 'set_checkout_choices', 'set_session_branch', 'confirm_order_change'}),
        ):
            if re.search(pattern, normalized) and not successful.intersection(tools):
                return self._fallback('confirmation_contract_mismatch' if 'confirm_checkout' in tools else 'mutation_claim_mismatch')
        claims_write = bool(re.search(r'\bda\s+(?:them|xoa|cap nhat|ap|dat|tao don)\b', normalize_text(reply)))
        from src.agents.tool_capabilities import WRITES
        if claims_write and not successful.intersection(WRITES):
            return self._fallback('mutation_claim_mismatch')
        if any(name in reply for name in ('checkout_action_id', 'system prompt', 'tool_calls', 'Bearer ')):
            return self._fallback('internal_content')
        from src.agents.tool_capabilities import CAPABILITIES
        if any(name in reply for name in CAPABILITIES) or reply.lstrip().startswith(('{', '[')):
            return self._fallback('internal_content')
        amounts = set()
        def collect_amounts(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key in {'final_price', 'unit_price', 'price', 'subtotal', 'total', 'final_total',
                               'so_tien_giam', 'so_tien_giam_du_kien', 'balance', 'line_total',
                               'delivery_fee', 'discount_amount', 'total_price'} and type(item) in (int, float):
                        amounts.add(int(item))
                    collect_amounts(item)
            elif isinstance(value, list):
                for item in value:
                    collect_amounts(item)
        for row in self.logs:
            collect_amounts(row['result'])
        quoted_amounts = set()
        for value, currency in re.findall(r'\b(\d[\d.,]*)\s*(đồng|đ|VNĐ|VND|nghìn|k)\b', reply, re.IGNORECASE):
            try:
                if currency.lower() in {'k', 'nghìn'}:
                    amount = float(value.replace(',', '.')) * 1000
                else:
                    amount = int(re.sub(r'[.,]', '', value))
            except ValueError:
                return self.factual_fallback()
            quoted_amounts.add(int(amount))
        if quoted_amounts - amounts:
            return self._fallback('unverified_amount')
        from src.agents.guardrails import check_output
        checked, _ = check_output(safe_text(reply, 3000))
        return checked or self.factual_fallback()

    def _fallback(self, issue):
        self.response_validation_issue = issue
        return self.factual_fallback()
