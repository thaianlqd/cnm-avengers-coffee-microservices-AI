import re
import time
from typing import Optional, Dict, Any
from typing import Literal

_DIACRITICS = {
    'a': 'áàảãạăắằẳẵặâấầẩẫậ',
    'd': 'đ',
    'e': 'éèẻẽẹêếềểễệ',
    'i': 'íìỉĩị',
    'o': 'óòỏõọôốồổỗộơớờởỡợ',
    'u': 'úùủũụưứừửữự',
    'y': 'ýỳỷỹỵ'
}

def _remove_diacritics(text: str) -> str:
    res = text.lower()
    for char, variants in _DIACRITICS.items():
        for variant in variants:
            res = res.replace(variant, char)
    return res

def normalize_confirmation_text(text: str) -> str:
    text = str(text or "")
    # 1. Bỏ dấu tiếng Việt, lowercase
    text = _remove_diacritics(text)
    
    # 2. Gộp chữ lặp: okee -> oke
    text = re.sub(r'([a-z])\1+', r'\1', text)
    
    # 3. Xoá dấu câu thừa
    text = re.sub(r'[^\w\s]', ' ', text)
    
    # 4. Strip multi-space
    text = re.sub(r'\s+', ' ', text).strip()
    
    # 5. Gộp cụm thành 1 từ
    text = re.sub(r'\bdong y\b', 'dongy', text)
    text = re.sub(r'\bxac nhan\b', 'xacnhan', text)
    text = re.sub(r'\btiep tuc\b', 'tieptuc', text)
    text = re.sub(r'\bchot don\b', 'chotdon', text)
    text = re.sub(r'\bdat hang\b', 'dathang', text)
    text = re.sub(r'\bhet roi\b', 'hetroi', text)
    text = re.sub(r'\bxong roi\b', 'xongroi', text)
    
    return text

BASE_YES = {"ok", "oke", "dongy", "xacnhan", "chot", "yes", "tieptuc"}
BASE_NO = {"khong", "thoi", "no", "khoan", "ko", "hong", "hem"}
BASE_FILLER = {"nha", "nhe", "di", "luon", "a", "voi", "ne", "oi", "roi"}

def classify_confirmation(text: str, pending_type: Optional[str]) -> Literal["YES", "NO", "AMBIGUOUS", "NONE"]:
    norm_text = normalize_confirmation_text(text)
    if not norm_text:
        return "NONE"
        
    tokens = norm_text.split()
    
    yes_set = set(BASE_YES)
    no_set = set(BASE_NO)
    
    if pending_type == "confirm_checkout":
        yes_set.update({"chotdon", "dathang"})
        no_set.add("huy")
    elif pending_type == "ask_more_items":
        no_set.update({"hetroi", "xongroi"})
        
    # Check "huy" or "dung" alone (+fillers)
    only_huy = len(tokens) > 0 and all(t == "huy" or t in BASE_FILLER for t in tokens) and "huy" in tokens
    only_dung = len(tokens) > 0 and all(t == "dung" or t in BASE_FILLER for t in tokens) and "dung" in tokens
    
    if only_huy:
        if not pending_type:
            return "NONE"
        if pending_type != "confirm_checkout":
            return "AMBIGUOUS"
    if only_dung:
        if not pending_type:
            return "NONE"
        return "AMBIGUOUS"
        
    has_yes = False
    has_no = False
    has_foreign = False
    
    for token in tokens:
        if token in yes_set:
            has_yes = True
        elif token in no_set:
            has_no = True
        elif token in BASE_FILLER:
            continue
        else:
            has_foreign = True
            
    if has_foreign:
        return "NONE"
        
    if has_yes and has_no:
        return "NONE"
        
    if has_yes:
        if pending_type in {"select_voucher", "select_branch", "fill_options"}:
            return "NONE"
        if not pending_type:
            return "NONE"
        return "YES"
        
    if has_no:
        if not pending_type:
            return "NONE"
        return "NO"
        
    return "NONE"

def is_pending_expired(expires_at: float, now: Optional[float] = None) -> bool:
    if now is None:
        now = time.time()
    return now >= expires_at


def classify_order_intent(text: str, pending_type: Optional[str] = None) -> Dict[str, Any]:
    """Cheap Vietnamese intent router used before an LLM sees a turn.

    This deliberately favours cart language over order-history language.  A
    customer saying "sửa số lượng trong giỏ" must never be routed to an old
    order merely because an order id is still visible in their chat history.
    """
    raw = str(text or "")
    norm = normalize_confirmation_text(raw)
    # "đánh giá" contains the word "giá" after normalization; it is a
    # product-review request, never a request to inspect the cart.
    if re.search(r"\b(danh gia|review|nhan xet)\b", norm):
        return {"intent": "BROWSING"}
    cart_words = bool(re.search(r"\b(gio|giohang|mon|topping|toping|size|so luong|sl|da|ngot)\b", norm))
    order_words = bool(re.search(r"\b(don hang|madon|ma don|don da dat|lich su)\b", norm))
    quantity = re.search(r"(?:so luong|sl|ve|con)\s*(?:la|lai)?\s*(\d+)", norm)
    add_quantity = (
        re.search(r"(?:so luong|sl)\s*(?:la)?\s*(\d+)", norm)
        or re.search(r"\b(\d+)\s*(?:cai|ly|phan|mon)\b", norm)
        or re.search(r"\bthem\s+(\d+)\b", norm)
    )
    ordinal_selection = bool(re.search(
        r"\b(?:nuoc|do uong|banh|do an|mon|san pham|sp)\s*(?:so|thu|#)\s*\d+\b",
        norm,
    ))
    selection_request = bool(re.search(r"\b(?:cho toi|chon|lay|them|mua|dat)\b", norm))
    browsing_more = bool(re.search(
        r"\b(xem|goi y|hien thi|tim|cho biet)\b.*\b(them|cac mon|mon nao)\b",
        norm,
    ))
    # "Tôi muốn mua bánh và nước" is a request to browse two menu families,
    # not an attempt to add an unnamed product.  Keep it on the deterministic
    # catalog path so the next turn can safely use category ordinals.
    if (
        not ordinal_selection
        and re.search(r"\b(?:mua|dat)\b", norm)
        and re.search(r"\b(?:banh|do an)\b", norm)
        and re.search(r"\b(?:nuoc|do uong|thuc uong)\b", norm)
    ):
        return {"intent": "BROWSING"}
    # A numbered item always belongs to the latest recommendation snapshot.
    # Do not require the generic word "món" here: customers naturally say
    # "cho tôi nước số 1 và bánh số 2". Requiring that word sent this common
    # form back to the LLM instead of the durable menu resolver.
    if ordinal_selection and selection_request and not re.search(
        r"\b(?:xoa|bo|huy|khong lay|khong them)\b", norm
    ):
        return {
            "intent": "ADD_ITEM",
            "quantity": int(add_quantity.group(1)) if add_quantity else 1,
        }
    # Addition must win over quantity editing.  In Vietnamese, customers often
    # say “thêm món này, số lượng 2”; treating that as SET_QUANTITY mutates the
    # previously focused cart row instead of adding the referenced product.
    if (
        re.search(r"\b(them|mua|lay)\b", norm)
        and not browsing_more
        and not re.search(r"\b(khong lay|khong them|khong can them|bo|xoa|huy)\b", norm)
        and not order_words
    ):
        return {
            "intent": "ADD_ITEM",
            "quantity": int(add_quantity.group(1)) if add_quantity else 1,
        }
    if quantity and (cart_words or not order_words):
        return {"intent": "SET_QUANTITY", "quantity": int(quantity.group(1))}
    # Natural absolute corrections often omit the words "số lượng":
    # "cho tôi bánh cà phê 1 cái thôi".  The graph resolves the named cart
    # row by canonical id before executing this intent.
    if add_quantity and re.search(r"\b(?:thoi|con lai|ve|trong gio|sua|doi|chinh)\b", norm):
        return {"intent": "SET_QUANTITY", "quantity": int(add_quantity.group(1))}
    # "toàn bộ giỏ" in a read-only summary request must never be treated as
    # the verb "bỏ".  Require an explicit cart/item removal construction.
    if re.search(r"\b(?:xoa|huy)\b.*\b(gio|mon|san pham)\b|\bbo\b.*\b(?:mon|san pham|cai|gio hang)\b", norm):
        return {"intent": "CLEAR_CART" if re.search(r"\b(tat ca|ca gio|gio hang)\b", norm) else "REMOVE_ITEM"}
    # Natural change-of-mind phrases still need an explicit product/object
    # reference. This avoids treating filler such as "thôi để lát chọn sau"
    # as a destructive cart action.
    if (
        re.search(r"\b(?:khong lay|bo)\b.*\b(?:sp|san pham|mon|cai|banh|nuoc)\b.*\b(?:nua|di)\b", norm)
        or re.search(r"\bthoi\b.*\b(?:mon|sp|san pham|cai|banh|nuoc)\b.*\b(?:nay|do|kia)\b", norm)
    ):
        return {"intent": "REMOVE_ITEM"}
    if re.search(r"\b(xoa het|lam rong|clear)\b", norm):
        return {"intent": "CLEAR_CART"}
    if re.search(r"\b(xem|kiem tra|check|tom tat|xacnhan(?:\s+lai)?|xac nhan lai)\b.*\b(gio|gia)\b|\bkhong thay\b.*\btrong gio\b", norm):
        return {"intent": "VIEW_CART"}
    # Concrete fulfillment/payment selections must win over the generic word
    # "thanh toán" below.  Otherwise "giao tận nơi và thanh toán COD" is
    # mistaken for FINISH_CART and the checkout menu is shown again.
    if re.search(r"\b(giao tan noi|mang di|lay tai quan|dung tai cho|uong tai quan)\b", norm):
        return {"intent": "SELECT_FULFILLMENT"}
    if re.search(r"\b(vnpay|cod|tien mat|ngan hang qr|chuyen khoan|vi avengers)\b", norm):
        return {"intent": "SELECT_PAYMENT"}
    if re.search(
        r"\b(khong them|het roi|xong gio|hoan tat gio|tien hanh|thanh toan|chot gio|dat hang)\b"
        r"|\b(nhu hien tai|gio hien tai)\b.*\b(duoc|ok|oke)\b",
        norm,
    ):
        return {"intent": "FINISH_CART"}
    if re.search(r"\b(thay|doi)\b.*\b(size|topping|toping|da|ngot|sua|mon)\b", norm):
        return {"intent": "EDIT_OPTIONS"}
    # "đúng" normalizes to "dung".  A bare "dùng/đúng" is not voucher
    # intent, especially in requests such as "hiển thị đúng các món Matcha".
    # Require a voucher object or the complete action phrase instead.
    if re.search(r"\b(?:xacnhan(?:\s+lai)?|xac nhan lai|kiem tra lai|check|tom tat|xem lai)\b.*\b(?:gio|gia|don)\b", norm):
        return {"intent": "VIEW_CART"}
    if re.search(r"\b(?:ap\s+dung|ma\s+(?:giam|voucher|so\s*\d+)|voucher|dung\s+(?:ma|voucher|so\s*\d+))\b", norm):
        return {"intent": "SELECT_VOUCHER"}
    if re.search(r"\b(vnpay|cod|tien mat|ngan hang|qr|vi)\b", norm):
        return {"intent": "SELECT_PAYMENT"}
    if order_words and not cart_words:
        if re.search(r"\b(huy)\b", norm): return {"intent": "CANCEL_EXISTING_ORDER"}
        if re.search(r"\b(sua|doi)\b", norm): return {"intent": "UPDATE_EXISTING_ORDER"}
        return {"intent": "ORDER_HISTORY"}
    if classify_confirmation(raw, pending_type) == "YES":
        return {"intent": "CONFIRM_CHECKOUT"}
    return {"intent": "BROWSING"}
