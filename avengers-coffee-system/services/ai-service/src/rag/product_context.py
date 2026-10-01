"""Read canonical identity from existing catalog/snapshots, never from retrieval."""
import re
from src.rag.documents import normalize_text


def resolve_product_context(query, session_id=None):
    from src.agents.order_flow_graph import _load_active_product_targets, _resolve_product_ordinals
    from src.common import cart_manager
    text = normalize_text(query)
    prefs = cart_manager.get_checkout_prefs(session_id) if session_id else {}
    if session_id:
        rows, invalid, requested = _resolve_product_ordinals(session_id, query)
        if requested:
            return rows[0] if len(rows) == 1 and not invalid else None
    staged = list(prefs.get('pending_products') or [])
    focus = prefs.get('last_product_focus') or {}
    if re.search(r'\b(?:mon|banh|nuoc|san pham|cai)\s+(?:nay|do|kia)\b', text):
        if len(staged) == 1:
            return staged[0]
        return focus if focus.get('product_id') else None
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
    matches = named(known)
    if len(matches) == 1:
        return matches[0]
    if matches:
        return None
    matches = named(_load_active_product_targets())
    return matches[0] if len(matches) == 1 else None
