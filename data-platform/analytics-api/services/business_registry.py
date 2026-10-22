"""Business feature registry (PLAN 20/10 §2): every business group and source table has a
disposition, evidence and owner; references must resolve against the governed catalog.

The registry is a map of work and limitations, not a certificate: AVAILABLE means a governed
domain answers the core questions, while open_items keep the remaining gaps explicit.
"""
import json
from pathlib import Path

REGISTRY_PATH = Path(__file__).resolve().parent.parent / "metadata" / "business_feature_registry.json"
ROOT = Path(__file__).resolve().parent.parent


def load_registry(path=REGISTRY_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_registry(registry, catalog_registry, root=ROOT):
    """Return a list of human-readable violations (empty = valid)."""
    errors = []
    states = set(registry["analytic_states"])
    actors = set(registry["human_actor_contexts"]) | set(registry["technical_actor_contexts"])
    tables = [t["source_table"] for t in registry["source_tables"]]
    profiles = catalog_registry["domain_intelligence"]["profiles"]
    metrics = catalog_registry["metrics"]
    if len(tables) != len(set(tables)):
        errors.append("duplicate source table")
    referenced, ids = set(), set()
    for g in registry["groups"]:
        gid = g["group_id"]
        if gid in ids:
            errors.append(f"{gid}: duplicate group")
        ids.add(gid)
        if g["analytic_state"] not in states or any(i["state"] not in states for i in g["open_items"]):
            errors.append(f"{gid}: unknown analytic state")
        if not set(g["actor_contexts"]) <= actors or not g["actor_contexts"]:
            errors.append(f"{gid}: unknown or missing actor context")
        if not set(g["source_tables"]) <= set(tables):
            errors.append(f"{gid}: source table outside the ledger")
        referenced.update(g["source_tables"])
        if not set(g["domain_ids"]) <= profiles.keys():
            errors.append(f"{gid}: unknown domain")
        offered = {m for d in g["domain_ids"] if d in profiles for m in profiles[d]["metric_refs"]}
        for m in g["metric_refs"]:
            if m not in metrics or metrics[m].get("lifecycle", {}).get("status") == "deprecated" or m not in offered:
                errors.append(f"{gid}: metric {m} is not an active metric of its domains")
        if g["analytic_state"] == "AVAILABLE" and not (g["domain_ids"] and g["metric_refs"]):
            errors.append(f"{gid}: AVAILABLE without governed domain and metric")
        if g["analytic_state"] != "AVAILABLE" and not g["open_items"]:
            errors.append(f"{gid}: limitation without explanation")
        if not g["evidence"] or not g.get("owner"):
            errors.append(f"{gid}: missing evidence or owner")
        for ref in g["test_refs"]:
            if not (root / ref).is_file():
                errors.append(f"{gid}: test reference {ref} does not resolve")
    orphans = sorted(set(tables) - referenced)
    if orphans:
        errors.append("orphan source tables: " + ", ".join(orphans))
    return errors


def coverage_report(registry):
    groups = registry["groups"]
    by_state = {}
    for g in groups:
        by_state.setdefault(g["analytic_state"], []).append(g["group_id"])
    gaps = [dict(group_id=g["group_id"], item=i["item"]) for g in groups for i in g["open_items"] if i["state"] == "IMPLEMENTATION_GAP"]
    referenced = {t for g in groups for t in g["source_tables"]}
    return dict(
        group_count=len(groups),
        source_table_count=len(registry["source_tables"]),
        classified_source_tables=len(referenced),
        groups_by_state={k: sorted(v) for k, v in sorted(by_state.items())},
        implementation_gap_items=len(gaps),
        implementation_gaps=gaps,
        actor_contexts_covered=sorted({a for g in groups for a in g["actor_contexts"]}),
    )
