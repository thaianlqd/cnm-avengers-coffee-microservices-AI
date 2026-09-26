"""Authoritative branch-availability checks used by selection and checkout.

Policy:
- A selected branch needs an authoritative inventory row for each product.
- Missing rows are unverified and cannot authorize checkout.
- ``dang_kinh_doanh`` is the only availability authority for AI checkout.
- ``so_luong_ton`` is operational data and is never used as sellable quantity.
"""
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import text


def validate_items_at_branch(
    engine: Any,
    branch_id: str,
    items: Iterable[Dict[str, Any]],
    inventory_schema: str = "inventory",
    include_details: bool = False,
) -> Dict[str, Any]:
    """Return explicit branch-availability conflicts."""
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
    details: List[Dict[str, Any]] = []

    if not required_quantities:
        result: Dict[str, Any] = {"unavailable": unavailable, "unverified": unverified}
        if include_details:
            result["conflicts"] = details
        return result

    if not branch_id:
        for product_id, required_quantity in required_quantities.items():
            unverified.append(names[product_id])
            details.append({
                "product_id": product_id,
                "product_name": names[product_id],
                "required_quantity": required_quantity,
                "branch_id": None,
                "code": "UNKNOWN_BRANCH",
            })
        result = {"unavailable": unavailable, "unverified": unverified}
        if include_details:
            result["conflicts"] = details
        return result

    with engine.connect() as conn:
        for product_id, required_quantity in required_quantities.items():
            if not product_id.isdigit():
                unverified.append(names[product_id])
                details.append({
                    "product_id": product_id,
                    "product_name": names[product_id],
                    "branch_id": branch_id,
                    "code": "UNKNOWN_AVAILABILITY",
                })
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
                unverified.append(names[product_id])
                details.append({
                    "product_id": product_id,
                    "product_name": names[product_id],
                    "required_quantity": required_quantity,
                    "branch_id": branch_id,
                    "code": "UNKNOWN_AVAILABILITY",
                })
                continue
            is_active = bool(row[0])
            if not is_active:
                unavailable.append(names[product_id])
                details.append({
                    "product_id": product_id,
                    "product_name": names[product_id],
                    "required_quantity": required_quantity,
                    "branch_id": branch_id,
                    "code": "PRODUCT_DISABLED",
                })

    result = {"unavailable": unavailable, "unverified": unverified}
    if include_details:
        result["conflicts"] = details
    return result


def validate_cart_at_branch(
    engine: Any,
    cart: Dict[str, Any],
    inventory_schema: str = "inventory",
    extra_item: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    items = list(cart.get("items") or [])
    if extra_item:
        items.append(extra_item)
    result = validate_items_at_branch(
        engine,
        str(cart.get("branch_id") or ""),
        items,
        inventory_schema,
        include_details=True,
    )
    line_ids_by_product: Dict[str, List[str]] = defaultdict(list)
    for item in items:
        product_id = str(item.get("product_id") or "")
        line_id = item.get("line_id") or item.get("cart_item_id") or item.get("id")
        if line_id is not None:
            line_ids_by_product[product_id].append(str(line_id))
    for detail in result.get("conflicts") or []:
        line_ids = line_ids_by_product.get(str(detail.get("product_id") or ""), [])
        detail["line_ids"] = line_ids
        detail["line_id"] = line_ids[0] if len(line_ids) == 1 else None
    return result
