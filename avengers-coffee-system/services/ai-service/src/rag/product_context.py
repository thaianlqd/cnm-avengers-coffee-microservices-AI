"""Read canonical identity from existing catalog/snapshots, never from retrieval."""
import re
from src.rag.documents import normalize_text
from src.rag.authority import positive_request_text


def resolve_product_context(query, session_id=None, selected_product_id=None, reference_out=None):
    from src.agents.order_flow_graph import _load_active_product_targets, _resolve_product_ordinals
    from src.common import cart_manager
    def resolved(product, source):
        if product and reference_out is not None:
            reference_out.update(product=product, reference_source=source)
        return product

    text = positive_request_text(query)
    prefs = cart_manager.get_checkout_prefs(session_id) if session_id else {}
    if session_id:
        rows, invalid, requested = _resolve_product_ordinals(session_id, query)
        if requested:
            return resolved(rows[0], 'product_snapshot_ordinal') if len(rows) == 1 and not invalid else None
    staged = list(prefs.get('pending_products') or [])
    focus = prefs.get('last_product_focus') or {}
    # Explicit names take precedence over any pending/focused product.
    known = staged + list(prefs.get('last_product_suggestions') or []) + ([focus] if focus else [])
    def named(rows):
        matches = {str(row['product_id']): row for row in rows
                   if row.get('product_id') and row.get('product_name')
                   and re.search(r'(?<!\w)' + re.escape(normalize_text(row['product_name'])) + r'(?!\w)', text)}
        # Remove only strict name substrings, never select a longer unrelated product.
        matches = {key: row for key, row in matches.items() if not any(
            normalize_text(row['product_name']) != normalize_text(other['product_name'])
            and normalize_text(row['product_name']) in normalize_text(other['product_name'])
            for other in matches.values())}
        return list(matches.values())
    catalog = _load_active_product_targets()
    matches = named(known + catalog)
    if len(matches) == 1:
        return resolved(matches[0], 'explicit_product_name')
    if matches:
        return None
    deictic = bool(re.search(r'\b(?:mon|banh|nuoc|san pham|cai)\s+(?:nay|do|kia|vua (?:nay|roi|xem))\b', text))
    if not deictic:
        # Reuse the canonical alias contract, never guess from retrieved text.
        from src.agents.shopping_language import interpret_shopping
        meaning = interpret_shopping(text, snapshot=known + catalog)
        if meaning.targets or meaning.ambiguity:
            return resolved(meaning.targets[0], meaning.reference_source) if len(meaning.targets) == 1 and not meaning.ambiguity else None
    # An explicit unknown name must not silently fall back to a focused product.
    reference_text = re.sub(r'\b(?:mon|banh|nuoc|san pham|cai)\s+(?:nay|do|kia|vua (?:nay|roi|xem))\b', '', text)
    # Consume compound information phrases as units. A bag of words would
    # confuse an unknown name containing e.g. "trà/tồn/tại" with "kiểm tra",
    # "tồn kho", and "hiện tại", and silently reuse the old identity.
    frame = re.sub(r"\b(?:huong vi|thanh phan|nguyen lieu|danh gia|nhan xet|bao nhieu|"
                   r"hien tai|con hang|het hang|ton kho|kiem tra)\b", " ", reference_text)
    elliptical = set(frame.split()) <= set(
        'vi huong sao the nao nhu ngon k ko khong co gi dac biet sua '
        'caffein caffeine duoc review khach tien gia hoi toi minh chi ban b ntn an nha nhe a oi va'.split())
    if not elliptical:
        return None
    if staged:
        return resolved(staged[0], 'pending_products') if len(staged) == 1 else None
    if selected_product_id:
        return resolved(next((row for row in catalog
                     if str(row['product_id']) == str(selected_product_id)), None), 'selected_product_id')
    if focus.get('product_id'):
        return resolved(focus, 'last_product_focus')
    visible = {str(row['product_id']): row for row in prefs.get('last_product_suggestions') or []
               if row.get('product_id')}
    return resolved(next(iter(visible.values())), 'single_product_snapshot') if len(visible) == 1 else None
