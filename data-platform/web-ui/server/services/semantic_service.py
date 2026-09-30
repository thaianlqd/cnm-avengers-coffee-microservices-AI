import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional


CATALOG_PATH = Path(__file__).resolve().parent.parent / "metadata" / "semantic_catalog.json"


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", (value or "").lower())
    return re.sub(r"\s+", " ", "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")).strip()


class SemanticService:
    def __init__(self, catalog_path: Path = CATALOG_PATH):
        with catalog_path.open("r", encoding="utf-8") as handle:
            self.catalog = json.load(handle)
        self.entities = self.catalog.get("entities", [])

    @property
    def entity_count(self) -> int:
        return len(self.entities)

    def is_vague(self, prompt: str, context: str = "", domain: str = "auto") -> bool:
        text = _normalize(f"{prompt} {context}")
        vague_phrases = {
            "xem tinh hinh", "phan tich giup toi", "co gi bat thuong khong",
            "xem bao cao", "cho toi xem", "phan tich", "bao cao",
        }
        if domain and domain != "auto":
            return False
        if text in vague_phrases:
            return True
        scored = self._scores(text, domain)
        return not scored or max(scored.values(), default=0) < 2

    def _scores(self, text: str, domain: str = "auto") -> Dict[str, int]:
        normalized = _normalize(text)
        scores: Dict[str, int] = {}
        for entity in self.entities:
            score = 0
            for synonym in entity.get("synonyms", []):
                term = _normalize(synonym)
                if term and term in normalized:
                    score += max(2, len(term.split()) + 1)
            if _normalize(entity["business_name"]) in normalized:
                score += 4
            if domain and domain != "auto" and entity["id"] == domain:
                score += 10
            if score:
                scores[entity["id"]] = score
        return scores

    def resolve(
        self,
        prompt: str,
        context: str = "",
        domain: str = "auto",
        physical_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        text = f"{prompt} {context}".strip()
        scores = self._scores(text, domain)
        ranked_ids = [item[0] for item in sorted(scores.items(), key=lambda item: (-item[1], item[0]))]
        if not ranked_ids:
            ranked_ids = ["orders"]
        if "products" in ranked_ids and "order_items" not in ranked_ids:
            ranked_ids.append("order_items")
        if any(item in ranked_ids for item in ("products", "stores", "payments", "hourly", "customers")) and "orders" not in ranked_ids:
            ranked_ids.append("orders")
        selected_ids = ranked_ids[:5]
        selected = [entity for entity in self.entities if entity["id"] in selected_ids]
        selected.sort(key=lambda entity: selected_ids.index(entity["id"]))

        available = set((physical_metadata or {}).get("table_map", {}).keys())
        tables: List[str] = []
        metrics: List[str] = []
        dimensions: List[str] = []
        relationships: List[Dict[str, Any]] = []
        for entity in selected:
            for table in entity.get("tables", []):
                if table not in tables and (not available or table in available):
                    tables.append(table)
            metrics.extend(name for name in entity.get("metrics", {}) if name not in metrics)
            dimensions.extend(name for name in entity.get("dimensions", []) if name not in dimensions)
            relationships.extend(entity.get("relationships", []))

        return {
            "intent": selected[0]["id"],
            "entities": selected,
            "entity_ids": [entity["id"] for entity in selected],
            "tables": tables,
            "metrics": metrics,
            "dimensions": dimensions,
            "relationships": relationships,
            "business_rules": self.catalog.get("business_rules", []),
            "scores": scores,
        }

    def llm_context(self, resolution: Dict[str, Any], metadata: Dict[str, Any]) -> Dict[str, Any]:
        table_map = metadata.get("table_map", {})
        physical = []
        for table_name in resolution.get("tables", []):
            table = table_map.get(table_name)
            if not table:
                continue
            physical.append({
                "qualified_name": table_name,
                "object_type": table["object_type"],
                "estimated_rows": table["estimated_rows"],
                "columns": [
                    {
                        "name": column["name"],
                        "data_type": column["data_type"],
                        "nullable": column["nullable"],
                        "primary_key": column["primary_key"],
                        "foreign_key": column["foreign_key"],
                    }
                    for column in table["columns"]
                    if not column.get("sensitive")
                ],
                "relationships": table["relationships"],
                "view_definition": table.get("view_definition"),
            })
        return {
            "semantic_entities": resolution.get("entities", []),
            "business_rules": resolution.get("business_rules", []),
            "physical_metadata": physical,
        }


semantic_service = SemanticService()
