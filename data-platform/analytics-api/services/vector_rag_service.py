"""Read-only hybrid retrieval with explicit vector availability and safe fallback.

Request handling never creates/seeds/truncates vector objects. Existing indexes
are optional suggestions and must agree with current physical column metadata.
"""

from __future__ import annotations
import json
import logging
import math
import os
import time
import requests
from db import get_db_conn, GEMINI_API_KEY
from services.analysis_catalog import AnalysisCatalog
from services.metadata_service import get_local_metadata, is_sensitive_column

logger = logging.getLogger("ai-vector-rag")
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 768


def get_embedding(text):
    if (
        os.getenv("AI_OFFLINE", "").lower() in ("1", "true", "yes")
        or not GEMINI_API_KEY
        or not text.strip()
    ):
        return None
    try:
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:embedContent",
            params={"key": GEMINI_API_KEY},
            json={
                "content": {"parts": [{"text": text[:3500]}]},
                "outputDimensionality": EMBEDDING_DIM,
            },
            timeout=12,
        )
        values = (
            response.json().get("embedding", {}).get("values") if response.ok else None
        )
        if (
            not isinstance(values, list)
            or len(values) != EMBEDDING_DIM
            or any(
                not isinstance(v, (int, float)) or not math.isfinite(v) for v in values
            )
            or not any(values)
        ):
            return None
        return values
    except Exception:
        logger.warning("Embedding unavailable; using lexical metadata retrieval")
        return None


class VectorRagService:
    def search_semantic_knowledge(
        self,
        user_prompt,
        top_k=5,
        physical_metadata=None,
        use_embeddings=False,
        catalog=None,
    ):
        started = time.perf_counter()
        catalog = catalog or AnalysisCatalog(
            physical_metadata or get_local_metadata(force=True)
        )
        scores = {}
        vector_status = "not_requested"
        attempts = 0
        if use_embeddings:
            attempts = int(
                bool(GEMINI_API_KEY)
                and os.getenv("AI_OFFLINE", "").lower() not in ("1", "true", "yes")
            )
            vector = get_embedding(user_prompt)
            vector_status = (
                "embedding_unavailable" if vector is None else "index_unavailable"
            )
            if vector is not None:
                conn = None
                try:
                    conn = get_db_conn()
                    conn.set_session(readonly=True, autocommit=False)
                    with conn.cursor() as cur:
                        cur.execute("SET LOCAL statement_timeout = 4000")
                        cur.execute(
                            """SELECT schema_name, table_name, columns_metadata,
                            1 - (embedding <=> %s::vector) AS similarity
                            FROM ai_agent.schema_catalog WHERE embedding IS NOT NULL
                            ORDER BY embedding <=> %s::vector LIMIT %s""",
                            (vector, vector, min(int(top_k) * 3, 30)),
                        )
                        entries = cur.fetchall()
                    for entry in entries:
                        name = entry["schema_name"] + "." + entry["table_name"]
                        if name not in catalog.tables:
                            continue
                        columns = entry["columns_metadata"]
                        if isinstance(columns, str):
                            columns = json.loads(columns)
                        indexed = {
                            (c["name"], c.get("type", c.get("data_type", "")))
                            for c in columns
                        }
                        physical = {
                            (c["name"], c.get("data_type", ""))
                            for c in catalog.tables[name]["columns"]
                        }
                        if indexed != physical:
                            continue  # stale vectors never ground migrated fields
                        score = float(entry["similarity"])
                        if math.isfinite(score):
                            scores[name] = max(0, min(1, score))
                    vector_status = "available" if scores else "no_compatible_vectors"
                except Exception:
                    logger.warning(
                        "Vector index unavailable; using current lexical metadata"
                    )
                finally:
                    if conn is not None:
                        conn.rollback()
                        conn.close()
        candidates = catalog.candidates(
            user_prompt, top_k, vector_scores=scores, vector_status=vector_status
        )
        names = list(
            dict.fromkeys(s["source"] for s in candidates["subjects"].values())
        )[:top_k]
        relationships = [
            e
            for e in catalog.edges
            if e["from_table"] in names and e["to_table"] in names
        ]
        details = [
            {
                "qualified_name": n,
                "columns": [
                    {"name": c["name"], "data_type": c.get("data_type")}
                    for c in catalog.tables[n]["columns"]
                    if not is_sensitive_column(c["name"])
                ],
                **({"vector_similarity": scores[n]} if n in scores else {}),
            }
            for n in names
        ]
        return {
            "top_tables": names,
            "table_details": details,
            "relationships": relationships,
            "candidates": candidates,
            "vector_status": vector_status,
            "embedding_call_count": attempts,
            "retrieval_strategy": (
                "hybrid" if scores else "lexical_business_column_relationship"
            ),
            "schema_fingerprint": catalog.fingerprint,
            "vector_context_text": json.dumps(details, ensure_ascii=False),
            "join_context_text": json.dumps(relationships, ensure_ascii=False),
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        }


vector_rag_service = VectorRagService()
