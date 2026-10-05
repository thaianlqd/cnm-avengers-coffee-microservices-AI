import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


CATALOG_PATH = Path(__file__).resolve().parent.parent / "metadata" / "semantic_catalog.json"

# Legacy hint vocabulary uses the same curated registry as V2 grounding.
with CATALOG_PATH.open(encoding="utf-8") as _catalog_handle:
    CITY_ALIASES: Dict[str, str] = json.load(_catalog_handle)["analysis_registry"]["dimensions"]["city"]["value_aliases"]

# ── Location keywords that indicate geographic intent ──
LOCATION_KEYWORDS = {
    "thành phố", "thanh pho", "tỉnh", "tinh", "khu vực", "khu vuc",
    "miền", "mien", "vùng", "vung", "chi nhánh", "chi nhanh",
    "cửa hàng", "cua hang", "quán", "quan", "store", "branch",
    "tại", "tai", "ở", "o", "nơi", "noi",
}


# ── Common Telex typos and phonetic mistakes in Vietnamese typing ──
TELEX_TYPOS: Dict[str, str] = {
    "tbaos": "báo", "baos": "báo", "caos": "cáo", "tbao": "báo",
    "cuawr": "cửa", "hangf": "hàng", "cuahang": "cửa hàng",
    "chinhanh": "chi nhánh", "doanhthu": "doanh thu", "donhang": "đơn hàng",
    "san rphaamr": "sản phẩm", "san pham": "sản phẩm", "rphaamr": "phẩm",
}


def normalize_telex(text: str) -> str:
    res = text or ""
    # Replace typo 'to' with 'top' when followed by a number (e.g. 'to 3', 'to 5')
    res = re.sub(r"\bto\s+(\d+)", r"top \1", res, flags=re.IGNORECASE)
    for typo, correction in TELEX_TYPOS.items():
        res = re.sub(rf"\b{re.escape(typo)}\b", correction, res, flags=re.IGNORECASE)
    return res


def _normalize(value: str) -> str:
    text = normalize_telex(value)
    decomposed = unicodedata.normalize("NFD", text.lower())
    return re.sub(r"\s+", " ", "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")).strip()


def _normalize_keep_diacritics(value: str) -> str:
    """Normalize whitespace and telex typos but keep Vietnamese diacritics."""
    text = normalize_telex(value)
    return re.sub(r"\s+", " ", text.lower()).strip()


class SemanticService:
    def __init__(self, catalog_path: Path = CATALOG_PATH):
        with catalog_path.open("r", encoding="utf-8") as handle:
            self.catalog = json.load(handle)
        self.entities = self.catalog.get("entities", [])
        self.few_shot_examples = self.catalog.get("few_shot_examples", [])
        self.enums = self.catalog.get("enums", {})
        self.silver_tables = self.catalog.get("silver_tables", {})
        self.data_samples = self.catalog.get("data_samples", {})

    @property
    def entity_count(self) -> int:
        return len(self.entities)

    # ── Query analysis: extract structured signals from user prompt ──

    def extract_query_context(self, prompt: str) -> Dict[str, Any]:
        """
        Extract structured context from user prompt:
        - cities mentioned
        - top_n requested
        - time references
        - comparison intent
        - specific product/category mentions
        """
        text_normalized = _normalize(prompt)
        text_with_diacritics = _normalize_keep_diacritics(prompt)

        context: Dict[str, Any] = {
            "cities": [],
            "city_top_pairs": {},
            "top_n": None,
            "top_n_list": [],
            "has_comparison": False,
            "has_time_ref": False,
            "mentioned_products": [],
            "mentioned_categories": [],
            "sort_preference": None,
            "location_intent": False,
        }

        # 1. Detect cities from aliases
        for alias, canonical in CITY_ALIASES.items():
            if alias in text_normalized or alias in text_with_diacritics:
                if canonical not in context["cities"]:
                    context["cities"].append(canonical)

        # 1b. Detect cities from full 55 cities list in catalog
        for city in self.data_samples.get("cities", []):
            city_norm = _normalize(city)
            if (city_norm in text_normalized or city.lower() in text_with_diacritics) and city not in context["cities"]:
                context["cities"].append(city)

        # 2. Detect location keywords even without specific city
        for kw in LOCATION_KEYWORDS:
            if kw in text_normalized or kw in text_with_diacritics:
                context["location_intent"] = True
                break

        # 3. Detect Top N (all occurrences, including typos like 'to 3')
        all_top_matches = [int(x) for x in re.findall(r"(?:top|to)\s*(\d+)", text_normalized)]
        context["top_n_list"] = all_top_matches
        if all_top_matches:
            context["top_n"] = all_top_matches[0]
        else:
            n_match = re.search(r"(\d+)\s*(?:san pham|san rphaamr|mon|chi nhanh|cua hang|khach hang|voucher|khuyen mai|nhan vien|shipper|danh muc|sp)", text_normalized)
            if n_match:
                n = int(n_match.group(1))
                if 1 <= n <= 50:
                    context["top_n"] = n
                    context["top_n_list"] = [n]

        # 3b. Detect paired targets (e.g. "Top 5 Hà Nội và Top 3 Cần Thơ", "to 3 ở Cần Thơ")
        clauses = re.split(r"\bvà\b|\bva\b|\bvs\b|,|;", text_normalized)
        for clause in clauses:
            found_city = None
            for alias, canonical in CITY_ALIASES.items():
                if re.search(r"\b" + re.escape(alias) + r"\b", clause):
                    found_city = canonical
                    break
            if not found_city:
                for city in self.data_samples.get("cities", []):
                    if _normalize(city) in clause:
                        found_city = city
                        break
            clause_top = re.search(r"(?:top|to)\s*(\d+)", clause)
            if not clause_top:
                clause_top = re.search(r"(\d+)\s*(?:san pham|san rphaamr|mon|chi nhanh|cua hang|khach hang|voucher|khuyen mai|nhan vien|shipper|danh muc|sp)", clause)
            if found_city and clause_top:
                context["city_top_pairs"][found_city] = int(clause_top.group(1))

        if len(context["city_top_pairs"]) > 1:
            context["has_comparison"] = True

        # 4. Detect comparison intent
        comparison_patterns = [
            r"\bvs\b", r"\bso sanh\b", r"\bso voi\b", r"\bva\b.*\bva\b",
            r"\bgiua\b", r"\bhon\b", r"\bthua\b", r"\bchenh lech\b",
        ]
        for pat in comparison_patterns:
            if re.search(pat, text_normalized):
                context["has_comparison"] = True
                break

        # 5. Detect time references
        time_patterns = [
            r"\bhom nay\b", r"\bhom qua\b", r"\btuan nay\b", r"\btuan truoc\b",
            r"\bthang nay\b", r"\bthang truoc\b", r"\bnam nay\b", r"\bnam truoc\b",
            r"\b\d+\s*(ngay|ngày|thang|tháng|tuan|tuần)\b", r"\btoday\b",
            r"\bquý\b", r"\bquy\b", r"\b\d{4}\b",
        ]
        for pat in time_patterns:
            if re.search(pat, text_normalized):
                context["has_time_ref"] = True
                break

        # 6. Detect sort preference
        if any(kw in text_normalized for kw in ["ban chay", "nhieu nhat", "cao nhat", "lon nhat", "tot nhat", "dan dau"]):
            context["sort_preference"] = "DESC"
        elif any(kw in text_normalized for kw in ["it nhat", "thap nhat", "kem nhat", "yeu nhat", "cuoi"]):
            context["sort_preference"] = "ASC"

        # 7. Detect product/category mentions from data_samples
        for product in self.data_samples.get("top_products", []):
            if _normalize(product) in text_normalized:
                context["mentioned_products"].append(product)
        for cat in self.data_samples.get("categories", []):
            if _normalize(cat) in text_normalized:
                context["mentioned_categories"].append(cat)

        return context

    def is_vague(self, prompt: str, context: str = "", domain: str = "auto") -> bool:
        text = _normalize(f"{prompt} {context}").strip()
        if not text:
            return True
        vague_phrases = {
            "xem tinh hinh", "phan tich giup toi", "co gi bat thuong khong",
            "xem bao cao", "cho toi xem", "phan tich", "bao cao",
            "xem giup toi", "giup toi", "bao cao giup toi"
        }
        if domain and domain != "auto":
            return False
        if text in vague_phrases:
            return True
        # Specific business or analytical terms mean the query is NOT vague
        analytical_keywords = {
            "thang", "nam", "tuan", "ngay", "hom nay", "hom qua",
            "mon", "san pham", "do uong", "doanh thu", "don hang", "don",
            "chi nhanh", "cua hang", "quan", "khach hang", "khach", "hoi vien",
            "voucher", "khuyen mai", "giam gia", "ton kho", "ton", "danh gia",
            "sao", "nhan vien", "ca lam", "shipper", "giao hang", "thanh toan",
            "top", "cao nhat", "thap nhat", "it nhat", "nhieu nhat", "so sanh",
            "e", "ban cham", "ban chay", "huy", "huy don", "chenh lech"
        }
        if any(re.search(r"\b" + re.escape(kw) + r"\b", text) for kw in analytical_keywords):
            return False
        scored = self._scores(text, domain)
        return not scored or max(scored.values(), default=0) < 2

    def _scores(self, text: str, domain: str = "auto") -> Dict[str, int]:
        normalized = _normalize(text)
        words = normalized.split()
        scores: Dict[str, int] = {}
        for entity in self.entities:
            score = 0
            for synonym in entity.get("synonyms", []):
                term = _normalize(synonym)
                if not term:
                    continue
                term_words = term.split()
                # Exact phrase match (n-gram) gets highest score
                if len(term_words) > 1 and term in normalized:
                    score += len(term_words) * 3
                # Single word match
                elif len(term_words) == 1 and re.search(r"\b" + re.escape(term) + r"\b", normalized):
                    score += 2
            # Business name match
            bn = _normalize(entity["business_name"])
            if bn in normalized:
                score += 5
            # Domain boost
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
        vector_tables: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        text = f"{prompt} {context}".strip()
        scores = self._scores(text, domain)
        query_context = self.extract_query_context(text)
        ranked_ids = [item[0] for item in sorted(scores.items(), key=lambda item: (-item[1], item[0]))]

        # ── Boost entities from vector search tables if provided (Phase 2.1) ──
        if vector_tables:
            for vtable in vector_tables:
                for entity in self.entities:
                    if vtable in entity.get("tables", []) and entity["id"] not in ranked_ids:
                        ranked_ids.append(entity["id"])

        if not ranked_ids:
            ranked_ids = ["orders"]

        # ── Auto-inject entities based on query context ──

        # If user mentions cities/locations, ensure 'stores' entity is included
        if (query_context["cities"] or query_context["location_intent"]) and "stores" not in ranked_ids:
            ranked_ids.insert(1 if ranked_ids else 0, "stores")

        # If products are mentioned with location, ensure both are included
        if query_context["cities"] and "products" in ranked_ids and "order_items" not in ranked_ids:
            ranked_ids.append("order_items")

        # Standard auto-injection rules
        if "products" in ranked_ids and "order_items" not in ranked_ids:
            ranked_ids.append("order_items")
        if any(item in ranked_ids for item in ("products", "stores", "payments", "hourly", "customers", "promotions")) and "orders" not in ranked_ids:
            ranked_ids.append("orders")

        # ── Cross-domain auto-injections ──
        prompt_norm = _normalize(text)
        if any(kw in prompt_norm for kw in ["voucher", "khuyen mai", "giam gia", "uu dai", "chiet khau"]):
            if "promotions" not in ranked_ids:
                ranked_ids.append("promotions")
        if any(kw in prompt_norm for kw in ["ton kho", "ton", "het hang", "sap het", "kho hang"]):
            if "inventory" not in ranked_ids:
                ranked_ids.append("inventory")
        if any(kw in prompt_norm for kw in ["danh gia", "sao", "chat luong", "khen", "che", "review"]):
            if any(pk in prompt_norm for pk in ["mon", "san pham", "do uong", "nuoc", "banh"]):
                if "product_reviews" not in ranked_ids:
                    ranked_ids.append("product_reviews")
            else:
                if "store_reviews" not in ranked_ids:
                    ranked_ids.append("store_reviews")
        if any(kw in prompt_norm for kw in ["ca truc", "cham cong", "di tre", "dung gio", "nhan vien", "ca lam"]):
            if "staff_shifts" not in ranked_ids:
                ranked_ids.append("staff_shifts")
        if any(kw in prompt_norm for kw in ["thu ngan", "ket", "doi soat", "chenh lech", "tien mat he thong"]):
            if "cashier_reconciliation" not in ranked_ids:
                ranked_ids.append("cashier_reconciliation")
        if any(kw in prompt_norm for kw in ["yeu thich", "wishlist", "tha tim", "thich nhat"]):
            if "wishlist_favorites" not in ranked_ids:
                ranked_ids.append("wishlist_favorites")
        if any(kw in prompt_norm for kw in ["shipper", "giao hang", "tai xe", "chuyen giao"]):
            if "delivery" not in ranked_ids:
                ranked_ids.append("delivery")

        selected_ids = ranked_ids[:8]
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

        # Auto-inject chi_nhanh table if cities are mentioned
        if query_context["cities"] and "silver.chi_nhanh" not in tables and (not available or "silver.chi_nhanh" in available):
            tables.append("silver.chi_nhanh")

        return {
            "intent": selected[0]["id"],
            "prompt": prompt,
            "entities": selected,
            "entity_ids": [entity["id"] for entity in selected],
            "tables": tables,
            "metrics": metrics,
            "dimensions": dimensions,
            "relationships": relationships,
            "business_rules": self.catalog.get("business_rules", []),
            "scores": scores,
            "query_context": query_context,
        }

    def retrieve_few_shots(self, prompt: str, top_k: int = 5, intent: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Enhanced RAG Semantic Retriever: finds top_k most relevant Few-Shot
        Text-to-SQL examples using multi-signal scoring:
        - Token overlap (Jaccard)
        - N-gram matching (bigram + trigram)
        - Intent alignment bonus
        - Query structure similarity (Top N, geographic, comparison)
        """
        if not self.few_shot_examples:
            return []

        query_context = self.extract_query_context(prompt)
        normalized_query = _normalize(prompt)
        query_tokens = set(normalized_query.split())
        query_words = normalized_query.split()

        scored_examples = []
        for ex in self.few_shot_examples:
            ex_str = _normalize(ex.get("question", ""))
            ex_tokens = set(ex_str.split())

            # 1. Jaccard similarity
            intersection = len(query_tokens & ex_tokens)
            union = len(query_tokens | ex_tokens) or 1
            jaccard = intersection / union

            # 2. Bigram + Trigram bonus for precise phrase matching
            ngram_bonus = 0.0
            for i in range(len(query_words) - 1):
                bg = f"{query_words[i]} {query_words[i+1]}"
                if bg in ex_str:
                    ngram_bonus += 0.3
            for i in range(len(query_words) - 2):
                tg = f"{query_words[i]} {query_words[i+1]} {query_words[i+2]}"
                if tg in ex_str:
                    ngram_bonus += 0.5

            # 3. Intent alignment bonus
            intent_bonus = 0.0
            if intent and ex.get("intent") == intent:
                intent_bonus += 1.2

            # 4. Structural similarity bonus
            structural_bonus = 0.0
            ex_sql = (ex.get("sql") or "").lower()

            # Geographic filter similarity
            if query_context["cities"] and "thanh_pho" in ex_sql:
                structural_bonus += 0.6
            if query_context["cities"] and "chi_nhanh" in ex_sql:
                structural_bonus += 0.4
            if len(query_context["cities"]) > 1 and "partition by" in ex_sql:
                structural_bonus += 0.8

            # Top N similarity
            if query_context["top_n"] and "limit" in ex_sql:
                structural_bonus += 0.4

            # Comparison similarity
            if query_context["has_comparison"] and any(kw in ex_str for kw in ["so sanh", "vs", "giua", "va"]):
                structural_bonus += 0.5

            # Sort preference similarity
            if query_context["sort_preference"] == "DESC" and "desc" in ex_sql:
                structural_bonus += 0.2
            if query_context["sort_preference"] == "ASC" and "asc" in ex_sql:
                structural_bonus += 0.3

            # Tags matching bonus
            ex_tags = set(ex.get("tags", []))
            tag_bonus = 0.0
            if query_context["cities"] and "geographic" in ex_tags:
                tag_bonus += 0.6
            if len(query_context["cities"]) > 1 and "multi_city" in ex_tags:
                tag_bonus += 0.8
            if query_context["top_n"] and "top_n" in ex_tags:
                tag_bonus += 0.4
            if query_context["has_comparison"] and "comparison" in ex_tags:
                tag_bonus += 0.5

            score = jaccard + ngram_bonus + intent_bonus + structural_bonus + tag_bonus
            scored_examples.append((score, ex))

        scored_examples.sort(key=lambda x: -x[0])
        return [ex for score, ex in scored_examples[:top_k]]

    def llm_context(self, resolution: Dict[str, Any], metadata: Dict[str, Any], prompt: str = "") -> Dict[str, Any]:
        table_map = metadata.get("table_map", {})
        focused_set = set(resolution.get("tables", []))
        if not focused_set:
            focused_set = {"silver.don_hang", "silver.chi_nhanh"}

        # Only serialize physical columns for top 4 focused tables to keep prompt strictly < 2000 tokens
        focused_tables = [t for t in resolution.get("tables", []) if t in table_map][:4]
        if not focused_tables:
            focused_tables = [t for t in ["silver.don_hang", "silver.chi_tiet_don_hang", "silver.san_pham", "silver.chi_nhanh"] if t in table_map]

        physical = []
        for table_name in focused_tables:
            table = table_map.get(table_name)
            if not table:
                continue
            cat_table = self.silver_tables.get(table_name, {})
            physical.append({
                "qualified_name": table_name,
                "business_name": cat_table.get("business_name", table_name),
                "columns": [
                    {
                        "name": column["name"],
                        "data_type": column.get("data_type", "text"),
                    }
                    for column in table["columns"]
                    if not column.get("sensitive")
                ],
                "relationships": (cat_table.get("joins") or table.get("relationships", []))[:2],
            })

        # Build comprehensive policy mapping for all Silver tables
        full_policy = {}
        for tname, tdata in table_map.items():
            if tname.startswith("silver."):
                full_policy[tname] = {col["name"] for col in tdata.get("columns", []) if not col.get("sensitive")}

        # Compact reference for other silver tables (qualified name and key column)
        other_tables = {}
        for tname, tinfo in self.silver_tables.items():
            if tname not in focused_tables:
                p_key = list((tinfo.get("columns") or {}).keys())[:3]
                other_tables[tname] = f"{tinfo.get('business_name', tname)}: ({', '.join(p_key)})"

        # Retrieve 2 most relevant few-shot SQL examples
        few_shots = self.retrieve_few_shots(prompt, top_k=2, intent=resolution.get("intent")) if prompt else []
        query_context = resolution.get("query_context") or self.extract_query_context(prompt)

        return {
            "target_layer": "Silver (Tầng Dữ liệu Chuẩn hóa Lakehouse)",
            "semantic_entities": resolution.get("entities", []),
            "business_rules": resolution.get("business_rules", []),
            "enums": self.enums,
            "few_shot_examples": few_shots,
            "physical_metadata": physical,
            "other_tables": other_tables,
            "data_samples": self.data_samples,
            "query_context": query_context,
            "full_policy": full_policy,
        }


semantic_service = SemanticService()
