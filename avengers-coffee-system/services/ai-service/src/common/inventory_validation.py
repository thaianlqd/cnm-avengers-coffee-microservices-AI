"""Branch availability overrides used by chat and strict checkout."""
import os
from typing import Any, Dict, Iterable, Optional

from sqlalchemy import text


def availability_for_branches(
    engine: Any,
    branch_ids: Iterable[str],
    items: Iterable[Dict[str, Any]],
    inventory_schema: str = "inventory",
) -> Dict[str, Dict[str, Any]]:
    """Check a candidate set with two reads, without caching sellability.

    Only a successful inventory read can establish a missing override. Menu
    inactivity remains a known blocker even if the inventory read fails.
    Quantity is informational and never determines customer sellability.
    """
    branches = list(dict.fromkeys(str(bid or "") for bid in branch_ids))
    names = {}
    for item in items:
        pid = str(item.get("product_id") or "").strip()
        names[pid] = str(item.get("product_name") or pid or "Sản phẩm")
    statuses = {bid: {pid: "UNVERIFIED" for pid in names} for bid in branches}
    numeric_ids = [int(pid) for pid in names if pid.isdigit()]
    menu_schema = os.getenv("MENU_SCHEMA", "menu")
    if any(branches) and numeric_ids:
        try:
            with engine.connect() as conn:
                products = dict(conn.execute(text(f"""
                    SELECT ma_san_pham::text, trang_thai FROM {menu_schema}.san_pham
                    WHERE ma_san_pham = ANY(:product_ids)
                """), {"product_ids": numeric_ids}).fetchall())
                for values in statuses.values():
                    for pid in names:
                        if products.get(pid) is False:
                            values[pid] = "UNAVAILABLE"
                rows = conn.execute(text(f"""
                    SELECT co_so_ma, ma_san_pham::text, dang_kinh_doanh
                    FROM {inventory_schema}.ton_kho_san_pham
                    WHERE co_so_ma = ANY(:branch_ids) AND ma_san_pham = ANY(:product_ids)
                """), {"branch_ids": branches, "product_ids": numeric_ids}).fetchall()
                overrides = {(str(bid), str(pid)): active for bid, pid, active in rows}
                for bid, values in statuses.items():
                    if not bid:
                        continue
                    for pid in names:
                        if products.get(pid) is True:
                            active = overrides.get((bid, pid), True)
                            values[pid] = ("AVAILABLE" if active is True else
                                           "UNAVAILABLE" if active is False else "UNVERIFIED")
        except Exception:
            # Distinguish a failed read from a successful empty override set.
            pass
    return {bid: {
        "available": [names[pid] for pid, status in values.items() if status == "AVAILABLE"],
        "unavailable": [names[pid] for pid, status in values.items() if status == "UNAVAILABLE"],
        "unverified": [names[pid] for pid, status in values.items() if status == "UNVERIFIED"],
        "product_statuses": [{"product_id": pid, "product_name": names[pid], "status": status}
                             for pid, status in values.items()],
        "is_fully_available": all(status == "AVAILABLE" for status in values.values()),
    } for bid, values in statuses.items()}


def availability_at_branch(engine: Any, branch_id: str, items: Iterable[Dict[str, Any]],
                           inventory_schema: str = "inventory") -> Dict[str, Any]:
    # Keep an empty branch unverified rather than authorizing it.
    key = str(branch_id or "")
    return availability_for_branches(engine, [key], items, inventory_schema)[key]


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
