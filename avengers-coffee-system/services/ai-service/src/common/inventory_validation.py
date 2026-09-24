"""Authoritative inventory checks used by branch selection and checkout.

Policy:
- Missing inventory rows remain unverified; absence is not proof of zero stock.
- Only explicit inactive/insufficient rows are unavailable.
- Products with a row must have enough quantity for the whole cart.
- Quantities are aggregated by product before validation.
"""
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import text


def validate_items_at_branch(
    engine: Any,
    branch_id: str,
    items: Iterable[Dict[str, Any]],
    inventory_schema: str = "inventory",
) -> Dict[str, List[str]]:
    """Return confirmed unavailable products and products with no stock record."""
    names: Dict[str, str] = {}
    required_quantities: Dict[str, int] = defaultdict(int)
    for item in items:
        product_id = str(item.get("product_id") or "").strip()
        product_name = str(item.get("product_name") or product_id or "Sản phẩm")
        names[product_id] = product_name
        if product_id:
            required_quantities[product_id] += max(1, int(item.get("quantity") or item.get("so_luong") or 1))

    unavailable: List[str] = []
    unverified: List[str] = []

    if not branch_id or not required_quantities:
        return {"unavailable": unavailable, "unverified": unverified}

    with engine.connect() as conn:
        for product_id, required_quantity in required_quantities.items():
            if not product_id.isdigit():
                unverified.append(names[product_id])
                continue
            row = conn.execute(text(f"""
                SELECT so_luong_ton, dang_kinh_doanh
                FROM {inventory_schema}.ton_kho_san_pham
                WHERE co_so_ma = :branch_id AND ma_san_pham = :product_id
                LIMIT 1
            """), {
                "branch_id": branch_id,
                "product_id": int(product_id),
            }).fetchone()
            if row is None:
                unverified.append(names[product_id])
                continue
            stock_quantity = int(row[0] or 0)
            is_active = bool(row[1])
            if not is_active or stock_quantity < required_quantity:
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
