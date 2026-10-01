"""Branch availability overrides used by chat and strict checkout."""
import os
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import text


def availability_at_branch(
    engine: Any,
    branch_id: str,
    items: Iterable[Dict[str, Any]],
    inventory_schema: str = "inventory",
) -> Dict[str, Any]:
    """Menu activity AND branch sellability; quantity is informational only.

    A successful empty override inherits the active menu default. Missing menu
    identity or failed reads are unverified, never confirmed available.
    """
    names: Dict[str, str] = {}
    product_ids: set[str] = set()
    for item in items:
        product_id = str(item.get("product_id") or "").strip()
        product_name = str(item.get("product_name") or product_id or "Sản phẩm")
        names[product_id] = product_name
        if product_id:
            product_ids.add(product_id)

    statuses = {pid: "UNVERIFIED" for pid in names}
    menu_schema = os.getenv("MENU_SCHEMA", "menu")
    if branch_id and product_ids:
        try:
            with engine.connect() as conn:
                for product_id in names:
                    if not product_id.isdigit():
                        continue
                    params = {"branch_id": branch_id, "product_id": int(product_id)}
                    product = conn.execute(text(f"""
                        SELECT trang_thai FROM {menu_schema}.san_pham
                        WHERE ma_san_pham = :product_id LIMIT 1
                    """), params).fetchone()
                    if product is None or product[0] is None:
                        continue
                    if not bool(product[0]):
                        statuses[product_id] = "UNAVAILABLE"
                        continue
                    row = conn.execute(text(f"""
                        SELECT dang_kinh_doanh FROM {inventory_schema}.ton_kho_san_pham
                        WHERE co_so_ma = :branch_id AND ma_san_pham = :product_id LIMIT 1
                    """), params).fetchone()
                    statuses[product_id] = ("AVAILABLE" if row is None or row[0] is True
                                            else "UNAVAILABLE" if row[0] is False else "UNVERIFIED")
        except Exception:
            # Incomplete validation cannot authorize a branch or checkout.
            statuses = {pid: "UNAVAILABLE" if status == "UNAVAILABLE" else "UNVERIFIED"
                        for pid, status in statuses.items()}
    return {
        "available": [names[pid] for pid, status in statuses.items() if status == "AVAILABLE"],
        "unavailable": [names[pid] for pid, status in statuses.items() if status == "UNAVAILABLE"],
        "unverified": [names[pid] for pid, status in statuses.items() if status == "UNVERIFIED"],
        "product_statuses": [{"product_id": pid, "product_name": names[pid], "status": status}
                             for pid, status in statuses.items()],
        "is_fully_available": all(status == "AVAILABLE" for status in statuses.values()),
    }


def validate_items_at_branch(engine, branch_id, items, inventory_schema="inventory"):
    result = availability_at_branch(engine, branch_id, items, inventory_schema)
    return {key: result[key] for key in ("unavailable", "unverified")}


def validate_cart_at_branch(
    engine: Any,
    cart: Dict[str, Any],
    inventory_schema: str = "inventory",
    extra_item: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    items = list(cart.get("items") or [])
    if extra_item:
        items.append(extra_item)
    return availability_at_branch(
        engine,
        str(cart.get("branch_id") or ""),
        items,
        inventory_schema,
    )
