"""Independent customer evidence for voucher choices, never inferred from cart completion."""
import re
from src.rag.documents import normalize_text
from src.agents.selection_language import parse_selection_reference


def voucher_choice(message, offered):
    text = normalize_text(message)
    if '?' in message or re.search(r'\b(?:ma nao|ma gi|co ma|co voucher|tai sao|bao nhieu)\b', text) or re.search(r'\b(?:co|duoc)\b.*\b(?:khong|ko)\s*$', text):
        return None
    if re.search(r'\b(?:khong|ko|chua|dung)\s+(?:chon|dung|ap|ap dung)\b', text):
        return None
    if re.search(r'\b(?:tot nhat|giam nhieu nhat|loi nhat)\b', text):
        return 'BEST'
    ref = parse_selection_reference(message, active_namespace='VOUCHER')
    if ref.requested and ref.namespace in {None, 'VOUCHER'} and len(ref.ordinals) == 1:
        index = ref.ordinals[0] - 1
        if 0 <= index < len(offered):
            row = offered[index]
            return str(row.get('ma_voucher') or row.get('voucher_code') or '').upper() or None
    for row in offered:
        code = str(row.get('ma_voucher') or row.get('voucher_code') or '')
        if code and re.search(r'(?<!\w)' + re.escape(normalize_text(code)) + r'(?!\w)', text):
            return code.upper()
        name = normalize_text(row.get('ten_voucher') or row.get('ten_chuong_trinh') or '')
        if name and name in text and re.search(r'\b(?:chon|dung|ap|lay)\b', text):
            return code.upper() or None
    return None


def skips_voucher(message, pending_type=None):
    text = normalize_text(message).strip(' .!,')
    if '?' in message:
        return False
    return bool(re.search(r'\b(?:bo qua|khong (?:can|dung|ap|ap dung))\s+(?:ma|voucher|khuyen mai)\b', text)
        or (pending_type == 'select_voucher' and re.fullmatch(
            r'(?:thoi\s+)?(?:bo qua|khong|ko|khong can)(?:\s+(?:di|ban|nhe|nha|a|thoi|b|oi))*', text)))


def profile_location_decision(message):
    from src.agents.location_parser import parse_location
    from src.agents.tier1 import classify_confirmation
    if '?' in message:
        return 'NONE'
    text = normalize_text(message)
    if re.search(r'\b(?:co phai|la gi|dia chi nao)\b', text):
        return 'NONE'
    if parse_location(message).kind == 'change_reference' or (
            re.search(r'\b(?:khong|ko|chua)\b', text)
            and re.search(r'\b(?:dia chi|o day|o do|o ay|o cho|toi o|minh o)\b', text)):
        return 'NO'
    if parse_location(message).kind == 'reference':
        return 'YES'
    # Greeting particles must not turn "oke bạn" into an unrelated intent.
    text = re.sub(r'\b(?:ban|b)\b', '', text)
    if re.fullmatch(r'\s*dung(?:\s+(?:roi|nhe|a|oi))*\s*', text):
        return 'YES'
    return classify_confirmation(text, 'confirm_address')
