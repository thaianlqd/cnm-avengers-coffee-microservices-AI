"""Replaceable sparse backend: word relevance with bounded typo assistance."""
from typing import Protocol
import logging
from src.rag.documents import normalize_text


class Retriever(Protocol):
    name: str

    def scores(self, query: str): ...


class SparseRetriever:
    name = 'tfidf_word_char'

    def __init__(self, docs):
        from sklearn.feature_extraction.text import TfidfVectorizer
        corpus = [normalize_text(f"{d['title']} {d['title']} {d.get('section_title') or ''} {' '.join(d['tags'])} {d['content']}")
                  for d in docs]
        self.word = TfidfVectorizer(ngram_range=(1, 2), max_features=12000)
        self.word_matrix = self.word.fit_transform(corpus)
        self.char = None
        try:
            char = TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5), max_features=20000)
            self.char_matrix = char.fit_transform(corpus)
            self.char = char
        except Exception as exc:
            self.name = 'tfidf_word'
            logging.getLogger(__name__).warning('[RAG backend] character index unavailable error_type=%s', type(exc).__name__)

    def scores(self, query):
        from sklearn.metrics.pairwise import cosine_similarity
        query = normalize_text(query)
        word = cosine_similarity(self.word.transform([query]), self.word_matrix).ravel()
        if self.char is None:
            return word
        char = cosine_similarity(self.char.transform([query]), self.char_matrix).ravel()
        return .8 * word + .2 * char
