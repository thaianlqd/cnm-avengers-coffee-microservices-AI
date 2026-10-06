"""Validated business metadata and bounded packs, never an intent router.

Retrieval ranks metadata text only. It cannot choose metrics, queries, scope or
time. The single model decision and existing compiler own those boundaries.
"""

import re
from collections import OrderedDict
from copy import deepcopy
from threading import Lock
from typing import List, Literal, Optional
from pydantic import Field
from services.analysis_contract import Contract
from services.analysis_catalog import AnalysisError, normalize
from services.semantic_manifest_service import build_manifest, compact
from services.value_grounding_service import dimension_values

QualityDirection = Literal["higher_better", "lower_better", "neutral", "contextual"]
Baseline = Literal["previous_period", "same_period_previous_year", "peer_average", "peer_median", "between_selected_groups"]


class AnalyticalLens(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    business_label: str = Field(max_length=100)
    business_question: str = Field(max_length=180)
    metric_refs: List[str] = Field(min_length=1, max_length=6)
    dimension_refs: List[str] = Field(default_factory=list, max_length=8)
    supports_time_series: bool = False
    supports_ranking: bool = False
    supports_comparison: bool = True
    supports_distribution: bool = False
    recommended_drilldowns: List[str] = Field(default_factory=list, max_length=8)
    related_lens_refs: List[str] = Field(default_factory=list, max_length=8)


class HealthSignal(Contract):
    metric: str
    direction: QualityDirection
    comparison: Literal["peer_average", "peer_median"] = "peer_average"
    peer_dimensions: List[str] = Field(min_length=1, max_length=4)
    minimum_peer_groups: int = Field(default=3, ge=3, le=100)
    # Volume/exposure cannot establish good/bad. Even directional signals
    # require a comparable population explicitly documented by the business.
    comparable_exposure: bool = False
    observation_metric: Optional[str] = None
    minimum_observations: int = Field(default=1, ge=1)


class DomainProfile(Contract):
    domain_id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    business_label: str = Field(max_length=100)
    short_business_purpose: str = Field(max_length=180)
    model_aliases: List[str] = Field(default_factory=list, max_length=3)
    primary_subjects: List[str] = Field(min_length=1, max_length=8)
    primary_entities: List[str] = Field(default_factory=list, max_length=8)
    metric_refs: List[str] = Field(min_length=1, max_length=16)
    dimension_refs: List[str] = Field(default_factory=list, max_length=16)
    analytical_lenses: List[AnalyticalLens] = Field(min_length=1, max_length=12)
    health_signals: List[HealthSignal] = Field(default_factory=list, max_length=8)
    diagnostic_dimensions: List[str] = Field(default_factory=list, max_length=8)
    drilldown_hierarchies: List[List[str]] = Field(default_factory=list, max_length=4)
    comparison_semantics: List[Baseline] = Field(default_factory=list, max_length=5)
    related_domains: List[str] = Field(default_factory=list, max_length=12)
    supporting_analysis_capabilities: List[str] = Field(default_factory=list, max_length=12)
    business_caveats: List[str] = Field(default_factory=list, max_length=8)


def validate_profiles(registry):
    """Bad logical references fail catalog initialization, even if unavailable physically."""
    try:
        metadata = registry["domain_intelligence"]
        if metadata["version"] != 1:
            raise ValueError("Unsupported domain metadata version")
        profiles = {id: DomainProfile.model_validate(p) for id, p in metadata["profiles"].items()}
        for id, p in profiles.items():
            if not set(p.business_caveats) <= metadata.get("caveat_labels", {}).keys():
                raise ValueError("Unknown business caveat")
            if id != p.domain_id or id in {"auto", "multi"}:
                raise ValueError("Invalid domain identity")
            if not set(p.primary_subjects) <= registry["subjects"].keys():
                raise ValueError("Unknown subject")
            if not set(p.metric_refs) <= registry["metrics"].keys():
                raise ValueError("Unknown metric")
            dims = set(p.dimension_refs)
            if not dims <= registry["dimensions"].keys() or not set(p.primary_entities + p.diagnostic_dimensions) <= dims:
                raise ValueError("Unknown dimension")
            if not set(p.related_domains) <= profiles.keys() or id in p.related_domains:
                raise ValueError("Unknown related domain")
            lenses = {l.id: l for l in p.analytical_lenses}
            if len(lenses) != len(p.analytical_lenses) or not set(p.supporting_analysis_capabilities) <= lenses.keys():
                raise ValueError("Invalid lens references")
            for metric in p.metric_refs:
                m = registry["metrics"][metric]
                if not set(m["subjects"]) & set(p.primary_subjects):
                    raise ValueError("Metric is not defined for profile subject")
                if m.get("quality_direction", "contextual") not in {"higher_better", "lower_better", "neutral", "contextual"}:
                    raise ValueError("Invalid metric direction")
            for lens in lenses.values():
                if not set(lens.metric_refs) <= set(p.metric_refs) or not set(lens.dimension_refs + lens.recommended_drilldowns) <= dims or not set(lens.related_lens_refs) <= lenses.keys():
                    raise ValueError("Invalid lens references")
                if lens.supports_time_series and any(not registry["metrics"][m].get("time_column") for m in lens.metric_refs):
                    raise ValueError("Snapshot lens cannot offer history")
                if lens.supports_distribution and any(not registry["metrics"][m].get("additive") for m in lens.metric_refs):
                    raise ValueError("Non-additive composition")
            for path in p.drilldown_hierarchies:
                if len(path) < 2 or len(path) != len(set(path)) or not set(path) <= dims:
                    raise ValueError("Invalid drilldown")
            for signal in p.health_signals:
                m = registry["metrics"].get(signal.metric, {})
                if signal.metric not in p.metric_refs or signal.direction != m.get("quality_direction", "contextual") or not set(signal.peer_dimensions) <= dims:
                    raise ValueError("Invalid health signal")
                if signal.observation_metric and signal.observation_metric not in p.metric_refs:
                    raise ValueError("Unknown observation metric")
        return profiles
    except (KeyError, ValueError, TypeError):
        raise AnalysisError("domain_metadata_invalid", "Invalid domain intelligence metadata") from None


_cache = OrderedDict()
_lock = Lock()


class DomainIntelligence:
    def __init__(self, catalog):
        self.catalog = catalog
        self.profiles = validate_profiles(catalog.registry)

    def available(self):
        key = (self.catalog.fingerprint, "profiles")
        with _lock:
            if key in _cache:
                _cache.move_to_end(key)
                return deepcopy(_cache[key])
        manifest, _ = build_manifest(self.catalog, max_chars=20000)
        metrics = {m[0] for m in manifest["metrics"]}
        dims = {d[0] for d in manifest["dimensions"]}
        subjects = {s[0] for s in manifest["subjects"]}
        valid = {}
        for id, profile in self.profiles.items():
            p = profile.model_dump()
            p["primary_subjects"] = [s for s in p["primary_subjects"] if s in subjects]
            p["metric_refs"] = [m for m in p["metric_refs"] if m in metrics]
            p["dimension_refs"] = [d for d in p["dimension_refs"] if d in dims and any(d in self.catalog.compatible_dimensions(m) for m in p["metric_refs"])]
            allowed = set(p["dimension_refs"])
            if not p["primary_subjects"] or not p["metric_refs"]:
                continue
            lenses = []
            for lens in p["analytical_lenses"]:
                # All lens measures are required: never quietly substitute a subset.
                if not set(lens["metric_refs"]) <= set(p["metric_refs"]):
                    continue
                compatible = set.intersection(*(set(self.catalog.compatible_dimensions(m)) for m in lens["metric_refs"])) & allowed
                lens["dimension_refs"] = [d for d in lens["dimension_refs"] if d in compatible]
                lens["recommended_drilldowns"] = [d for d in lens["recommended_drilldowns"] if d in compatible]
                if not lens["dimension_refs"]:
                    lens.update(supports_ranking=False, supports_distribution=False)
                lenses.append(lens)
            if not lenses:
                continue
            ids = {l["id"] for l in lenses}
            for lens in lenses:
                lens["related_lens_refs"] = [l for l in lens["related_lens_refs"] if l in ids]
            p["analytical_lenses"] = lenses
            p["supporting_analysis_capabilities"] = [l for l in p["supporting_analysis_capabilities"] if l in ids]
            for field in ("primary_entities", "diagnostic_dimensions"):
                p[field] = [d for d in p[field] if d in allowed]
            p["drilldown_hierarchies"] = [path for path in p["drilldown_hierarchies"] if set(path) <= allowed and any(set(path) <= set(self.catalog.compatible_dimensions(m)) for m in p["metric_refs"])]
            p["health_signals"] = [s for s in p["health_signals"] if s["metric"] in p["metric_refs"] and set(s["peer_dimensions"]) <= allowed & set(self.catalog.compatible_dimensions(s["metric"])) and (not s["observation_metric"] or s["observation_metric"] in p["metric_refs"])]
            if not any(self.catalog.registry["metrics"][m].get("time_column") for m in p["metric_refs"]):
                p["comparison_semantics"] = [b for b in p["comparison_semantics"] if b not in {"previous_period", "same_period_previous_year"}]
            valid[id] = p
        # A metadata edge is a hint only when a physically checked directional
        # path exists. Support validation independently also checks clocks/cohorts.
        for id, p in valid.items():
            p["related_domains"] = [other for other in p["related_domains"] if other in valid and self.related(p, valid[other])]
        with _lock:
            _cache[key] = deepcopy(valid)
            while len(_cache) > 16:
                _cache.popitem(last=False)
        return valid

    def related(self, parent, child):
        for a in parent["primary_subjects"]:
            for b in child["primary_subjects"]:
                try:
                    self.catalog.path(self.catalog.registry["subjects"][b]["source"], self.catalog.registry["subjects"][a]["source"])
                    return True
                except AnalysisError:
                    pass
        return False

    def domain_for(self, subject):
        return next((p for p in self.available().values() if subject in p["primary_subjects"]), None)

    def validate_lens(self, query):
        if not query.lens_id:
            return
        p = self.domain_for(query.subject)
        lens = next((l for l in p["analytical_lenses"] if l["id"] == query.lens_id), None) if p else None
        if not lens or not set(query.metrics) <= set(lens["metric_refs"]) or not set(query.group_by) <= set(lens["dimension_refs"]):
            raise AnalysisError("domain_lens_invalid", "Analysis conflicts with catalog lens")
        flag = {"trend": "supports_time_series", "ranking": "supports_ranking", "distribution": "supports_distribution"}.get(query.operation)
        if flag and not lens[flag]:
            raise AnalysisError("domain_lens_invalid", "Lens does not support this operation")

    def capabilities(self):
        profiles = self.available()
        scope_types = []
        for id, d in self.catalog.registry["dimensions"].items():
            if not d.get("scope_selectable"):
                continue
            try:
                self.catalog.check_column(d["table"], d["column"])
            except AnalysisError:
                continue
            if not any(id in p["dimension_refs"] for p in profiles.values()):
                continue
            scope_types.append({"id": id, "label": d["business_name"], "values": dimension_values(self.catalog, id)[:50], "searchable": d.get("value_grounding", {}).get("mode") == "lookup"})
        return {"status": "ready", "version": "2.5", "fingerprint": self.catalog.fingerprint,
                "domains": [{"id": id, "label": p["business_label"], "historical": any(self.catalog.registry["metrics"][m].get("time_column") for m in p["metric_refs"]), "caveats": [self.catalog.registry["domain_intelligence"]["caveat_labels"][c] for c in p["business_caveats"]]} for id, p in profiles.items()],
                "analysis_depths": [{"id": "focused", "label": "Tập trung"}, {"id": "deep", "label": "Phân tích sâu"}, {"id": "comprehensive", "label": "Phân tích toàn diện"}],
                "time_presets": [{"id": id, "label": label} for id, label in TIME_PRESETS.items()],
                "scope_types": scope_types}

    def directory(self, profiles):
        return [[id, p["business_label"], p["model_aliases"], p["primary_subjects"],
                 [c for c in p["business_caveats"] if c in {"snapshot_only", "sample_size_required"}]] for id, p in profiles.items()]

    def pack(self, p, references):
        key = (self.catalog.fingerprint, "pack", p["domain_id"], tuple(sorted(references)))
        with _lock:
            if key in _cache:
                _cache.move_to_end(key)
                return deepcopy(_cache[key])
        metrics = {id for kind, id in references if kind == "metric"}
        dims = {id for kind, id in references if kind == "dimension"}
        lenses = [l for l in p["analytical_lenses"] if set(l["metric_refs"]) <= metrics]
        meanings = {}
        for m in p["metric_refs"]:
            meta = self.catalog.registry["metrics"][m]
            meaning = meta.get("business_meaning", "")
            # The global index already carries label/unit/aggregation. Only
            # additional population/snapshot meaning needs another wire copy.
            redundant = f"{meta['business_name']} ở mức {meta['grain']}; đơn vị {meta['unit']}."
            if m in metrics and meaning and meaning != redundant:
                meanings[m] = meaning
        health = {}
        for s in p["health_signals"]:
            if s["metric"] not in metrics or not set(s["peer_dimensions"]) <= dims:
                continue
            group = (s["comparison"], tuple(s["peer_dimensions"]), s["comparable_exposure"], s["minimum_peer_groups"], s["observation_metric"], s["minimum_observations"])
            health.setdefault(group, []).append(s["metric"])
        packed = {"id": p["domain_id"], "purpose": p["short_business_purpose"],
                "metric_meanings": meanings,
                "entities": [d for d in p["primary_entities"] if d in dims],
                "lenses": [[l["id"], l["business_label"], l["metric_refs"], [d for d in l["dimension_refs"] if d in dims],
                            "".join(code for code, flag in (("t", "supports_time_series"), ("r", "supports_ranking"), ("c", "supports_comparison"), ("d", "supports_distribution")) if l[flag])] for l in lenses],
                "diagnostics": [d for d in p["diagnostic_dimensions"] if d in dims],
                "drilldowns": [path for path in p["drilldown_hierarchies"] if set(path) <= dims],
                "health": [[ms, baseline, list(ds), exposure, peers, observation, minimum] for (baseline, ds, exposure, peers, observation, minimum), ms in health.items()],
                "comparisons": p["comparison_semantics"], "related": p["related_domains"]}
        with _lock:
            _cache[key] = deepcopy(packed)
            while len(_cache) > 64:
                _cache.popitem(last=False)
        return packed

    def context(self, question, domain, depth, references, previous_subjects=(), max_chars=None):
        """Generic lexical candidate retrieval; all domains remain in directory."""
        profiles = self.available()
        if domain not in {"auto", "multi", *profiles}:
            raise AnalysisError("unsupported_domain", "Selected domain is unavailable")
        policy = DEPTH_POLICIES[depth]
        maximum = policy["domain_chars"] if max_chars is None else max_chars
        question_text = normalize(question)
        terms = set(re.findall(r"\w+", question_text)) - set(map(normalize, self.catalog.registry["interpretation"].get("retrieval_stopwords", [])))
        scores = []
        for id, p in profiles.items():
            text = " ".join([id, *p["primary_subjects"], p["business_label"], *p["model_aliases"], *[self.catalog.registry["subjects"][s]["business_name"] for s in p["primary_subjects"]]])
            words = set(re.findall(r"\w+", normalize(text)))
            aliases = [normalize(a) for a in [id, *p["primary_subjects"], *p["model_aliases"], p["business_label"]]]
            phrase = max((len(a.split()) for a in aliases if re.search(r"(?<!\w)" + re.escape(a) + r"(?!\w)", question_text)), default=0)
            score = phrase * 2 + len(terms & words) / max(1, len(words))
            preferred = id == domain or bool(set(previous_subjects) & set(p["primary_subjects"]))
            scores.append((preferred, score, id))
        scores.sort(key=lambda v: (-v[0], -v[1], v[2]))
        signaled = [id for preferred, score, id in scores if preferred or score > 0]
        candidates = signaled or [id for _, _, id in scores]
        anchor = domain if domain not in {"auto", "multi"} else candidates[0] if candidates else None
        if anchor and depth != "focused":
            related = profiles[anchor]["related_domains"]
            candidates = list(dict.fromkeys([anchor, *[id for id in candidates if id in related], *[id for id in candidates if id != anchor], *related]))
        elif domain not in {"auto", "multi"}:
            candidates = [domain, *[id for id in candidates if id != domain]]
        packs, omitted = [], []
        for id in candidates:
            pack = self.pack(profiles[id], references)
            if not pack["lenses"] or len(packs) >= policy["packs"] or len(compact([*packs, pack])) > maximum:
                omitted.append(id)
            else:
                packs.append(pack)
        return {"version": 1, "directory_columns": "id,label,aliases,subjects,caveats", "directory": self.directory(profiles),
                "lens_columns": "id,label,metrics,dimensions,capabilities(t=trend,r=ranking,c=comparison,d=distribution)",
                "health_columns": "metrics,baseline,peer_dimensions,comparable_exposure,min_peers,observation_metric,min_observations; directions in manifest",
                "packs": packs, "omitted_pack_ids": omitted}


TIME_PRESETS = {"auto": "Tự động", "today": "Hôm nay", "7d": "7 ngày qua", "30d": "30 ngày qua",
                "current_month": "Tháng này", "previous_month": "Tháng trước", "current_quarter": "Quý này",
                "previous_quarter": "Quý trước", "all_time": "Toàn bộ thời gian", "custom": "Tùy chọn"}

DEPTH_POLICIES = {
    "focused": {"supports": 1, "packs": 1, "domain_chars": 1800, "body_chars": 24000, "target_views": [1, 3]},
    "deep": {"supports": 6, "packs": 2, "domain_chars": 3500, "body_chars": 24000, "target_views": [4, 6]},
    "comprehensive": {"supports": 7, "packs": 8, "domain_chars": 8000, "body_chars": 24000, "target_views": [6, 8]},
}
