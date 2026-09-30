"""Branch availability overrides used by chat and strict checkout."""
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import text


def validate_items_at_branch(
    engine: Any,
    branch_id: str,
    items: Iterable[Dict[str, Any]],
    inventory_schema: str = "inventory",
) -> Dict[str, List[str]]:
    """Return paused products and identifiers that cannot be checked."""
    names: Dict[str, str] = {}
    product_ids: set[str] = set()
    for item in items:
        product_id = str(item.get("product_id") or "").strip()
        product_name = str(item.get("product_name") or product_id or "Sản phẩm")
        names[product_id] = product_name
        if product_id:
            product_ids.add(product_id)

    unavailable: List[str] = []
    unverified: List[str] = []

    if not branch_id or not product_ids:
        return {"unavailable": unavailable, "unverified": unverified}

    with engine.connect() as conn:
        for product_id in product_ids:
            if not product_id.isdigit():
                unverified.append(names[product_id])
                continue
            row = conn.execute(text(f"""
                SELECT dang_kinh_doanh
                FROM {inventory_schema}.ton_kho_san_pham
                WHERE co_so_ma = :branch_id AND ma_san_pham = :product_id
                LIMIT 1
            """), {
                "branch_id": branch_id,
                "product_id": int(product_id),
            }).fetchone()
            if row is None:
                # The admin UI writes a row when a branch pauses a product or
                # tracks a finite quantity. Most products have no override row;
                # treating those as unknown made every ordinary branch fail.
                continue
            if not bool(row[0]):
                unavailable.append(names[product_id])

    return {"unavailable": unavailable, "unverified": unverified}


def validate_cart_at_branch(
    engine: Any,
    cart: Dict[str, Any],
    inventory_schema: str = "inventory",
    extra_item: Optional[Dict[str, Any]] = None,
) -> Dict[str, List[str]]:
    items = list(cart.get("items") or [])
    if extra_item:
        items.append(extra_item)
    return validate_items_at_branch(
        engine,
        str(cart.get("branch_id") or ""),
        items,
        inventory_schema,
    )
