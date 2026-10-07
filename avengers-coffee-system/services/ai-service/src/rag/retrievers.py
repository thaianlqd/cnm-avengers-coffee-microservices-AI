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
        # Preference evidence is description content, never product-title taste.
        self.description_word = TfidfVectorizer(ngram_range=(1, 2), max_features=12000)
        self.description_matrix = self.description_word.fit_transform([normalize_text(d['content']) for d in docs])
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

    def concept_scores(self, concepts):
        """Directional query coverage avoids long-description cosine dilution.

        Every requested concept must have lexical evidence. Content cosine
        contributes relevance only after the required word coverage is met.
        Unknown query terms remain in the coverage denominator.
        """
        import numpy as np
        from sklearn.metrics.pairwise import cosine_similarity
        analyzer = self.description_word.build_analyzer()
        vocabulary = self.description_word.vocabulary_
        presence = self.description_matrix.astype(bool)
        components, coverage = [], []
        for concept in concepts:
            terms = set(analyzer(normalize_text(concept)))
            columns = [vocabulary[t] for t in terms if t in vocabulary]
            covered = (np.asarray(presence[:, columns].sum(axis=1)).ravel() / max(1, len(terms))
                       if columns else np.zeros(presence.shape[0]))
            relevance = cosine_similarity(self.description_word.transform([normalize_text(concept)]), self.description_matrix).ravel()
            coverage.append(covered)
            components.append(.8 * covered + .2 * relevance)
        covered = np.asarray(coverage)
        scores = .6 * np.min(components, axis=0) + .4 * np.mean(components, axis=0)
        scores[np.min(covered, axis=0) < .5] = 0
        return scores, covered
