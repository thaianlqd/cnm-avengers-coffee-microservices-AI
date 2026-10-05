"""Bounded, process-local, sanitized positive examples. Never an authority."""

from copy import deepcopy
import threading
import hashlib
import json
from services.analysis_catalog import normalize
from services.analysis_contract import AnalysisSpec
from services.metadata_service import is_sensitive_column

_lock = threading.RLock()
_examples = []
MAX_EXAMPLES = 100


def record_verified(session, rating, fingerprint):
    if not session or not session.approved:
        return False
    source_key = hashlib.sha256(
        (session.session_id + ":" + str(session.revision)).encode()
    ).hexdigest()
    if rating != "positive":
        with _lock:
            _examples[:] = [e for e in _examples if e.get("source_key") != source_key]
        return False
    contracts = session.last_result_contract
    if (
        not contracts
        or not all(c.get("valid") for c in contracts.values())
        or fingerprint != session.schema_fingerprint
    ):
        return False
    # Retain semantic structure only, no client SQL, result values, identifiers,
    # user prompt, or free text. Location/config enums are safe filters.
    spec = AnalysisSpec.model_validate(session.analysis_spec).model_dump(mode="json")
    spec["used_example_ids"] = []
    spec["assumptions"] = []
    spec["ambiguities"] = []
    filters = list(spec["filters"]) + [
        f for g in spec["comparison_groups"] for f in g["filters"]
    ]
    if any(
        is_sensitive_column(f["dimension"]) or f["dimension"].endswith("_id")
        for f in filters
    ):
        return False
    for f in filters:
        if f["dimension"] != "city":
            f["value"] = "<redacted>" if f["operator"] != "in" else ["<redacted>"]
    for index, group in enumerate(spec["comparison_groups"]):
        group["name"] = "group_" + str(index + 1)
    example_id = hashlib.sha256(
        json.dumps(
            {"fingerprint": fingerprint, "spec": spec},
            sort_keys=True,
            ensure_ascii=False,
        ).encode()
    ).hexdigest()
    example = {
        "example_id": example_id,
        "source_key": source_key,
        "schema_fingerprint": fingerprint,
        "analysis_spec": spec,
        "status": "VERIFIED_CORRECT",
    }
    with _lock:
        if example not in _examples:
            _examples.append(example)
        del _examples[:-MAX_EXAMPLES]
    return True


def retrieve_verified(prompt, fingerprint, limit=2, catalog=None, analysis_kind=None):
    tokens = set(normalize(prompt).split())
    with _lock:
        compatible = [
            deepcopy(e)
            for e in _examples
            if e["schema_fingerprint"] == fingerprint
            and (
                analysis_kind is None
                or e["analysis_spec"]["analysis_kind"] == analysis_kind
            )
        ]

    def score(e):
        s = e["analysis_spec"]
        concepts = [s["subject"], *s["metrics"], *s["dimensions"]]
        if catalog:
            for name in list(concepts):
                for registry in ("subjects", "metrics", "dimensions"):
                    concepts += (
                        catalog.registry[registry].get(name, {}).get("aliases", [])
                    )
        return len(tokens & set(normalize(" ".join(concepts)).split()))

    selected = sorted([e for e in compatible if score(e) > 0], key=score, reverse=True)[
        :limit
    ]
    for example in selected:
        example.pop("source_key", None)
    return selected
