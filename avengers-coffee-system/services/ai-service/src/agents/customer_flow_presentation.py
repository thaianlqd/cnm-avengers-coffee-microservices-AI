"""Customer-facing rendering of completed tool steps, without routing user intent."""
from src.agents.checkout_choices import FULFILLMENT_OPTIONS, FULFILLMENT_LABELS
from src.agents.option_state import option_field, option_schema_from_result


def money(value):
    return f"{float(value):,.0f}đ".replace(',', '.')


def cart_review(result):
    cart, quote = result.get('cart') or {}, result.get('quote') or {}
    rows = quote.get('items') or cart.get('items') or []
    lines = ['**Giỏ hàng của bạn:**']
    for index, row in enumerate(rows, 1):
        name = row.get('product_name') or row.get('ten_san_pham') or 'Món đã chọn'
        quantity = row.get('quantity') or row.get('so_luong') or 1
        total = row.get('line_total')
        if not total and row.get('unit_price') is not None:
            total = float(row['unit_price']) * int(quantity)
        lines.append(f"{index}. **{name}** ×{quantity}" + (f" — {money(total)}" if total is not None else ''))
        options = [f"{label}: {row[field]}" for field, label in (
            ('size', 'Size'), ('luong_da', 'Đá'), ('do_ngot', 'Độ ngọt'), ('loai_sua', 'Sữa')) if row.get(field)]
        if 'toppings' in row:
            options.append('Topping: ' + (', '.join(row['toppings']) if row['toppings'] else 'Không thêm'))
        if options:
            lines.append('   ' + '; '.join(options))
    if not rows:
        lines.append('Giỏ hiện chưa có món nào ạ.')
    if result.get('quote_status') not in {None, 'ok', 'empty_cart'}:
        lines.append('\nMình chưa xác minh được tổng tiền mới. Bạn cho mình kiểm tra lại trước khi tiếp tục nhé.')
        return '\n'.join(lines)
    if quote.get('subtotal') is not None:
        lines.append(f"\nTạm tính: **{money(quote['subtotal'])}**")
    if quote.get('voucher_code'):
        lines.append(f"Mã đã áp dụng: **{quote['voucher_code']}**")
        if quote.get('discount_amount') is not None:
            lines.append(f"Giảm giá: **-{money(quote['discount_amount'])}**")
    elif quote:
        lines.append('Mã giảm giá: Chưa áp dụng')
    if quote.get('final_total') is not None:
        # These are cart quotes, before a fulfillment-specific checkout quote.
        lines.append(f"**Tổng sau giảm giá: {money(quote['final_total'])}**")
        lines.append('Phí giao hàng sẽ được kiểm tra sau khi bạn chọn cách nhận và địa chỉ ạ.')
    elif cart.get('total_price') is not None:
        lines.append(f"\n**Tạm tính: {money(cart['total_price'])}**")
    return '\n'.join(lines)


def checkout_choices(state, payment_options=()):
    prefs = state.get('checkout') or {}
    blocks = []
    if not prefs.get('delivery_type'):
        blocks.append('**Hình thức nhận hàng:**\n' + '\n'.join(
            f'- {label}' for label in FULFILLMENT_LABELS))
    if not prefs.get('payment_method') and payment_options:
        lines = ['**Phương thức thanh toán:**']
        for row in payment_options:
            label = row.get('label') or row.get('code') or row.get('value')
            if not label:
                continue
            detail = ''
            if row.get('balance') is not None:
                detail = f" (số dư: {money(row['balance'])})"
            if row.get('enabled') is False:
                detail += ' — ' + (row.get('reason') or 'Hiện chưa khả dụng')
            lines.append('- ' + label + detail)
        blocks.append('\n'.join(lines))
    if not prefs.get('delivery_type'):
        blocks.append('Bạn muốn **giao tận nơi, lấy tại quán hay dùng tại chỗ** ạ?')
    elif prefs.get('profile_location_offer'):
        offer = prefs['profile_location_offer']
        addresses = offer.get('addresses') or []
        if len(addresses) > 1:
            blocks.append('**Các địa chỉ đã lưu trong hồ sơ:**\n' + '\n'.join(
                f"{index}. **{row.get('label') or 'Địa chỉ'}**: {row['full_address']}" +
                (' (mặc định)' if row.get('is_default') else '')
                for index, row in enumerate(addresses, 1)))
            blocks.append('Bạn đang ở **địa chỉ nào trong danh sách**, hay ở địa chỉ khác ạ?' +
                (' Mình sẽ giao đến địa chỉ bạn xác nhận.' if offer.get('purpose') == 'delivery' else
                 ' Mình sẽ tìm chi nhánh gần vị trí bạn chọn.'))
            return '\n\n'.join(blocks)
        blocks.append(f"**Địa chỉ đã lưu trong hồ sơ:**\n{offer['address']}")
        question = ('Bạn đang ở địa chỉ này và muốn mình giao đến đây, hay dùng địa chỉ khác ạ?'
                    if offer.get('purpose') == 'delivery' else
                    'Bạn đang ở địa chỉ này hay khu vực khác để mình tìm chi nhánh gần bạn ạ?')
        blocks.append(question)
    elif prefs['delivery_type'] == 'GIAO_TAN_NOI' and not prefs.get('address_confirmed'):
        blocks.append('Bạn cho mình địa chỉ nhận hàng để kiểm tra giao hàng nhé.')
    elif prefs['delivery_type'] in {'MANG_DI', 'TAI_CHO'} and not (state.get('cart') or {}).get('branch_id'):
        blocks.append('Bạn muốn nhận tại chi nhánh nào, hoặc ở khu vực nào để mình tìm quán gần bạn ạ?')
    elif not prefs.get('payment_method'):
        blocks.append('Bạn muốn chọn phương thức thanh toán nào ạ?')
    return '\n\n'.join(blocks)


def options_prompt(result):
    product = result.get('product') or {}
    name = result.get('product_name') or product.get('product_name') or 'món này'
    groups = option_schema_from_result(result)
    missing = set(result.get('missing') or [])
    lines = [f'Dạ, bạn chọn giúp mình các tùy chọn cho **{name}** nhé:']
    for group in groups:
        field = option_field(group['name'])
        suffix = (' (tùy chọn, có thể chọn nhiều; bỏ qua thì không thêm)' if field == 'toppings' and not group['required']
                  else ' (bắt buộc)' if group['required'] and not group.get('fixed') else ' (mặc định)' if group.get('fixed') else ' (tùy chọn)')
        lines.append(f"- **{group['name']}**{suffix}: " + ', '.join(group['values']))
    if missing and product:
        selected = [str(product[field]) for field in ('size', 'luong_da', 'do_ngot', 'loai_sua') if product.get(field)]
        if product.get('toppings'):
            selected.append('Topping: ' + ', '.join(product['toppings']))
        if selected:
            lines.insert(1, 'Mình đã giữ các lựa chọn: ' + ', '.join(selected) + '.\n')
    lines.append('\nBạn không cần chọn hết các mục ạ. Các mục tùy chọn chưa chọn sẽ dùng mặc định của Menu, không tự thêm topping. Bạn cũng có thể nói **theo mặc định** để dùng công thức của quán.')
    return '\n'.join(lines)



PAYMENT_LABELS = {'THANH_TOAN_KHI_NHAN_HANG': 'Tiền mặt (COD)', 'VNPAY': 'VNPAY',
                  'NGAN_HANG_QR': 'Chuyển khoản QR', 'VI_DIEN_TU': 'Ví Avengers'}


def checkout_summary(summary):
    # Reuse the same canonical line renderer; checkout fees are already quoted.
    blocks = ['Dạ, bạn kiểm tra lại **đơn hàng** giúp mình nhé.',
              cart_review({'cart': {'items': summary.get('items') or []}})]
    info = ['**Thông tin nhận hàng và thanh toán:**']
    labels = dict(zip(FULFILLMENT_OPTIONS, FULFILLMENT_LABELS))
    for label, value in (
        ('Hình thức nhận', labels.get(summary.get('delivery_type'))),
        ('Chi nhánh', summary.get('branch_name') or summary.get('branch_id')),
        ('Địa chỉ giao', summary.get('delivery_address')),
        ('Thanh toán', PAYMENT_LABELS.get(summary.get('payment_method'))),
    ):
        if value:
            info.append(f'- **{label}:** {value}')
    amounts = ['**Chi phí:**']
    subtotal = summary.get('subtotal', summary.get('total_price'))
    if subtotal is not None:
        amounts.append(f'- Tạm tính: **{money(subtotal)}**')
    if summary.get('voucher_code'):
        amounts.append(f"- Mã đã áp dụng: **{summary['voucher_code']}**")
        if summary.get('discount_amount') is not None:
            amounts.append(f"- Giảm giá: **-{money(summary['discount_amount'])}**")
    else:
        amounts.append('- Mã giảm giá: Không sử dụng')
    if summary.get('delivery_type') == 'GIAO_TAN_NOI':
        amounts.append(f"- Phí giao hàng: **{money(summary['delivery_fee'])}**" if summary.get('delivery_fee') is not None
                       else '- Phí giao hàng: Chưa xác minh')
    if summary.get('final_total') is not None:
        amounts.append(f"- **Tổng thanh toán: {money(summary['final_total'])}**")
    blocks.extend(['\n'.join(info), '\n'.join(amounts),
                   'Bạn xác nhận **đặt đơn theo thông tin trên**, hay muốn chỉnh lại phần nào ạ?'])
    return '\n\n'.join(blocks)


def location_choices(result):
    lines = ['Dạ, mình đã nhận vị trí bạn muốn dùng: **' + (result.get('normalized_location') or 'vị trí vừa cung cấp') + '**.']
    if result.get('status') == 'rejected' or any(row.get('accepted') is False for row in result['location_candidates']):
        lines.append('Bản đồ chưa khớp chính xác **số nhà hoặc khu vực**. Bạn chọn một địa điểm dưới đây làm vị trí để **tìm quán gần bạn**, hoặc gửi lại khu vực đang ở nhé.'
                     if result.get('location_purpose') == 'nearby_branches' else
                     'Bản đồ chưa khớp chính xác **số nhà hoặc khu vực**. Các địa chỉ dưới đây là gợi ý khác; mình **chưa xác nhận địa chỉ giao**. Chọn một gợi ý sẽ dùng địa chỉ đó ạ.')
    else:
        lines.append('Bản đồ trả về nhiều địa điểm phù hợp; bạn chọn giúp mình địa điểm chính xác nhé.')
    lines.append('\n'.join(f"{index}. **{row.get('normalized_label') or 'Địa điểm'}**" +
        (f"\n   - {row['display_address']}" if row.get('display_address') else '')
        for index, row in enumerate(result['location_candidates'], 1)))
    lines.append('Bạn chọn **số địa điểm** hoặc gửi lại địa chỉ đúng nhé.')
    return '\n\n'.join(lines)


def branch_choices(result):
    branches = result.get('branches') or []
    if not branches:
        return result.get('message')
    blocked = result.get('status') in {'branch_unavailable_or_unknown', 'stock_conflict'}
    lines = [result.get('message') if blocked else 'Dạ, mình gửi bạn các chi nhánh để lựa chọn nhé:']
    if result.get('location_basis') == 'street_area_estimate':
        lines.append('Mình giữ địa chỉ bạn chọn: **' + result['normalized_location'] + '**. '
                     'Bản đồ chưa xác minh chính xác số nhà; mình tìm quán quanh **' +
                     result['location_estimate'] + '**. Khoảng cách dưới đây là **ước tính theo khu vực** ạ.')
    for index, branch in enumerate(branches, 1):
        label = branch.get('branch_name') or branch.get('ten_chi_nhanh') or 'Chi nhánh'
        row = [f"{branch.get('display_index') or index}. **{label}**"]
        address = branch.get('address') or branch.get('dia_chi')
        if address:
            row.append(f'   - Địa chỉ: {address}')
        for field, label in (('available_products', 'Còn bán'), ('unavailable_products', 'Tạm ngưng'),
                             ('unverified_products', 'Chưa đọc được tình trạng bán')):
            names = branch.get(field) or []
            if names:
                row.append(f"   - **{label}:** " + ', '.join(names))
        if branch.get('availability_status') == 'available' and not branch.get('available_products'):
            row.append('   - **Còn đủ các món trong giỏ.**')
        elif branch.get('availability_status') in {'unknown', 'unverified'} and not branch.get('unverified_products'):
            row.append('   - Chưa đọc được tình trạng bán; chưa thể chọn quán này.')
        lines.append('\n'.join(row))
    if any(branch.get('unverified_products') for branch in branches):
        lines.append('**Chưa đọc được** không có nghĩa là hết món. Mình cần kiểm tra lại dữ liệu trước khi nhận đơn ở quán đó ạ.')
    lines.append('Bạn chọn **số hoặc tên chi nhánh còn đủ món**, hoặc sửa món trong giỏ nhé. Các quán có món tạm ngưng hoặc chưa đọc được tình trạng bán chưa thể nhận đơn này ạ.'
                 if any(b.get('availability_status') for b in branches) else 'Bạn muốn xem thêm chi tiết chi nhánh nào ạ?')
    return '\n\n'.join(line for line in lines if line)

def customer_flow_reply(logs, state, discovery_reply=None):
    """Render only a tool-owned milestone; interruptions with no milestone stay LLM-owned."""
    login_gate = next((row['result'] for row in reversed(logs) if row['result'].get('status') == 'login_required'), None)
    if login_gate:
        return login_gate['message']
    milestones = {'add_to_cart', 'update_cart_item', 'remove_cart_item', 'finish_cart',
                  'apply_voucher', 'skip_voucher', 'remove_voucher', 'get_product_options',
                  'set_checkout_choices', 'request_checkout', 'confirm_checkout', 'resolve_location',
                  'select_location_candidate', 'find_nearest_branch', 'ask_branch', 'set_session_branch'}
    relevant = [row for row in logs if row['tool'] in milestones
                and not (row['tool'] == 'set_checkout_choices' and row['result'].get('changed') is False)]
    if not relevant:
        return None
    row = relevant[-1]
    name, result = row['tool'], row['result']
    if result.get('status') == 'cart_change_not_requested' and any(
            entry['tool'] in {'add_to_cart', 'update_cart_item', 'remove_cart_item'}
            and entry['result'].get('status') in {'ok', 'already_processed'} for entry in relevant[:-1]):
        return customer_flow_reply(logs[:logs.index(row)], state, discovery_reply)
    if result.get('status') == 'voucher_choice_required':
        earlier = [entry for entry in relevant[:-1] if entry['tool'] == 'finish_cart' and entry['result'].get('status') == 'ok']
        if earlier:
            return customer_flow_reply(logs[:logs.index(earlier[-1])+1], state)
        return result['message']
    if result.get('status') in {'defaults_not_authorized', 'profile_location_confirmation_required', 'needs_new_location', 'login_required',
                             'product_choice_required', 'ambiguous_product_options', 'cart_change_not_requested', 'invalid_option', 'wallet_unavailable', 'insufficient_wallet'}:
        return result['message']
    if result.get('status') == 'require_confirmation' and result.get('order_summary'):
        return checkout_summary(result['order_summary'])
    if name == 'confirm_checkout' and result.get('status') in {'ok', 'success', 'already_processed'}:
        lines = [result.get('message') or 'Dạ, đơn hàng của bạn đã được tạo ạ.']
        if result.get('order_id'):
            lines.append(f"- **Mã đơn:** {result['order_id']}")
        if result.get('payment_method') in PAYMENT_LABELS:
            lines.append(f"- **Thanh toán:** {PAYMENT_LABELS[result['payment_method']]}")
        if result.get('total_price') is not None:
            lines.append(f"- **Tổng thanh toán:** {money(result['total_price'])}")
        return '\n\n'.join(lines[:1]) + '\n\n' + '\n'.join(lines[1:])
    if name in {'resolve_location', 'select_location_candidate', 'find_nearest_branch', 'ask_branch', 'set_session_branch'} and result.get('branches'):
        return branch_choices(result)
    if name in {'resolve_location', 'select_location_candidate', 'find_nearest_branch'} and result.get('location_candidates'):
        return location_choices(result)
    if result.get('status') in {'branch_unavailable_or_unknown', 'customer_branch_selection_required'}:
        return result.get('message')
    if name in {'resolve_location', 'select_location_candidate'} and result.get('message'):
        return result['message']
    if name in {'request_checkout', 'confirm_checkout'}:
        return None
    if name in {'add_to_cart', 'get_product_options'} and result.get('status') == 'needs_options':
        return options_prompt(result)
    if result.get('status') not in {'ok', 'already_processed'}:
        return None
    if name == 'get_product_options':
        return options_prompt(result) if result.get('option_groups') or result.get('options') else None
    if name == 'set_session_branch':
        bname = result.get('branch_name') or ''
        cart = (state.get('cart') or {}).get('items') or []
        deliv = (state.get('checkout') or {}).get('delivery_type')
        if not cart:
            if deliv == 'MANG_DI':
                return f"Dạ, mình đã chọn quán **{bname}** cho đơn đến lấy tại quán rồi nhé!\n\nBạn muốn xem menu món nước hay bánh của quán để chọn món ạ?"
            if deliv == 'TAI_CHO':
                return f"Dạ, mình đã chọn quán **{bname}** cho đơn dùng tại chỗ rồi nhé!\n\nBạn muốn xem menu món nước hay bánh của quán để chọn món ạ?"
            return (f"Dạ, mình đã chọn quán **{bname}** cho bạn rồi nhé!\n\n"
                    f"Bạn muốn **đến lấy tại quán (mang đi)** hay **dùng tại chỗ** ạ? "
                    f"Bạn có thể chọn hình thức nhận và xem menu món nước hoặc bánh của quán để chọn món nhé.")
        lead = (f"Dạ, mình đã chọn quán **{bname}** cho đơn đến lấy tại quán của bạn rồi ạ." if deliv == 'MANG_DI'
                else f"Dạ, mình đã chọn quán **{bname}** cho đơn dùng tại chỗ của bạn rồi ạ." if deliv == 'TAI_CHO'
                else f"Dạ, mình đã chọn quán **{bname}** cho đơn hàng của bạn rồi ạ.")
        tail = ("Bạn muốn **đến lấy tại quán (mang đi)** hay **dùng tại chỗ** để mình chuẩn bị đơn nhé?" if not deliv
                else checkout_choices(state, result.get('payment_options') or []) if (state.get('checkout') or {}).get('voucher_decided') and result.get('quote_status') in {None, 'ok'} else None)
        return '\n\n'.join(part for part in (lead, cart_review(state), tail) if part)
    if name == 'set_checkout_choices':
        choices = result.get('choices') or {}
        labels = dict(zip(FULFILLMENT_OPTIONS, FULFILLMENT_LABELS))
        lead = 'Dạ, mình đã ghi nhận lựa chọn của bạn ạ.'
        if choices.get('delivery_type') in labels:
            lead = f"Dạ, mình đã ghi nhận hình thức **{labels[choices['delivery_type']]}** ạ."
        payment_label = {'THANH_TOAN_KHI_NHAN_HANG': 'Tiền mặt (COD)', 'VNPAY': 'VNPAY',
                         'NGAN_HANG_QR': 'Chuyển khoản QR', 'VI_DIEN_TU': 'Ví Avengers'}
        if choices.get('payment_method') in payment_label:
            lead += f"\nThanh toán: **{payment_label[choices['payment_method']]}**."
        if (result.get('profile_location') or {}).get('status') == 'unavailable':
            lead += '\nMình chưa đọc được địa chỉ hồ sơ lúc này; bạn cho mình địa chỉ hoặc khu vực đang ở nhé.'
        tail = checkout_choices(state, result.get('payment_options') or [])
        return lead + '\n\n' + tail if tail else None
    if name in {'add_to_cart', 'update_cart_item', 'remove_cart_item'}:
        lead = {'add_to_cart': 'Dạ, mình đã thêm món vào giỏ của bạn ạ.',
                'update_cart_item': 'Dạ, mình đã cập nhật món theo yêu cầu của bạn ạ.',
                'remove_cart_item': 'Dạ, mình đã xóa món bạn chọn khỏi giỏ ạ.'}[name]
        branch_log = next((entry for entry in logs if entry['tool'] == 'set_session_branch' and entry['result'].get('status') == 'ok'), None)
        if branch_log and name == 'add_to_cart':
            bname = branch_log['result'].get('branch_name') or (state.get('cart') or {}).get('branch_name') or ''
            deliv = (state.get('checkout') or {}).get('delivery_type')
            if deliv == 'MANG_DI':
                lead = f"Dạ, mình đã chọn quán **{bname}** cho đơn đến lấy tại quán và thêm món vào giỏ của bạn rồi ạ."
            elif deliv == 'TAI_CHO':
                lead = f"Dạ, mình đã chọn quán **{bname}** cho đơn dùng tại chỗ và thêm món vào giỏ của bạn rồi ạ."
            else:
                lead = (f"Dạ, mình đã chọn quán **{bname}** và thêm món vào giỏ của bạn rồi nhé!\n\n"
                        f"Bạn muốn **đến lấy tại quán (mang đi)** hay **dùng tại chỗ** để mình chuẩn bị đơn nhé?")
        if result.get('remaining_quantity') is not None:
            lead = f"Dạ, mình đã bớt **{result['removed_quantity']}** sản phẩm ở dòng bạn chọn; còn **{result['remaining_quantity']}** trong giỏ ạ."
        if name == 'add_to_cart' and result.get('changed') is False and result.get('message'):
            lead = result['message']
        if result.get('previous_cart_products'):
            lead += '\n\nGiỏ của bạn đã có các món lưu từ trước: **' + ', '.join(result['previous_cart_products']) + '**.'
        return lead + '\n\n' + cart_review(result) + ('\n\n' + discovery_reply if discovery_reply else
            '\n\nBạn muốn **thêm món, sửa tùy chọn/số lượng, xóa món**, hay **hoàn tất giỏ hàng** ạ?')
    if name == 'finish_cart' and result.get('vouchers'):
        lines = ['Dạ, mình gửi lại giỏ hàng để bạn kiểm tra nhé.', cart_review(result), '**Các mã giảm giá phù hợp:**']
        for index, voucher in enumerate(result['vouchers'], 1):
            code = voucher.get('ma_voucher') or voucher.get('voucher_code')
            label = voucher.get('ten_voucher') or voucher.get('ten_chuong_trinh') or code
            saving = voucher.get('so_tien_giam_du_kien')
            lines.append(f"{index}. **{label}** — Mã: **{code}**" + (f" — giảm dự kiến **{money(saving)}**" if saving is not None else ''))
        lines.append('Bạn chọn mã theo **số hoặc mã**, nói **chọn mã tốt nhất**, hoặc **bỏ qua mã** nhé. Bạn vẫn có thể thêm, sửa hay xóa món ạ.')
        return '\n\n'.join(lines)
    lead = {'apply_voucher': 'Dạ, mình đã kiểm tra mã giảm giá cho giỏ của bạn ạ.',
            'skip_voucher': 'Dạ, mình đã ghi nhận bạn không dùng mã giảm giá ạ.',
            'remove_voucher': 'Dạ, mình đã bỏ mã giảm giá theo yêu cầu của bạn ạ.',
            'finish_cart': ('Dạ, mình gửi lại giỏ hàng với lựa chọn mã giảm giá hiện tại ạ.'
                            if (result.get('quote') or {}).get('voucher_code') else
                            'Dạ, hiện chưa có mã giảm giá phù hợp với giỏ này ạ.')}.get(name)
    if lead:
        quote = result.get('quote') or {}
        if name == 'apply_voucher' and quote.get('voucher_code'):
            lead = f"Dạ, mình đã áp dụng mã **{quote['voucher_code']}** cho giỏ của bạn rồi ạ."
        tail = checkout_choices(state, result.get('payment_options') or []) if (state.get('checkout') or {}).get('voucher_decided') and result.get('quote_status') in {None, 'ok'} else 'Bạn cho mình kiểm tra lại mã và tổng tiền trước khi tiếp tục nhé.'
        return '\n\n'.join(part for part in (lead, cart_review(result), tail) if part)
    return None
