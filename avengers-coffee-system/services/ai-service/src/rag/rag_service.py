"""
rag_service.py
--------------
Phase 2: RAG (Retrieval-Augmented Generation) System cho Avengers Coffee AI.

Dùng TF-IDF (scikit-learn) để index và tìm kiếm các đoạn tài liệu liên quan
đến câu hỏi của khách hàng. Nhẹ, không cần GPU, không cần thêm dependency.

Cách dùng:
    rag = RAGService()
    rag.load()
    context = rag.retrieve("chính sách đổi trả như thế nào")
    # => trả về đoạn văn bản liên quan nhất để nhét vào system prompt
"""
import json
import logging
import unicodedata
import re
import logging
from typing import List, Optional
from src.rag.data_ingestion import load_all_rag_data

logger = logging.getLogger(__name__)


def _normalize_text(text: str) -> str:
    """Bỏ dấu tiếng Việt + lowercase để TF-IDF hoạt động tốt hơn với tiếng Việt."""
    nfd = unicodedata.normalize("NFD", text.lower())
    no_accent = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", no_accent).strip()


class RAGService:
    """
    Hệ thống RAG đơn giản dùng TF-IDF cosine similarity.
    
    - Không cần ChromaDB hay sentence-transformers (tránh tốn RAM).
    - Khởi động trong < 1 giây, phù hợp với môi trường Docker bị giới hạn.
    - Hỗ trợ tiếng Việt bằng cách chuẩn hóa (bỏ dấu) trước khi index.
    """

    def __init__(self):
        self._docs: List[dict] = []
        self._corpus: List[str] = []
        self._vectorizer = None
        self._tfidf_matrix = None
        self._loaded = False

    def load(self) -> None:
        """Nạp knowledge base và build TF-IDF index."""
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            import numpy as np

            # Lấy dữ liệu từ data_ingestion (Cả tĩnh và DB)
            docs = load_all_rag_data()

            if not docs:
                logger.warning("[RAG] No documents loaded. RAG disabled.")
                return

            self._docs = docs
            # Kết hợp title + content để tăng độ chính xác khi match
            self._corpus = [
                _normalize_text(f"{d['title']} {d['title']} {d['content']}")
                for d in docs
            ]

            self._vectorizer = TfidfVectorizer(
                ngram_range=(1, 2),  # Unigram + bigram cho tiếng Việt
                min_df=1,
                max_features=5000,
            )
            self._tfidf_matrix = self._vectorizer.fit_transform(self._corpus)
            self._loaded = True
            logger.info("[RAG] Knowledge base loaded: %d documents indexed.", len(docs))

        except ImportError:
            logger.warning("[RAG] scikit-learn not available. RAG disabled.")
        except Exception as e:
            logger.error("[RAG] Failed to load knowledge base: %s", e)

    def retrieve(self, query: str, top_k: int = 3, min_score: float = 0.05) -> str:
        """
        Tìm top_k đoạn tài liệu liên quan nhất với query.
        
        Args:
            query:     Câu hỏi/nội dung cần tìm kiếm.
            top_k:     Số đoạn tài liệu trả về (mặc định 3).
            min_score: Ngưỡng tương đồng tối thiểu (0.0 - 1.0).
        
        Returns:
            Chuỗi văn bản tổng hợp các đoạn liên quan nhất, sẵn sàng nhét vào prompt.
            Trả về chuỗi rỗng nếu không tìm thấy gì liên quan.
        """
        if not self._loaded or self._vectorizer is None:
            return ""

        try:
            from sklearn.metrics.pairwise import cosine_similarity
            import numpy as np

            query_norm = _normalize_text(query)
            query_vec = self._vectorizer.transform([query_norm])
            scores = cosine_similarity(query_vec, self._tfidf_matrix).flatten()

            # Lấy top_k doc có điểm cao nhất và vượt ngưỡng min_score
            top_indices = scores.argsort()[::-1][:top_k]
            results = []
            for idx in top_indices:
                if scores[idx] >= min_score:
                    doc = self._docs[idx]
                    results.append(f"[{doc['title']}] {doc['content']}")

            if results:
                return "\n\n".join(results)
            return ""

        except Exception as e:
            logger.warning("[RAG] retrieve error: %s", e)
            return ""

    def search(self, query: str, top_k: int = 3) -> List[dict]:
        """
        Tìm kiếm và trả về list các document (dùng cho tool API response).
        """
        if not self._loaded or self._vectorizer is None:
            return []

        try:
            from sklearn.metrics.pairwise import cosine_similarity

            query_norm = _normalize_text(query)
            query_vec = self._vectorizer.transform([query_norm])
            scores = cosine_similarity(query_vec, self._tfidf_matrix).flatten()

            top_indices = scores.argsort()[::-1][:top_k]
            results = []
            logger.info("[RAG] Debug search for query: '%s'", query)
            for idx in top_indices:
                doc = self._docs[idx]
                score = round(float(scores[idx]), 3)
                logger.info("[RAG] Score=%.3f | Title=%s | Content=%s", score, doc['title'], doc['content'][:50])
                if score >= 0.05:
                    results.append({
                        "id": doc["id"],
                        "title": doc["title"],
                        "content": doc["content"],
                        "score": score,
                    })
            
            logger.info("[RAG] search returning %d results", len(results))
            return results

        except Exception as e:
            logger.warning("[RAG] search error: %s", e)
            return []

    @property
    def is_loaded(self) -> bool:
        return self._loaded


# ── Singleton instance ────────────────────────────────────────────────────────
_rag_instance: Optional[RAGService] = None


def get_rag_service() -> RAGService:
    """Trả về singleton RAGService, lazy-init nếu chưa load."""
    global _rag_instance
    if _rag_instance is None:
        _rag_instance = RAGService()
        _rag_instance.load()
    return _rag_instance
