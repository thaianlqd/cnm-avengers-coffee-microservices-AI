"""Owned existing orders: prepare a server-bound preview, confirm on a later turn."""
from copy import deepcopy
import hashlib
import os
import re
import time
from uuid import UUID
import requests
from src.common import cart_manager
from src.function_calling.helpers import _require_valid_session, _get_service_jwt
from src.rag.documents import normalize_text

ORDER_TOOLS = {'cancel_order', 'update_order', 'reorder_order', 'confirm_order_change', 'discard_order_change'}
ORDER_ID = re.compile(r'\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b')
ORDER_ORDINAL = re.compile(r'\bdon(?: hang)?\s+(?:so|thu)?\s*(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\b')


def history_snapshot(result, count):
    if result.get('status') != 'ok':
        return []
    rows = []
    for index, order in enumerate((result.get('orders') or [])[:count], 1):
        identity = str(order.get('ma_don_hang') or '')
        if not ORDER_ID.fullmatch(identity.lower()):
            return []  # Never renumber around an invalid service identity.
        rows.append({'order_id': identity.lower(), 'display_index': index,
            'order_status': order.get('trang_thai_don_hang'),
            'payment_status': order.get('trang_thai_thanh_toan'),
            'created_at': order.get('ngay_tao'), 'total_price': order.get('tong_tien')})
    return rows


def restore_history_snapshot(memory, prefs):
    """Migrate a pre-fix displayed list only from its verified turn receipt.

    Match the server reply to the conversation; never extract IDs from prose
    or refetch/reorder recent orders to guess a previous numbered selection.
    """
    if (memory.get('visible_snapshots') or {}).get('orders'):
        return
    from src.agents.agent_memory import safe_text
    receipts = (prefs.get('processed_order_turns') or {}).values()
    for turn in reversed(memory.get('recent_turns') or []):
        if turn.get('role') != 'assistant':
            continue
        candidates = []
        for receipt in receipts:
            result = receipt.get('result') or {}
            if safe_text(result.get('reply')) != turn.get('content'):
                continue
            reads = [row for row in result.get('tool_calls_log') or []
                     if row.get('tool') in {'get_order_history', 'get_order_details', 'track_order_status'}]
            if not reads or reads[-1]['tool'] != 'get_order_history':
                continue
            read = reads[-1]
            if any(row.get('tool') in ORDER_TOOLS for row in result.get('tool_calls_log') or []):
                continue
            if read['result'].get('status') in {'ok', 'not_found'}:
                candidates.append(history_snapshot(read['result'], read.get('args', {}).get('limit', 5)))
            else:
                return  # A newer failed history read cannot resurrect an older list.
        if candidates:
            if all(rows == candidates[0] for rows in candidates):
                memory.setdefault('visible_snapshots', {})['orders'] = candidates[0]
            return


def order_reference(message, orders):
    targets = list(dict.fromkeys(ORDER_ID.findall(message.lower())))
    ordinals = list(dict.fromkeys(ORDER_ORDINAL.findall(normalize_text(message))))
    if not ordinals:
        return None
    words = {'mot': 1, 'hai': 2, 'ba': 3, 'bon': 4, 'nam': 5, 'sau': 6, 'bay': 7, 'tam': 8, 'chin': 9, 'muoi': 10}
    if len(ordinals) != 1 or len(targets) > 1:
        return {'status': 'ambiguous', 'message': 'Bạn chọn một đơn trong danh sách vừa xem để mình xử lý nhé.'}
    index = int(ordinals[0]) if ordinals[0].isdigit() else words[ordinals[0]]
    rows = [row for row in orders or [] if row.get('display_index') == index]
    if len(rows) != 1 or not ORDER_ID.fullmatch(str(rows[0].get('order_id') or '')):
        return {'status': 'unknown', 'message': 'Mình chưa xác định được số đơn này từ danh sách đã hiển thị. Bạn xem lại lịch sử đơn hoặc gửi mã đơn đầy đủ nhé.'}
    identity = rows[0]['order_id']
    if targets and targets[0] != identity:
        return {'status': 'ambiguous', 'message': 'Số thứ tự và mã đơn bạn gửi đang chỉ hai đơn khác nhau. Bạn chọn lại một đơn nhé.'}
    return {'status': 'ok', 'order_id': identity, 'display_index': index}


def literal_order_selection(message):
    """Only select an existing order; no option parsing or confirmation here."""
    if '?' in message:
        return None
    norm = normalize_text(message)
    target = r'(?:so|thu)?\s*(?:\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)'
    prefix = r'(?:(?:vay|the|the thi|vay thi)\s+)?(?:(?:cho|giup)\s+(?:toi|minh|em)\s+)?(?:(?:toi|minh|em)\s+(?:(?:muon|can)\s+)?)?'
    suffix = r'(?:\s+(?:di|nhe|nha|a|ban|b|oi|giup|toi|minh|voi|toi dat gi|da dat gi))*'
    verbs = {
        'get_order_details': r'(?:xem|kiem tra|chi tiet)',
        'update_order': r'(?:sua|doi)',
        'cancel_order': r'huy(?: bo)?',
        'reorder_order': r'(?:dat lai|mua lai)'
    }
    for kind, verb in verbs.items():
        noun = r'\s+(?:(?:mon|chi tiet|thong tin)?(?:\s+(?:cua|trong))?\s+)?don(?: hang)?\s+'
        if re.fullmatch(prefix + verb + noun + target + suffix, norm):
            return kind
    return None


def literal_order_id_selection(message):
    """One literal UUID plus a selection command, in either order; never parse edits."""
    identities = ORDER_ID.findall(message.lower())
    if len(identities) != 1 or '?' in message:
        return None
    placeholder = ORDER_ID.sub('orderidref', message.lower())
    cleaned = re.sub(r'(=>|->|:|#)', ' ', placeholder)
    norm = normalize_text(cleaned)
    prefix = r'(?:(?:vay|the|the thi|vay thi)\s+)?(?:(?:cho|giup)\s+(?:toi|minh|em)\s+)?(?:(?:toi|minh|em)\s+(?:(?:muon|can)\s+)?)?'
    suffix = r'(?:\s+(?:di|nhe|nha|a|ban|b|oi|giup|toi|minh|voi|toi dat gi|da dat gi))*'
    verbs = {
        'update_order': r'(?:sua|doi)',
        'cancel_order': r'huy(?: bo)?',
        'reorder_order': r'(?:dat lai|mua lai)'
    }
    for kind, verb in verbs.items():
        noun = r'\s+(?:(?:mon|chi tiet|thong tin)?(?:\s+(?:cua|trong))?\s+)?don(?: hang)?(?:\s+(?:nay|do))?'
        commands = (
            prefix + verb + noun + r'\s+orderidref' + suffix,
            r'orderidref\s+' + prefix + verb + noun + suffix,
            r'orderidref\s+' + prefix + verb + suffix,
            prefix + verb + noun + suffix + r'\s+orderidref' + suffix,
            prefix + verb + r'\s+orderidref' + suffix
        )
        if any(re.fullmatch(command, norm) for command in commands):
            return kind, {'order_id': identities[0]}
    return None


def active_edit_focus(message, prefs):
    focus = prefs.get('order_management_focus') or {}
    if float(focus.get('expires_at') or 0) <= time.time():
        return None
    if re.search(r'\b(?:gio hang|xem menu|mua them|toi muon mua|minh muon mua|cho toi xem)\b', normalize_text(message)):
        return None
    return focus


def management_scope(message, prefs):
    return bool(prefs.get('order_management_action') or active_edit_focus(message, prefs) or literal_order_selection(message) or re.search(
        r'\b(?:don hang|don\s+(?:so|thu)?\s*(?:\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)|don da dat|don vua dat|don moi dat|don gan nhat|don gan day|don moi nhat|huy don|sua don|doi don|dat lai|mua lai|lich su don|ma don)\b', normalize_text(message))
        or (re.search(r'\bdon\b', normalize_text(message)) and
            (ORDER_ID.search(message.lower()) or re.search(r'\btrang thai\b', normalize_text(message)))))


def recent_order_read(message):
    """An explicit recent-history read needs no inferred order target or write."""
    norm = normalize_text(message)
    if (ORDER_ID.search(message.lower())
            or re.search(r'\b(?:huy|xoa|sua|doi|dat lai|mua lai|thanh toan|xac nhan|gio hang|'
                         r'khong|dung|neu|chi|da huy|hoan thanh|hom nay|thang|tuan)\b', norm)
            or not re.search(r'\b(?:xem|kiem tra|tra cuu|lich su)\b', norm)
            or not re.search(r'\bdon(?: hang)?\b', norm)
            or not re.search(r'\b(?:gan nhat|gan day|moi nhat|lich su)\b', norm)):
        return None
    match = re.search(r'\b(\d+|mot|hai|ba|bon|nam|muoi)\s+don(?: hang)?\b', norm)
    words = {'mot': 1, 'hai': 2, 'ba': 3, 'bon': 4, 'nam': 5, 'muoi': 10}
    count = (int(match[1]) if match[1].isdigit() else words[match[1]]) if match else 5
    if not match and re.search(r'\bdon(?: hang)? moi nhat\b', norm):
        count = 1
    if not 1 <= count <= 20:
        return None
    vocabulary = set(('cho toi minh em ban giup xem kiem tra cuu trang thai lich su don hang '
                      'gan nhat day moi da dat di oi nhe nha a cua muon can hom roi '
                      'mot hai ba bon nam muoi').split())
    if any(token not in vocabulary and token != str(count) for token in norm.split()):
        return None  # Extra filters or mixed requests stay with the interpreter.
    return 'get_order_history', {'limit': count}


def order_history_reply(result, requested_count):
    """Render only current owned history evidence, including pending orders."""
    if result.get('status') != 'ok':
        return result.get('message') or 'Mình chưa tra cứu được lịch sử đơn hàng lúc này. Bạn thử lại nhé.'
    orders = (result.get('orders') or [])[:requested_count]
    if not orders:
        return 'Dạ, tài khoản của bạn hiện chưa có đơn hàng nào ạ.'
    statuses = {'MOI_TAO': 'Mới tạo', 'DA_XAC_NHAN': 'Đã xác nhận', 'DANG_CHUAN_BI': 'Đang chuẩn bị',
                'DANG_GIAO': 'Đang giao', 'DA_GIAO': 'Đã giao', 'HOAN_THANH': 'Hoàn thành', 'DA_HUY': 'Đã huỷ'}
    payments = {'CHO_THANH_TOAN': 'Chưa thanh toán', 'CHUA_THANH_TOAN': 'Chưa thanh toán',
                'DA_THANH_TOAN': 'Đã thanh toán', 'DA_HOAN_TIEN': 'Đã hoàn tiền', 'THAT_BAI': 'Thanh toán thất bại',
                'CHO_THANH_TOAN_KHI_NHAN_HANG': 'Thanh toán khi nhận hàng (COD)',
                'THANH_TOAN_KHI_NHAN_HANG': 'Thanh toán khi nhận hàng (COD)',
                'TIEN_MAT': 'Thanh toán khi nhận hàng (COD)',
                'CASH': 'Thanh toán khi nhận hàng (COD)',
                'VI_DIEN_TU': 'Ví điện tử', 'VNPAY': 'VNPAY', 'NGAN_HANG_QR': 'Ngân hàng QR',
                'MOMO': 'MoMo', 'ZALOPAY': 'ZaloPay'}
    lead = (f'Dạ, đây là **{len(orders)} đơn gần nhất** của bạn:' if len(orders) == requested_count else
            f'Dạ, tài khoản của bạn hiện có **{len(orders)} đơn**, chưa đủ {requested_count} đơn bạn muốn xem:')
    lines = [lead]
    from datetime import datetime, timedelta, timezone
    for index, order in enumerate(orders, 1):
        status = order.get('trang_thai_don_hang')
        status_label = statuses.get(status, status or 'Chưa có dữ liệu')
        lines.append(f"{index}. **Đơn {order['ma_don_hang']}**\n   Trạng thái: **{status_label}**")
        created = order.get('ngay_tao')
        if created:
            try:
                date = datetime.fromisoformat(str(created).replace('Z', '+00:00'))
                if date.tzinfo:
                    date = date.astimezone(timezone(timedelta(hours=7)))
                created = date.strftime('%d/%m/%Y %H:%M')
            except (ValueError, TypeError):
                pass
            lines.append(f'   Đặt lúc: {created}')
        if order.get('tong_tien') is not None:
            lines.append(f"   Tổng tiền: **{money(order['tong_tien'])}**")
        p_method = order.get('phuong_thuc_thanh_toan')
        p_status = order.get('trang_thai_thanh_toan')
        order_type = order.get('loai_don_hang')
        is_cod = p_method in {'THANH_TOAN_KHI_NHAN_HANG', 'TIEN_MAT', 'CASH'} or p_status == 'CHO_THANH_TOAN_KHI_NHAN_HANG'
        if is_cod:
            pay_label = 'Tiền mặt COD' if order_type == 'GIAO_TAN_NOI' else 'Thanh toán tại quầy'
        elif p_method in {'VI_DIEN_TU', 'VI_AVENGERS'}:
            pay_label = 'Ví Avengers' + (f" ({payments.get(p_status, p_status)})" if p_status else '')
        elif p_method in {'NGAN_HANG_QR', 'THE_NGAN_HANG'}:
            pay_label = 'Ngân hàng QR' + (f" ({payments.get(p_status, p_status)})" if p_status else '')
        elif p_method == 'VNPAY':
            pay_label = 'VNPAY' + (f" ({payments.get(p_status, p_status)})" if p_status else '')
        else:
            pay_label = payments.get(p_status, payments.get(p_method, p_status or p_method or 'Chưa rõ'))
        lines.append(f"   Thanh toán: {pay_label}")

        policy = edit_policy(order)
        can_edit = policy['allowed']
        can_cancel = (status in {'MOI_TAO', 'DA_XAC_NHAN'} and p_method in {'VI_DIEN_TU', 'VI_AVENGERS'})
        if status == 'DA_HUY':
            note = 'Đơn đã huỷ'
        elif can_edit and can_cancel:
            note = 'Có thể sửa món hoặc huỷ đơn'
        elif can_edit and not can_cancel:
            note = 'Có thể sửa món'
        elif not can_edit and can_cancel:
            note = f"Không thể sửa ({policy.get('reason') or 'Không khả dụng'}), có thể huỷ đơn qua Ví"
        else:
            note = f"Không thể sửa ({policy.get('reason') or 'Không khả dụng'})"
        lines.append(f"   *Lưu ý: {note}*")
    lines.append('Bạn có thể chọn **đơn số 1, 2, 3...** trong danh sách này hoặc gửi mã đơn để xem chi tiết nhé.')
    return '\n\n'.join(lines)


def order_details_reply(result):
    """Render details of an owned order with items, options, pricing and state."""
    if result.get('status') != 'ok':
        return result.get('message') or 'Mình chưa tra cứu được chi tiết đơn hàng này. Bạn kiểm tra lại mã đơn nhé.'
    statuses = {'MOI_TAO': 'Mới tạo', 'DA_XAC_NHAN': 'Đã xác nhận', 'DANG_CHUAN_BI': 'Đang chuẩn bị',
                'DANG_GIAO': 'Đang giao', 'DA_GIAO': 'Đã giao', 'HOAN_THANH': 'Hoàn thành', 'DA_HUY': 'Đã huỷ'}
    payments = {'THANH_TOAN_KHI_NHAN_HANG': 'Tiền mặt COD',
                'CHO_THANH_TOAN_KHI_NHAN_HANG': 'Tiền mặt COD',
                'TIEN_MAT': 'Tiền mặt COD',
                'CASH': 'Tiền mặt COD',
                'VI_DIEN_TU': 'Ví Avengers', 'VI_AVENGERS': 'Ví Avengers', 'VNPAY': 'VNPAY', 'NGAN_HANG_QR': 'Ngân hàng QR'}
    oid = result.get('order_id')
    status = statuses.get(result.get('order_status'), result.get('order_status') or 'Chưa rõ')
    raw_method = result.get('payment_method')
    order_obj = result.get('order') or {}
    order_type = order_obj.get('loai_don_hang') or result.get('delivery_type')
    is_cod = raw_method in {'THANH_TOAN_KHI_NHAN_HANG', 'TIEN_MAT', 'CASH'} or order_obj.get('trang_thai_thanh_toan') == 'CHO_THANH_TOAN_KHI_NHAN_HANG'
    if is_cod:
        method = 'Tiền mặt COD' if order_type == 'GIAO_TAN_NOI' else 'Thanh toán tại quầy'
    elif raw_method in {'VI_DIEN_TU', 'VI_AVENGERS'}:
        method = 'Ví Avengers'
    elif raw_method in {'NGAN_HANG_QR', 'THE_NGAN_HANG'}:
        method = 'Ngân hàng QR'
    elif raw_method == 'VNPAY':
        method = 'VNPAY'
    else:
        method = payments.get(raw_method, raw_method or 'Chưa rõ')
    lines = [f"Dạ, đây là chi tiết đơn hàng **{oid}**:\n- Trạng thái: **{status}**\n- Thanh toán: **{method}**"]
    items = result.get('items') or []
    if items:
        item_lines = []
        for i, item in enumerate(items, 1):
            name = item.get('product_name') or item.get('ten_san_pham') or 'Món'
            qty = int(item.get('quantity') or item.get('so_luong') or 1)
            price = float(item.get('unit_price') or item.get('gia_ban') or 0)
            opts = [item.get('size') or item.get('kich_co'), item.get('ice') or item.get('luong_da'), item.get('sugar') or item.get('do_ngot')]
            opts = [str(o) for o in opts if o]
            toppings = item.get('toppings') or []
            if toppings:
                opts.append('Topping: ' + (', '.join(toppings) if isinstance(toppings, list) else str(toppings)))
            opt_str = f" ({'; '.join(opts)})" if opts else ""
            item_lines.append(f"{i}. **{name}** ×{qty} — **{money(price * qty)}**{opt_str}")
        lines.append("Danh sách món:\n" + "\n".join(item_lines))
    if result.get('total_price') is not None:
        lines.append(f"**Tổng tiền: {money(result['total_price'])}**")
    if result.get('can_update') and result.get('can_cancel'):
        lines.append("Bạn có thể yêu cầu **sửa món/số lượng** hoặc **huỷ đơn** này nếu cần nhé.")
    elif result.get('can_update'):
        lines.append("Bạn có thể yêu cầu **sửa món/số lượng** của đơn này nếu cần nhé.")
    elif result.get('can_cancel'):
        lines.append("Bạn có thể yêu cầu **huỷ đơn** này nếu cần nhé.")
    else:
        lines.append("Đơn này hiện không hỗ trợ sửa hoặc huỷ qua chat nhé.")
    return "\n\n".join(lines)


def management_kind(message, prefs):
    norm = normalize_text(message)
    kinds = [kind for kind, pattern in (
        ('cancel_order', r'\bhuy(?: bo)? don\b'),
        ('update_order', r'\b(?:sua|doi) don\b'),
        ('reorder_order', r'\b(?:dat lai|mua lai)\b')) if re.search(pattern, norm)]
    if len(kinds) == 1:
        return kinds[0]
    action = prefs.get('order_management_action') or active_edit_focus(message, prefs) or {}
    return action.get('kind') if not kinds else None


def confirmation_allowed(message, action):
    targets = ORDER_ID.findall(message.lower())
    if targets and set(targets) != {action['order_id']}:
        return False
    if '?' in message:
        return False
    norm = normalize_text(ORDER_ID.sub('', message.lower())).strip(' .!,')

    # Reject if user is asking to change/modify or declining
    if re.search(r'\b(?:khong|ko|k|dung|chua|khoan|thoi|chinh lai|sua lai|xem lai|bo qua|nhung|doi thanh|sua thanh)\b', norm):
        return False

    # Reject action verb mismatch
    if action.get('kind') == 'cancel_order' and re.search(r'\b(?:sua|doi|dat lai)\b', norm):
        return False
    if action.get('kind') == 'update_order' and re.search(r'\b(?:huy|dat lai)\b', norm):
        return False
    if action.get('kind') == 'reorder_order' and re.search(r'\b(?:huy|sua)\b', norm):
        return False

    affirmative = r'\b(?:xac nhan|dong y|ok|oke|okay|duoc|chuan|dung roi|chot|tien hanh|sua di|doi di|huy di|dat lai di)\b'
    return bool(re.search(affirmative, norm))


def customer_order_tool(message, prefs, orders=None):
    """Literal order controls still pass the gateway and owned service policy.

    A complete cancellation target and agreement to an immutable preview do not
    need generative inference. Other language/configuration stays with the LLM.
    """
    action = prefs.get('order_management_action')
    selection = literal_order_selection(message)
    reference = order_reference(message, orders)
    if selection and reference and reference['status'] == 'ok':
        return selection, {'order_id': reference['order_id']}
    explicit_selection = literal_order_id_selection(message)
    if explicit_selection:
        return explicit_selection
    if action and confirmation_allowed(message, action):
        return 'confirm_order_change', {}
    norm = normalize_text(message).strip(' .!,')
    if (action or active_edit_focus(message, prefs)) and re.fullmatch(
            r'(?:thoi\s+)?(?:khong|ko|k|bo qua|dung)(?:\s+(?:huy|sua|dat lai|doi|don|don hang|nua|di|nhe|nha|ban|b|oi|a))*', norm):
        return 'discard_order_change', {}
    from src.agents.order_edit_dialogue import accepts
    focus = active_edit_focus(message, prefs)
    if accepts(message, focus):
        return 'update_order', {'order_id': focus['order_id'], 'edit_request': message}
    targets = ORDER_ID.findall(message.lower())
    if len(targets) != 1 or '?' in message or re.search(r'\b(?:sua don|doi don|dat lai|khong huy|dung huy|duoc khong|dc ko)\b', norm):
        return None
    identity = re.escape(normalize_text(targets[0]))
    command = rf'^(?:(?:cho|giup)\s+(?:toi|minh|em)\s+)?(?:(?:toi|minh|em)\s+(?:(?:muon|can)\s+)?)?huy(?: bo)?\s+don(?: hang)?\s+{identity}\b'
    if re.search(command, norm):
        return 'cancel_order', {'order_id': targets[0], 'reason': message}
    return None


def request(session_id, method, path, payload=None, operation_id=None, mutation=False):
    uid = _require_valid_session(session_id)
    if not uid:
        return {'status': 'login_required', 'message': 'Bạn đăng nhập để quản lý đơn hàng nhé.'}
    headers = {'Authorization': 'Bearer ' + _get_service_jwt(uid)}
    if operation_id:
        headers['x-idempotency-key'] = operation_id
    try:
        response = requests.request(method, os.getenv('ORDER_SERVICE_URL', 'http://order-service:3005') + path.format(uid=uid),
            headers=headers, json=payload, timeout=15)
    except requests.RequestException as exc:
        if mutation:
            from src.agents.tool_policy import MutationOutcomeUnknown
            raise MutationOutcomeUnknown('order operation needs reconciliation') from exc
        return {'status': 'unavailable', 'message': 'Mình chưa tra cứu được đơn từ hệ thống. Bạn thử lại nhé.'}
    if response.status_code >= 500 and mutation:
        from src.agents.tool_policy import MutationOutcomeUnknown
        raise MutationOutcomeUnknown('order operation needs reconciliation')
    try:
        body = response.json()
    except ValueError:
        body = {}
    if not response.ok:
        return {'status': 'rejected', 'message': body.get('message') if isinstance(body.get('message'), str) else 'Chưa thể thực hiện với đơn này. Bạn kiểm tra trạng thái và lựa chọn nhé.'}
    return {'status': 'ok', **body}


def details(session_id, order_id):
    try:
        order_id = str(UUID(order_id))
    except (ValueError, TypeError, AttributeError):
        return {'status': 'invalid_order_id', 'message': 'Bạn gửi mã đơn đầy đủ hoặc chọn đơn trong lịch sử nhé.'}
    result = request(session_id, 'GET', '/customers/{uid}/orders/' + order_id)
    if result.get('status') != 'ok':
        return result
    order = result['order']
    policy = result.get('update_policy') or edit_policy(order)
    items = []
    for n, r in enumerate(order.get('chi_tiet') or [], 1):
        item = dict(r)
        item['order_line_id'] = r.get('id')
        item['display_index'] = n
        try:
            item['gia_ban'] = float(r.get('gia_ban', 0))
        except (ValueError, TypeError):
            item['gia_ban'] = 0.0
        try:
            item['so_luong'] = int(r.get('so_luong', 1))
        except (ValueError, TypeError):
            item['so_luong'] = 1
        items.append(item)
    return {**result, 'order_id': order_id, 'order_status': order['trang_thai_don_hang'],
        'payment_method': order['phuong_thuc_thanh_toan'], 'total_price': order['tong_tien'],
        'items': items,
        'can_cancel': order['trang_thai_don_hang'] in {'MOI_TAO', 'DA_XAC_NHAN'} and order.get('phuong_thuc_thanh_toan') in {'VI_DIEN_TU', 'VI_AVENGERS'},
        'can_update': policy['allowed'], 'update_policy': policy}


def edit_policy(order):
    state, method = order.get('trang_thai_don_hang'), order.get('phuong_thuc_thanh_toan')
    paid = order.get('trang_thai_thanh_toan') == 'DA_THANH_TOAN'
    is_cod = method in {'THANH_TOAN_KHI_NHAN_HANG', 'TIEN_MAT', 'CASH'} or order.get('trang_thai_thanh_toan') == 'CHO_THANH_TOAN_KHI_NHAN_HANG'
    is_wallet = method in {'VI_DIEN_TU', 'VI_AVENGERS'}
    reason = None
    if state not in {'MOI_TAO', 'DA_XAC_NHAN'}:
        reason = 'Chỉ sửa được trước khi cửa hàng bắt đầu chuẩn bị món.'
    elif not is_cod and not is_wallet:
        reason = 'Đơn QR/cổng thanh toán không hỗ trợ sửa; bạn có thể huỷ và đặt đơn mới.'
    elif is_wallet and not paid:
        reason = 'Đơn ví chưa hoàn tất thanh toán; bạn kiểm tra thanh toán trước khi sửa nhé.'
    elif is_cod and paid:
        reason = 'Đơn COD đã thu tiền nên không thể sửa số tiền phải trả.'
    return {'allowed': reason is None, 'reason': reason}


def money(value):
    try:
        return f'{float(value):,.0f}'.replace(',', '.') + 'đ'
    except (ValueError, TypeError):
        return f'{value}đ'


def preview_message(kind, order_id, data):
    if kind == 'cancel_order':
        order = data['order']
        refund = (f"\nTiền đã thanh toán **{money(order['tong_tien'])}** sẽ được hoàn vào Ví Avengers theo quy định hiện tại."
                  if order.get('trang_thai_thanh_toan') == 'DA_THANH_TOAN' and order.get('phuong_thuc_thanh_toan') in {'VI_DIEN_TU', 'VNPAY', 'NGAN_HANG_QR', 'MOMO', 'ZALOPAY'} else '')
        return f'Dạ, bạn xác nhận **huỷ đơn {order_id}** nhé?{refund}\n\nTrả lời **xác nhận huỷ** hoặc **không huỷ** ạ.'
    rows = data.get('items') or []
    lines = []
    for i, row in enumerate(rows, 1):
        opts = [row.get('kich_co'), row.get('luong_da'), row.get('do_ngot'), row.get('loai_sua')]
        opts = [v for v in opts if v] + ['Topping: ' + (', '.join(row.get('toppings') or []) or 'Không thêm')]
        lines.append(f"{i}. **{row['ten_san_pham']}** ×{row['so_luong']} — **{money(row['gia_ban'] * row['so_luong'])}**\n   {'; '.join(opts)}")
    if kind == 'reorder_order':
        return f'Dạ, đặt lại các món từ đơn **{order_id}** theo giá Menu hiện tại:\n\n' + '\n'.join(lines) + f"\n\nTạm tính các món đặt lại: **{money(data['subtotal'])}**. Các món sẽ được **thêm vào giỏ đang có**; mình chưa tạo đơn hay thanh toán.\nBạn **xác nhận đặt lại** hay muốn đổi món ạ?"
    settlement = (f"\nTổng cũ: **{money(data['original_total'])}**" if data.get('original_total') is not None else '')
    if data.get('payment_method') == 'VI_DIEN_TU':
        settlement += f"\nVí Avengers sẽ trừ thêm **{money(data.get('wallet_charge', 0))}** khi bạn xác nhận."
        if data.get('wallet_shortfall', 0) > 0:
            settlement += f"\nVí còn thiếu **{money(data['wallet_shortfall'])}**. Bạn nạp thêm tiền rồi yêu cầu xem lại thay đổi trước khi xác nhận nhé."
    else:
        settlement += '\nCOD: bạn thanh toán tổng mới khi nhận hàng.'
    return f'Dạ, bạn xem trước thay đổi đơn **{order_id}**:\n\n' + '\n'.join(lines) + f"\n\nĐịa chỉ: {data.get('delivery_address') or ''}\nKhung giờ: {data.get('delivery_slot') or 'Chưa chọn'}\nGhi chú: {data.get('note') or 'Không có'}\nTạm tính: **{money(data['subtotal'])}**\nGiảm giá ({data.get('voucher_code') or 'Không áp dụng'}): **{money(data['discount_amount'])}**\nPhí giao giữ theo đơn: **{money(data['delivery_fee'])}**\n**Tổng mới: {money(data['final_total'])}**" + settlement + '\n\nBạn **xác nhận sửa đơn** theo thông tin trên nhé?'


def prepare(session_id, kind, args, turn_id):
    # Selecting another order/action abandons the old quote even if the new order is locked.
    prefs = cart_manager.get_checkout_prefs(session_id)
    stale = {field: None for field in ('order_management_action', 'order_management_focus')
             if prefs.get(field) and (prefs[field].get('order_id') != args['order_id']
                                     or prefs[field].get('kind') != kind)}
    if stale:
        cart_manager.set_checkout_context(session_id, **stale)
    current = details(session_id, args['order_id'])
    if current.get('status') != 'ok':
        return current
    if kind == 'cancel_order' and not current['can_cancel']:
        if current['order_status'] in {'MOI_TAO', 'DA_XAC_NHAN'} and current.get('payment_method') != 'VI_DIEN_TU':
            return {'status': 'rejected', 'message': 'Dạ, hệ thống chỉ hỗ trợ huỷ đơn đối với đơn thanh toán qua Ví điện tử (tiền hoàn về ví ngay lập tức). Đơn COD/tiền mặt hoặc cổng thanh toán khác không hỗ trợ huỷ qua chat; bạn vui lòng liên hệ hotline/cửa hàng nếu cần hỗ trợ nhé.'}
        return {'status': 'rejected', 'message': f"Đơn đang ở trạng thái **{current['order_status']}**. Khách chỉ huỷ được khi đơn mới tạo hoặc đã xác nhận, trước khi chuẩn bị/giao ạ."}
    if kind == 'update_order' and not current['can_update']:
        if current['order_status'] == 'DA_HUY':
            return {'status': 'rejected', 'message': 'Dạ, đơn này **đã huỷ** nên mình không thể sửa đơn đó nữa ạ. Nếu muốn mua lại, bạn có thể yêu cầu **đặt lại đơn** để mình kiểm tra món và giá hiện tại nhé.'}
        return {'status': 'rejected', 'message': current['update_policy']['reason'] or 'Đơn này hiện không hỗ trợ sửa.'}
    if kind == 'update_order' and args.get('edit_request'):
        from src.agents.order_edit_dialogue import interpret
        interpreted = interpret(session_id, args['edit_request'], current)
        if interpreted.get('status'):
            return interpreted
        args = {**args, **interpreted}
    if kind == 'update_order' and not (args.get('changes') or args.get('add_items') or any(
            field in args for field in ('delivery_address', 'delivery_slot', 'note'))):
        cart_manager.set_checkout_context(session_id, order_management_action=None, order_management_focus={
            'order_id': current['order_id'], 'kind': kind, 'expires_at': time.time() + 1800})
        return {'status': 'needs_order_changes', 'message': 'Dạ, bạn muốn sửa món/tùy chọn, số lượng, địa chỉ, khung giờ hay ghi chú của đơn này ạ?'}
    payload, data = {}, current
    if kind == 'update_order':
        changes = args.get('changes') or []
        rows = deepcopy(current['order'].get('chi_tiet') or [])
        seen = set()
        field_map = {
            'quantity': 'so_luong', 'product_id': 'ma_san_pham',
            'size': 'kich_co', 'kich_co': 'kich_co',
            'note': 'ghi_chu', 'ghi_chu': 'ghi_chu',
            'ice': 'luong_da', 'luong_da': 'luong_da',
            'sugar': 'do_ngot', 'do_ngot': 'do_ngot',
            'milk': 'loai_sua', 'loai_sua': 'loai_sua',
            'toppings': 'toppings'
        }
        for change in changes:
            raw_id = change.get('order_line_id')
            row = next((r for r in rows if r.get('id') == raw_id or str(r.get('id')) == str(raw_id)), None)
            if not row and current.get('items'):
                matched_item = next((item for item in current['items']
                                     if item.get('display_index') == raw_id or str(item.get('display_index')) == str(raw_id)), None)
                if matched_item:
                    row = next((r for r in rows if r.get('id') == matched_item['id']), None)
            if not row or row['id'] in seen:
                return {'status': 'invalid_order_line', 'message': f'Món sửa (mã/số thứ tự {raw_id}) không thuộc đơn này. Bạn chọn lại theo danh sách món của đơn nhé.'}
            identity = row['id']
            seen.add(identity)
            if 'product_id' in change and str(change['product_id']) != str(row.get('ma_san_pham')):
                kept_quantity = row.get('so_luong', 1)
                row.clear()
                row.update(id=identity, so_luong=kept_quantity)
            for key, value in change.items():
                if key not in {'order_line_id', 'product_name'}:
                    if key == 'options' and isinstance(value, dict):
                        for ok, ov in value.items():
                            row[field_map.get(ok, ok)] = ov
                    else:
                        row[field_map.get(key, key)] = value
        rows = [r for r in rows if r['so_luong'] > 0]
        for added in args.get('add_items') or []:
            rows.append({field_map.get(k, k): v for k, v in added.items()})
        if not rows:
            return {'status': 'empty_order', 'message': 'Đơn cần còn ít nhất một món. Bạn muốn huỷ đơn thì nói huỷ đơn nhé.'}
        payload = {'items': rows, 'expected_revision': current['revision']}
        for field, target in (('delivery_address', 'dia_chi_giao_hang'), ('delivery_slot', 'khung_gio_giao'), ('note', 'ghi_chu')):
            if field in args:
                payload[target] = args[field]
        data = request(session_id, 'PATCH', '/customers/{uid}/orders/' + current['order_id'], {**payload, 'preview_only': True})
    elif kind == 'reorder_order':
        data = request(session_id, 'POST', '/customers/{uid}/orders/' + current['order_id'] + '/reorder-preview')
    else:
        payload = {'reason': args.get('reason') or 'Khách yêu cầu huỷ qua chat', 'expected_revision': current['revision']}
    if data.get('status') != 'ok':
        return data
    if kind == 'update_order' and float(data['final_total']) < float(current['total_price']):
        return {'status': 'rejected', 'message': 'Tổng tiền sau sửa phải bằng hoặc cao hơn tổng tiền đơn cũ ạ.'}
    message = preview_message(kind, current['order_id'], data)
    action = {'kind': kind, 'order_id': current['order_id'], 'payload': payload,
        'preview': data, 'created_turn_id': turn_id, 'expires_at': time.time() + 600,
        'cart_version': cart_manager.get_cart(session_id).get('cart_version')}
    cart_manager.set_checkout_context(session_id, order_management_action=action, order_management_focus=None)
    return {'status': 'require_confirmation', 'changed': False, 'order_id': current['order_id'], 'message': message}


def confirm(session_id, message, turn_id, entry_action):
    action = cart_manager.get_checkout_prefs(session_id).get('order_management_action')
    if not action or not entry_action or action != entry_action or action['created_turn_id'] == turn_id:
        return {'status': 'preview_required', 'message': 'Mình cần gửi lại phần xem trước để bạn xác nhận trên lượt tiếp theo nhé.'}
    if action['expires_at'] <= time.time():
        cart_manager.set_checkout_context(session_id, order_management_action=None)
        return {'status': 'preview_expired', 'message': 'Phần xem trước đã hết hạn. Bạn gửi lại yêu cầu để mình kiểm tra đơn mới nhất nhé.'}
    target = ORDER_ID.search(message.lower())
    if target and target.group() != action['order_id']:
        return {'status': 'confirmation_required', 'message': 'Mã đơn bạn xác nhận khác phần xem trước. Bạn chọn lại đơn nhé.'}
    if not confirmation_allowed(message, action):
        return {'status': 'confirmation_required', 'message': 'Bạn xác nhận đúng thay đổi vừa xem, hay muốn chỉnh lại ạ?'}
    kind, oid, payload = action['kind'], action['order_id'], action['payload']
    if kind == 'cancel_order':
        result = request(session_id, 'PATCH', '/customers/{uid}/orders/' + oid + '/cancel', payload, mutation=True)
    elif kind == 'update_order':
        if action['preview'].get('wallet_shortfall', 0) > 0:
            return {'status': 'insufficient_wallet', 'message': f"Ví còn thiếu **{money(action['preview']['wallet_shortfall'])}**. Bạn nạp thêm rồi yêu cầu xem lại thay đổi trước khi xác nhận nhé."}
        result = request(session_id, 'PATCH', '/customers/{uid}/orders/' + oid,
            {**payload, 'expected_total': action['preview']['final_total']}, mutation=True)
    else:
        preview = action['preview']
        operation_id = 'ai:reorder:' + hashlib.sha256(f'{session_id}|{action["created_turn_id"]}'.encode()).hexdigest()
        result = request(session_id, 'POST', '/cart/{uid}/reorder', {
            'order_id': oid, 'expected_revision': preview['revision'], 'expected_cart_version': action['cart_version'],
            'expected_subtotal': preview['subtotal']}, operation_id, mutation=True)
    if result.get('status') != 'ok':
        return result
    cart_manager.set_checkout_context(session_id, order_management_action=None, order_management_focus=None)
    if kind == 'reorder_order':
        from src.function_calling.tools.cart_tools import sync_authoritative_cart
        cart_manager.set_checkout_context(session_id, checkout_submission=None)
        try:
            cart = sync_authoritative_cart(session_id)
        except Exception:
            cart = {}  # The atomic reorder is known successful; do not retry it after a read failure.
        from src.agents.customer_flow_presentation import cart_review
        review = ('\n\n' + cart_review({'cart': cart})) if cart.get('items') else ''
        return {'status': 'ok', 'changed': True, 'order_id': oid, 'cart': cart,
            'message': 'Dạ, mình đã thêm các món đặt lại vào giỏ, giữ cấu hình và dùng giá hiện tại.' + review + '\n\nBạn muốn sửa/thêm món hay hoàn tất giỏ để chọn ưu đãi, nhận hàng và thanh toán ạ?'}
    order = result.get('order') or {}
    return {'status': 'ok', 'changed': True, 'order_id': oid,
        'message': f'Dạ, mình đã {"huỷ" if kind == "cancel_order" else "cập nhật"} đơn **{oid}** thành công.' +
            (' Tiền được hoàn vào Ví Avengers.' if order.get('trang_thai_thanh_toan') == 'DA_HOAN_TIEN' else '') +
            (f" Tổng mới: **{money(order['tong_tien'])}**." if kind == 'update_order' and 'tong_tien' in order else '') +
            (f" Ví đã trừ thêm **{money(result['wallet_charge'])}**." if kind == 'update_order' and result.get('wallet_charge', 0) > 0 else '')}


def discard(session_id):
    cart_manager.set_checkout_context(session_id, order_management_action=None, order_management_focus=None)
    return {'status': 'ok', 'changed': False, 'message': 'Dạ, mình bỏ yêu cầu vừa xem trước. Đơn hàng chưa bị thay đổi ạ.'}
