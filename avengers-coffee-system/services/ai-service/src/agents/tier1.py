import re
import time
from typing import Optional
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
