"""Measured one-shot packing: protect direct knowledge, never hide its omission."""

from copy import deepcopy
from services.agent_provider import NativeAgentProvider
from services.analysis_catalog import AnalysisError
from services.semantic_manifest_service import build_manifest, manifest_references, provider_manifest, compact


def wire_payload(payload):
    value = {**payload, "domains": deepcopy(payload["domains"])}
    knowledge = value["domains"]
    if "lens_directory" in knowledge:
        packed = {l[0] for p in knowledge["packs"] for l in p["lenses"]}
        knowledge["lens_directory"] = {id: [l for l in lenses if l[0] not in packed] for id,lenses in knowledge["lens_directory"].items() if any(l[0] not in packed for l in lenses)}
    meanings = {}
    for pack in knowledge["packs"]:
        meanings.update(pack.pop("metric_meanings", {}))
    if meanings:
        knowledge["metric_meanings"] = meanings
    if not any(p["tier"] == "full" for p in knowledge["packs"]):
        knowledge.pop("lens_columns", None)
    if not any(p.get("health") for p in knowledge["packs"]):
        knowledge.pop("health_columns", None)
    if not any(p["tier"] == "compact" for p in knowledge["packs"]):
        knowledge.pop("compact_lens_columns", None)
    return value


def context_messages(payload):
    return [{"role": "user", "content": compact(wire_payload(payload))}]


def body_sizes(system, payload, tools):
    from services import llm_service

    messages = context_messages(payload)
    # Each preview gets a fresh transport; the native builder maintains a cursor.
    preview = NativeAgentProvider()
    model = next(iter(llm_service.GEMINI_MODELS), "configured_model")
    return {"native": len(compact(preview._gemini_body(system, messages, tools))),
            "compat": len(compact(preview._gemini_compat_body(system, messages, tools, model)))}


def pack_context(catalog, intelligence, candidates, manifest, payload, tools, system, maximum, target):
    knowledge = payload["domains"]
    omitted = knowledge.pop("omitted_pack_ids", [])
    profiles = intelligence.available()
    protected_subjects = list(dict.fromkeys(s for c in candidates if c["protected"] for s in profiles[c["id"]]["primary_subjects"]))
    protected_subjects += [s["query"]["subject"] for s in payload["state"] if s["query"].get("subject") not in protected_subjects]
    hit = False
    sizes = body_sizes(system, payload, tools)
    # Degrade by explicit priorities, never by insertion order. The soft target
    # cannot cause a mandatory compact pack or essential semantics to disappear.
    while max(sizes.values()) > min(target, maximum):
        if not intelligence.degrade(knowledge, candidates, omitted, manifest_references(manifest)):
            break
        sizes = body_sizes(system, payload, tools)
    # Very large catalogs / stored sessions may still need whole-subject shards.
    # Protect every direct domain, then previous meaning, before optional shards.
    while max(sizes.values()) > maximum:
        allowance = len(compact(manifest)) - (max(sizes.values()) - maximum) - 200
        if allowance < 1000:
            break
        try:
            candidate, candidate_hit = build_manifest(catalog, max_chars=allowance, subject_priority=protected_subjects)
        except AnalysisError as error:
            if error.category != "semantic_manifest_budget_exceeded":
                raise
            break
        refs = manifest_references(candidate)
        if any(not intelligence.covered(profiles[c["id"]], refs) for c in candidates if c["protected"]):
            break
        if candidate == manifest:
            break
        manifest, hit = candidate, candidate_hit
        payload["manifest"] = provider_manifest(manifest)
        knowledge["packs"] = [{**intelligence.pack(profiles[p["id"]], refs, p["tier"]),
            **({"blueprints": intelligence.blueprints(profiles[p["id"]], refs)} if "blueprints" in p else {})} for p in knowledge["packs"]]
        sizes = body_sizes(system, payload, tools)
    if any(not intelligence.covered(profiles[c["id"]], manifest_references(manifest)) or not any(p["id"] == c["id"] and p["lenses"] for p in knowledge["packs"]) for c in candidates if c["protected"]):
        raise AnalysisError("one_shot_context_budget_exceeded", "Explicit domain knowledge cannot fit")
    return manifest, hit, sizes, omitted
