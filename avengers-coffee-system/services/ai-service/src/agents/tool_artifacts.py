"""Canonical UI artifacts are derived from tool results, never model prose."""
import hashlib
import json
import re
from src.agents.agent_memory import compact, snapshot, safe_text
from src.rag.documents import normalize_text

SUCCESS = {'ok', 'require_confirmation', 'already_processed', 'need_branch_selection', 'ambiguous'}
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
    if result.get('status') not in SUCCESS | {'no_applicable_voucher', 'empty_cart'}:
        return compact(result)  # Preserve every denial/recovery field.
    value = {key: compact(result[key]) for key in ('status', 'message', 'changed',
        'same_turn_read_reused', 'product_id', 'product_name', 'quantity', 'unit_price',
        'voucher_code', 'voucher_decided', 'discount_amount', 'total_cart', 'choices',
        'order_id', 'order_status', 'payment_method', 'total_price', 'normalized_location') if key in result}
    if isinstance(result.get('cart'), dict):
        value['cart'] = model_cart(result['cart'])
    if isinstance(result.get('quote'), dict):
        value['quote'] = {key: result['quote'][key] for key in ('subtotal', 'discount_amount',
            'delivery_fee', 'final_total', 'voucher_code', 'voucher_valid') if key in result['quote']}
    for kind in ('products', 'vouchers', 'branches', 'location_candidates', 'payment_options'):
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
        projected = model_snapshot(kind, rows)
        for index, (row, original) in enumerate(zip(projected, rows), 1):
            if artifacts and kind in {'products', 'branches', 'vouchers'}:
                row['display_index'] = indices.get(identity(original))
                if row['display_index'] is None:
                    row['not_displayed'] = True  # Fresh facts remain available; no invented ordinal.
            else:
                row['display_index'] = original.get('display_index', index)
            if kind == 'products':
                for key in ('product_id', 'product_name', 'final_price', 'price', 'category',
                    'rating', 'avg_rating', 'total_reviews', 'sold_count', 'stock', 'stock_quantity', 'in_stock', 'is_active',
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
    if name == 'request_checkout' and isinstance(result.get('order_summary'), dict):
        summary = result['order_summary']
        value['order_summary'] = {key: compact(summary[key]) for key in ('branch_id', 'branch_name',
            'subtotal', 'total_price', 'discount_amount', 'delivery_fee', 'final_total',
            'voucher_code', 'delivery_type', 'payment_method', 'delivery_address', 'action_id',
            'checkout_action_id') if key in summary}
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
        self.visible = dict(memory.get('visible_snapshots') or {})
        self.focus = dict(memory.get('focus') or {})
        pending_products = ((context or {}).get('business') or {}).get('pending_products') or []
        self.has_canonical_product = bool(self.focus.get('product') or len(pending_products) == 1)
        pending = ((context or {}).get('business') or {}).get('pending') or {}
        self.has_pending_confirmation = pending.get('type') == 'confirm_checkout'
        self.logs = []
        self.ui = {'products': [], 'vouchers': [], 'branches': [], 'actions': []}
        self.checkout = None

    def collect(self, name, args, result):
        self.logs.append({'tool': name, 'args': compact(args), 'result': result})
        if result.get('status') not in SUCCESS:
            return
        product = result.get('canonical_product')
        if product and product.get('product_id') and product.get('product_name'):
            self.focus['product'] = {**product, 'source': name}
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
        if name == 'set_session_branch':
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
            if kind == 'location_candidates':
                rows = [{**row, 'candidate_id': candidate_id(row)} for row in rows]
            if kind in ('products', 'branches', 'vouchers'):
                previous = self.ui.get(kind) or []
                def identity(row):
                    return str(next((row[k] for k in ('product_id', 'branch_id', 'ma_chi_nhanh', 'voucher_code', 'ma_voucher') if row.get(k)), row))
                combined = {identity(row): row for row in previous + rows}
                rows = list(combined.values())[:16 if kind == 'products' else 5]
            rows = [{**row, 'display_index': i} for i, row in enumerate(rows, 1)]
            self.ui[kind] = rows
            self.visible[kind] = snapshot(kind, rows)
        if len(result.get('products') or []) == 1:
            row = result['products'][0]
            if row.get('product_id') and (row.get('product_name') or row.get('ten_san_pham')):
                self.focus['product'] = {'product_id': str(row['product_id']),
                    'product_name': row.get('product_name') or row['ten_san_pham'], 'source': name}
        if name == 'request_checkout' and result.get('status') == 'require_confirmation':
            self.checkout = result.get('order_summary')
        if name == 'confirm_checkout' and result.get('status') in {'ok', 'already_processed'}:
            self.visible = {}
            self.focus = {}
            self.checkout = None
            self.ui.update(products=[], vouchers=[], branches=[], location_candidates=[], payment_options=[])

    def memory_update(self, memory, user_message, reply, stage):
        return {**memory, 'visible_snapshots': self.visible, 'focus': self.focus,
            'recent_turns': list(memory.get('recent_turns') or []) + [
                {'role': 'user', 'content': safe_text(user_message)}, {'role': 'assistant', 'content': safe_text(reply)}],
            'last_active_business_stage': stage,
            'last_tool_summary': [{'tool': row['tool'], 'status': row['result'].get('status'),
                'count': len(row['result'].get('products') or row['result'].get('results') or [])} for row in self.logs[-8:]]}

    def factual_fallback(self):
        self.used_factual_fallback = True  # Turn-local observability, never business state.
        from src.agents.tool_capabilities import WRITES
        for row in reversed(self.logs):
            result = row['result']
            if row['tool'] in WRITES and result.get('status') in {'ok', 'already_processed', 'require_confirmation'}:
                if result.get('message'):
                    return safe_text(result['message'], 3000)
                if row['tool'] == 'skip_voucher':
                    return 'Đã ghi nhận lựa chọn không dùng mã giảm giá.'
        lines = [f"{r['product_name']}: {float(r['final_price']):,.0f}đ" for r in self.ui['products'] if r.get('final_price') is not None]
        if lines:
            return '\n'.join(lines)
        for row in reversed(self.logs):
            result = row['result']
            if row['tool'] == 'get_product_insights' and result.get('status') == 'ok':
                name, rating = result.get('product_name'), result.get('rating')
                if name and rating is not None:
                    return f"{name} hiện có điểm đánh giá {rating}/5 từ dữ liệu khách hàng."
        for row in reversed(self.logs):
            result = row['result']
            cart = result.get('cart') or {}
            if result.get('status') in {'ok', 'already_processed'} and cart.get('items'):
                items = [f"{r['product_name']} x{r['quantity']}" for r in cart['items']
                         if r.get('product_name') and r.get('quantity')]
                if items:
                    return 'Giỏ hàng hiện tại:\n' + '\n'.join(items)
        return next((safe_text(row['result'].get('message')) for row in reversed(self.logs)
                     if row['result'].get('message')), 'Mình chưa xác minh được kết quả. Bạn thử lại đúng tin nhắn này nhé.')

    def response_issue(self, raw):
        try:
            envelope = json.loads(raw)
        except (ValueError, TypeError):
            return 'Return the required JSON envelope with response_kind, reply, mutation_claims and evidence_quotes.'
        if not isinstance(envelope, dict) or not isinstance(envelope.get('reply'), str):
            return 'Return the required JSON envelope with a string reply.'
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
            if row['tool'] in WRITES and row['result'].get('status') in {'ok', 'already_processed'}}
        successful_tools = {row['tool'] for row in self.logs
            if row['result'].get('status') in SUCCESS}
        if (self.has_pending_confirmation
                and {'get_cart', 'get_cart_quote'} <= successful_tools
                and 'request_checkout' not in successful_tools):
            return ('TOOL_REQUIRED: Cart lines and a quote do not render the canonical confirmation UI. '
                    'Call request_checkout with reuse_summary=true to show the pending order summary again.')
        recoverable_write_denials = {'unknown_product_reference', 'cart_reference_conflict',
            'pending_quantity_conflict', 'cart_quantity_conflict', 'checkout_choice_conflict',
            'conflicting_cart_operations'}
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
        try:
            envelope = json.loads(raw)
            reply = str(envelope.get('reply') or '')
        except (ValueError, TypeError, AttributeError):
            envelope, reply = {}, str(raw or '')
        claims = envelope.get('mutation_claims') or []
        if not isinstance(claims, list) or any(not isinstance(name, str) for name in claims):
            return self.factual_fallback()
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
            canonical = {str(row['product_id']): row for row in self.ui['products']}
            if len(selection) > 16 or len(set(map(str, selection))) != len(selection) or any(str(key) not in canonical for key in selection):
                return self.factual_fallback()
            self.ui['products'] = [{**canonical[str(key)], 'display_index': i}
                                   for i, key in enumerate(selection, 1)]
            if selection:
                self.visible['products'] = snapshot('products', self.ui['products'])
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
                    or self.safety_facet in {'ingredient', 'allergen'}):
                reply = 'Theo tài liệu hiện có:\n' + '\n'.join(quotes)
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
                      if r['result'].get('status') in {'ok', 'already_processed', 'require_confirmation'}}
        if any(name not in successful for name in claims):
            return self.factual_fallback()
        normalized = normalize_text(reply)
        # Output claims require evidence for that specific business operation.
        # These checks validate response claims; they never route user language.
        for pattern, tools in (
            (r'\bda\s+(?:duoc\s+)?(?:dat|tao)\s+don\b', {'confirm_checkout'}),
            (r'\bda\s+(?:duoc\s+)?ap\s+(?:voucher|ma)\b', {'apply_voucher'}),
            (r'\bda\s+(?:duoc\s+)?them\b', {'add_to_cart'}),
            (r'\bda\s+(?:duoc\s+)?xoa\b', {'remove_cart_item', 'remove_voucher', 'discard_pending_product'}),
            (r'\bda\s+(?:duoc\s+)?cap nhat\b', {'update_cart_item', 'set_checkout_choices', 'set_session_branch'}),
        ):
            if re.search(pattern, normalized) and not successful.intersection(tools):
                return self.factual_fallback()
        claims_write = bool(re.search(r'\bda\s+(?:them|xoa|cap nhat|ap|dat|tao don)\b', normalize_text(reply)))
        from src.agents.tool_capabilities import WRITES
        if claims_write and not successful.intersection(WRITES):
            return self.factual_fallback()
        if any(name in reply for name in ('checkout_action_id', 'system prompt', 'tool_calls', 'Bearer ')):
            return self.factual_fallback()
        from src.agents.tool_capabilities import CAPABILITIES
        if any(name in reply for name in CAPABILITIES) or reply.lstrip().startswith(('{', '[')):
            return self.factual_fallback()
        amounts = set()
        def collect_amounts(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key in {'final_price', 'unit_price', 'price', 'subtotal', 'total', 'final_total',
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
            return self.factual_fallback()
        from src.agents.guardrails import check_output
        checked, _ = check_output(safe_text(reply, 3000))
        return checked or self.factual_fallback()
