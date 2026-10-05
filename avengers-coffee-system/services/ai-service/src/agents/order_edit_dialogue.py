"""Literal, owned-order edit dialogue. No inference or writes before confirmation."""
from copy import deepcopy
import re
import time
from src.common import cart_manager
from src.rag.documents import normalize_text

PREFIX = r'(?:(?:vay|the)\s+)?(?:(?:cho|giup)\s+(?:toi|minh|em)\s+)?(?:(?:toi|minh|em)\s+(?:(?:muon|can)\s+)?)?'
SUFFIX = r'(?:\s+(?:di|nhe|nha|a|ban|b|oi|giup|toi|minh|voi))*'


def _parse_options_from_text(norm, options_dict):
    options = {}
    sizes = options_dict.get('Kích thước') or []
    size_m = re.search(r'\b(?:size\s+)?(lon|vua|nho)\b', norm)
    if size_m:
        val = {'lon': 'Lớn', 'vua': 'Vừa', 'nho': 'Nhỏ'}[size_m.group(1)]
        if val in sizes:
            options['size'] = val
    if 'size' not in options and sizes:
        options['size'] = 'Vừa' if 'Vừa' in sizes else ('Nhỏ' if 'Nhỏ' in sizes else sizes[0])

    ice_m = re.search(r'\b(da rieng|it da|khong da|them da|binh thuong)\b', norm)
    if ice_m:
        ice_map = {'it da': 'Ít đá', 'da rieng': 'Đá riêng', 'khong da': 'Không đá', 'them da': 'Thêm đá', 'binh thuong': 'Bình thường'}
        options['luong_da'] = ice_map[ice_m.group(1)]

    sugar_m = re.search(r'\b(it ngot|them ngot|khong ngot)\b', norm)
    if sugar_m:
        sugar_map = {'it ngot': 'Ít ngọt', 'them ngot': 'Thêm ngọt', 'khong ngot': 'Không ngọt'}
        options['do_ngot'] = sugar_map[sugar_m.group(1)]

    return options


def accepts(message, focus):
    if not focus or focus.get('kind') != 'update_order' or '?' in message:
        return False
    norm = normalize_text(message)
    if re.search(r'\b(?:khong (?!da\b|ngot\b)|ko|chua|dung|neu|gio hang|don|xac nhan|va|roi|ghi chu|dia chi|khung gio|thanh toan)\b', norm):
        return False
    if focus.get('edit_stage') == 'replacement_options':
        return True
    if re.fullmatch(PREFIX + r'(?:doi|sua)(?:\s+(?:mon|so luong|tuy chon|topping))?' + SUFFIX, norm):
        return True
    if re.fullmatch(PREFIX + r'(?:(?:doi|sua|chon|bo|xoa)\s+)?mon\s+(?:so\s+)?\d+(?:\s+(?:thanh|sang|qua|de doi qua|de doi sang|de doi thanh)\s+.+)?' + SUFFIX, norm):
        return True
    if re.search(r'\b(?:da rieng|it da|khong da|them da|it ngot|them ngot|khong ngot)\b', norm):
        return True
    # A literal title is a response to the selected line, never an add-to-cart.
    return (focus.get('edit_stage') in {'replacement_name', 'replacement_choice'}
            and not re.search(r'\b(?:huy|xoa|bo|mua|dat|xem|them|gia)\b', norm)
            and not re.match(r'^(?:do ngot|luong da|loai sua)\b', norm))


def _focus(session_id, current, **extra):
    value = {'kind': 'update_order', 'order_id': current['order_id'],
             'expires_at': time.time() + 1800, 'edit_revision': current['revision'],
             'edit_lines': [{'id': row['id'], 'product_id': row['ma_san_pham'],
                             'name': row['ten_san_pham']} for row in current['items']], **extra}
    cart_manager.set_checkout_context(session_id, order_management_action=None, order_management_focus=value)
    return value


def _list(session_id, current, lead='Dạ, đây là các món trong đơn bạn đang sửa:'):
    _focus(session_id, current, edit_stage='select_line')
    from src.agents.order_management import money
    items = current.get('items') or []
    rows = []
    for n, r in enumerate(items, 1):
        name = r.get('ten_san_pham') or r.get('product_name') or 'Món'
        try:
            qty = int(r.get('so_luong', 1))
        except (ValueError, TypeError):
            qty = 1
        try:
            price = float(r.get('gia_ban', 0))
        except (ValueError, TypeError):
            price = 0.0
        rows.append(f"{n}. **{name}** ×{qty} — **{money(price * qty)}**")
    return {'status': 'needs_order_changes', 'message': lead + '\n\n' + '\n'.join(rows) +
        '\n\nBạn muốn đổi món số mấy sang món nào, hoặc đổi số lượng? Ví dụ **đổi món số 1 thành Mochi Kem Matcha** hoặc **món số 1 thành 3 cái**. Mình sẽ gửi tổng mới để bạn xác nhận; tổng sau sửa phải bằng hoặc cao hơn tổng cũ ạ.'}


def interpret(session_id, message, current):
    """Return a clarification result or exact server line patch for prepare()."""
    from src.agents.order_management import money
    focus = cart_manager.get_checkout_prefs(session_id).get('order_management_focus') or {}
    if focus.get('order_id') != current['order_id']:
        return _list(session_id, current)
    if focus.get('edit_revision') and focus['edit_revision'] != current['revision']:
        return _list(session_id, current, 'Đơn đã thay đổi từ lần xem trước. Bạn chọn lại theo danh sách mới nhé:')
    norm = normalize_text(message)

    if focus.get('edit_stage') == 'replacement_options':
        line_id = focus.get('edit_line_id')
        product_id = focus.get('selected_product_id')
        from src.function_calling.tools.product_tools import execute_get_product_options
        opts_res = execute_get_product_options(product_id=str(product_id))
        options_dict = opts_res.get('options') or {}
        chosen_opts = _parse_options_from_text(norm, options_dict)
        return {'changes': [{'order_line_id': line_id, 'product_id': str(product_id), **chosen_opts}]}

    if re.fullmatch(PREFIX + r'(?:doi|sua)(?:\s+(?:mon|so luong|tuy chon|topping))?' + SUFFIX, norm):
        return _list(session_id, current)

    # Direct option adjustment (e.g. "tôi muốn đá riêng ấy bạn", "đổi ít đá", "ít ngọt"...)
    opt_ice = re.search(r'\b(da rieng|it da|khong da|them da)\b', norm)
    opt_sugar = re.search(r'\b(it ngot|them ngot|khong ngot)\b', norm)
    if (opt_ice or opt_sugar) and focus.get('edit_stage') != 'replacement_choice':
        target_line = focus.get('edit_line_id')
        if not target_line and current.get('items'):
            drink = next((item for item in current['items'] if item.get('luong_da') or item.get('do_ngot')), None)
            if drink:
                target_line = drink['id']
        if target_line:
            change = {'order_line_id': target_line}
            if opt_ice:
                ice_map = {'it da': 'Ít đá', 'da rieng': 'Đá riêng', 'khong da': 'Không đá', 'them da': 'Thêm đá'}
                change['luong_da'] = ice_map[opt_ice.group(1)]
            if opt_sugar:
                sugar_map = {'it ngot': 'Ít ngọt', 'them ngot': 'Thêm ngọt', 'khong ngot': 'Không ngọt'}
                change['do_ngot'] = sugar_map[opt_sugar.group(1)]
            return {'changes': [change]}

    selection = re.fullmatch(PREFIX + r'(?:(?:doi|sua|chon|bo|xoa)\s+)?mon\s+(?:so\s+)?(\d+)(?:\s+(?:thanh|sang|qua|de doi qua|de doi sang|de doi thanh)\s+(.+?))?' + SUFFIX, norm)
    title = None
    if selection:
        index, title = int(selection[1]), selection[2]
        if not focus.get('edit_lines'):
            return _list(session_id, current, 'Bạn chọn món theo danh sách của chính đơn này nhé:')
        choices = focus.get('replacement_candidates') if focus.get('edit_stage') == 'replacement_choice' else None
        if choices is not None:
            if title or not 1 <= index <= len(choices):
                return {'status': 'needs_order_changes', 'message': 'Bạn chọn một số trong danh sách món thay thế vừa xem nhé.'}
            line_id = focus['edit_line_id']
            prod = choices[index - 1]
            from src.function_calling.tools.product_tools import execute_get_product_options
            opts_res = execute_get_product_options(product_id=str(prod['product_id']))
            options_dict = opts_res.get('options') or {}
            option_groups = opts_res.get('option_groups') or []
            has_custom_options = bool(options_dict.get('Kích thước') or options_dict.get('Lượng đá') or options_dict.get('Độ ngọt'))
            if has_custom_options:
                _focus(session_id, current, edit_stage='replacement_options', edit_line_id=line_id,
                       selected_product_id=str(prod['product_id']), selected_product_name=prod['product_name'])
                lines = [f"Dạ, bạn chọn giúp mình các tùy chọn cho **{prod['product_name']}** nhé:"]
                for g in option_groups:
                    g_name = g['name']
                    vals = g['values']
                    if g_name == 'Kích thước':
                        lines.append(f"- **Kích thước**: " + ", ".join(vals) + " (mặc định: Vừa)")
                    else:
                        lines.append(f"- **{g_name}** (tùy chọn): " + ", ".join(vals))
                lines.append("\nBạn có thể chọn kích thước, lượng đá, độ ngọt mong muốn, hoặc nói **mặc định** để dùng size Vừa theo công thức quán nhé.")
                return {'status': 'needs_order_changes', 'message': '\n'.join(lines)}
            chosen_opts = _parse_options_from_text(norm, options_dict)
            return {'changes': [{'order_line_id': line_id, 'product_id': str(prod['product_id']), **chosen_opts}]}
        if not 1 <= index <= len(focus['edit_lines']):
            return {'status': 'needs_order_changes', 'message': 'Số món này không có trong đơn. Bạn chọn lại theo danh sách món của đơn nhé.'}
        line_id = focus['edit_lines'][index - 1]['id']
        if not any(r['id'] == line_id for r in current['items']):
            return _list(session_id, current)
        quantity = re.fullmatch(r'(\d+)\s+(?:cai|ly|phan)', title or '')
        if quantity:
            value = int(quantity[1])
            if not 1 <= value <= 999:
                return {'status': 'needs_order_changes', 'message': 'Bạn chọn số lượng từ 1 đến 999 nhé.'}
            return {'changes': [{'order_line_id': line_id, 'quantity': value}]}

        # Option change for this specific line (e.g. đổi món 2 thành đá riêng)
        ice_m = re.search(r'\b(da rieng|it da|khong da|them da)\b', title or '')
        sugar_m = re.search(r'\b(it ngot|them ngot|khong ngot)\b', title or '')
        if ice_m or sugar_m:
            change = {'order_line_id': line_id}
            if ice_m:
                ice_map = {'it da': 'Ít đá', 'da rieng': 'Đá riêng', 'khong da': 'Không đá', 'them da': 'Thêm đá'}
                change['luong_da'] = ice_map[ice_m.group(1)]
            if sugar_m:
                sugar_map = {'it ngot': 'Ít ngọt', 'them ngot': 'Thêm ngọt', 'khong ngot': 'Không ngọt'}
                change['do_ngot'] = sugar_map[sugar_m.group(1)]
            return {'changes': [change]}

        # If user explicitly asked to remove/delete without naming a replacement
        if re.search(r'\b(?:bo|xoa)\b', norm) and (not title or title in {'mon khac', 'khac'}):
            _focus(session_id, current, edit_stage='replacement_name', edit_line_id=line_id)
            old_total = money(current.get('total_price', 0))
            return {'status': 'needs_order_changes', 'message': f"Dạ, theo quy định hệ thống, tổng tiền sau khi sửa đơn phải bằng hoặc cao hơn tổng đơn cũ ({old_total}). Do đó bạn có thể đổi **{focus['edit_lines'][index - 1]['name']}** sang món khác trên Menu nhé. Bạn muốn đổi sang món nào ạ?"}

        if not title or title in {'mon khac', 'khac', 'sang mon khac', 'qua mon khac'}:
            _focus(session_id, current, edit_stage='replacement_name', edit_line_id=line_id)
            return {'status': 'needs_order_changes', 'message': f"Dạ, bạn muốn đổi **{focus['edit_lines'][index - 1]['name']}** sang món nào? Bạn gửi tên món trên Menu nhé. Mình sẽ kiểm tra giá và gửi bạn xem trước khi sửa ạ."}
    else:
        line_id = focus.get('edit_line_id')
        if focus.get('edit_stage') != 'replacement_name' or not any(r['id'] == line_id for r in current['items']):
            return _list(session_id, current)
        response = re.fullmatch(PREFIX + r'(?:(?:doi|thay)\s+)?(?:(?:sang|thanh|qua|de doi qua|de doi sang)\s+)?(.+?)' + SUFFIX, norm)
        title = response[1] if response else norm

    # Lookup current Menu only.
    from src.function_calling.tools.product_tools import execute_filter_catalog
    result = execute_filter_catalog(search_text=title, limit=50)
    if result.get('status') not in {'ok', 'not_found'}:
        return {'status': 'unavailable', 'message': 'Mình chưa tra cứu được Menu để đổi món. Bạn thử lại tên món này nhé.'}
    products = result.get('products') or []
    exact = [p for p in products if normalize_text(p.get('product_name') or '') == title]
    if len(exact) == 1:
        prod = exact[0]
        from src.function_calling.tools.product_tools import execute_get_product_options
        opts_res = execute_get_product_options(product_id=str(prod['product_id']))
        options_dict = opts_res.get('options') or {}
        option_groups = opts_res.get('option_groups') or []
        has_custom_options = bool(options_dict.get('Kích thước') or options_dict.get('Lượng đá') or options_dict.get('Độ ngọt'))

        has_specified_options = bool(
            re.search(r'\b(?:size\s+)?(lon|vua|nho)\b', norm) or
            re.search(r'\b(da rieng|it da|khong da|them da|it ngot|them ngot|khong ngot)\b', norm) or
            re.search(r'\b(?:mac dinh|theo mac dinh)\b', norm)
        )

        if has_custom_options and not has_specified_options:
            _focus(session_id, current, edit_stage='replacement_options', edit_line_id=line_id,
                   selected_product_id=str(prod['product_id']), selected_product_name=prod['product_name'])
            lines = [f"Dạ, bạn chọn giúp mình các tùy chọn cho **{prod['product_name']}** nhé:"]
            for g in option_groups:
                g_name = g['name']
                vals = g['values']
                if g_name == 'Kích thước':
                    lines.append(f"- **Kích thước**: " + ", ".join(vals) + " (mặc định: Vừa)")
                else:
                    lines.append(f"- **{g_name}** (tùy chọn): " + ", ".join(vals))
            lines.append("\nBạn có thể chọn kích thước, lượng đá, độ ngọt mong muốn, hoặc nói **mặc định** để dùng size Vừa theo công thức quán nhé.")
            return {'status': 'needs_order_changes', 'message': '\n'.join(lines)}

        chosen_opts = _parse_options_from_text(norm, options_dict)
        return {'changes': [{'order_line_id': line_id, 'product_id': str(prod['product_id']), **chosen_opts}]}

    candidates = products[:5]
    if not candidates:
        _focus(session_id, current, edit_stage='replacement_name', edit_line_id=line_id)
        return {'status': 'needs_order_changes', 'message': 'Hiện mình chưa tìm thấy món này trong Menu. Bạn gửi tên món khác nhé; đơn chưa thay đổi ạ.'}
    _focus(session_id, current, edit_stage='replacement_choice', edit_line_id=line_id,
           replacement_candidates=deepcopy(candidates))
    from src.agents.order_management import money
    rows = [f"{n}. **{p['product_name']}** — **{money(p['base_price'])}**" for n, p in enumerate(candidates, 1)]
    return {'status': 'needs_order_changes', 'message': 'Mình tìm thấy các món sau trong Menu:\n\n' + '\n'.join(rows) + '\n\nBạn chọn **món số mấy** để thay thế nhé? Giá cuối cùng sẽ được kiểm tra trong phần xem trước ạ.'}
