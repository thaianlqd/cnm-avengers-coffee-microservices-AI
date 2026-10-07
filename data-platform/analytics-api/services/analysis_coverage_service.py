"""Declared business coverage, never a natural-language intent router."""
from typing import Literal, Optional
from pydantic import Field
from services.analysis_contract import Contract
from services.analytical_tool_contract import ToolContractError, issue

class AnalysisComponent(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    business_goal: str = Field(min_length=1, max_length=120)
    domain_id: Optional[str] = None
    lens_id: Optional[str] = None
    requested_or_supporting: Literal["requested", "supporting"] = "requested"
    operation_ids: list[str] = Field(default_factory=list, max_length=8)
    status: Literal["planned", "unsupported", "insufficient_data", "needs_input"] = "planned"
    reason: Optional[Literal["historical_data_unavailable", "metric_unavailable", "definition_unavailable", "ambiguous_criterion"]] = None


def canonical_components(declared, artifacts, intelligence):
    profiles = intelligence.available()
    fallback = not declared
    components = [c.model_dump(mode="json") if hasattr(c, "model_dump") else dict(c) for c in declared]
    if fallback:
        for id, a in artifacts.items():
            p = intelligence.domain_for(a.query.subject)
            lens = next((l for l in p["analytical_lenses"] if l["id"] == a.query.lens_id), None) if p else None
            components.append(dict(id=id, business_goal=lens["business_label"] if lens else intelligence.catalog.registry["subjects"][a.query.subject]["business_name"], domain_id=p["domain_id"] if p else None, lens_id=a.query.lens_id, requested_or_supporting=a.query.role, operation_ids=[id], status="planned", reason=None))
    errors, seen = [], set()
    for i, c in enumerate(components):
        c = AnalysisComponent.model_validate(c).model_dump(mode="json")
        components[i] = c
        if c["id"] in seen or len(c["operation_ids"]) != len(set(c["operation_ids"])):
            errors.append(issue(["analysis_components", i], "duplicate_field"))
        seen.add(c["id"])
        p = profiles.get(c["domain_id"])
        lens = next((l for l in p["analytical_lenses"] if l["id"] == c["lens_id"]), None) if p else None
        if c["domain_id"] and not p or c["lens_id"] and not lens:
            errors.append(issue(["analysis_components", i], "unknown_reference"))
        if c["status"] != "planned":
            if c["operation_ids"] or not c["reason"]:
                errors.append(issue(["analysis_components", i], "invalid_analysis_shape"))
            continue
        if not c["operation_ids"]:
            errors.append(issue(["analysis_components", i, "operation_ids"], "missing_requested_component"))
        if c["domain_id"] and not p or c["lens_id"] and not lens:
            errors.append(issue(["analysis_components", i], "unknown_reference"))
        for ref in c["operation_ids"]:
            a = artifacts.get(ref)
            if not a or a.query.role != c["requested_or_supporting"] or p and a.query.subject not in p["primary_subjects"] or c["lens_id"] and a.query.lens_id != c["lens_id"]:
                errors.append(issue(["analysis_components", i, "operation_ids"], "missing_requested_component"))
    mapped = {ref for c in components if c["status"] == "planned" for ref in c["operation_ids"]}
    if any(a.query.role == "requested" and id not in mapped for id, a in artifacts.items()):
        errors.append(issue("analysis_components", "missing_requested_component"))
    if errors:
        raise ToolContractError(errors)
    return components, "execution_only" if fallback else "declared"


def requested_identity(components):
    return {(c.get("domain_id"), c.get("lens_id"), c.get("business_goal")) for c in components if isinstance(c, dict) and c.get("requested_or_supporting", "requested") == "requested"}


def coverage_diagnostics(components, artifacts):
    requested = [c for c in components if c["requested_or_supporting"] == "requested"]
    mapped = [c for c in requested if c["status"] == "planned" and c["operation_ids"] and all(id in artifacts for id in c["operation_ids"])]
    return dict(requested_component_count=len(requested), mapped_component_count=len(mapped), unmapped_component_ids=[c["id"] for c in requested if c not in mapped], requested_domain_ids=sorted({c["domain_id"] for c in requested if c["domain_id"]}), requested_lens_ids=sorted({c["lens_id"] for c in requested if c["lens_id"]}), materialized_operation_count=len(artifacts))
