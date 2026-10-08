"""Bounded process-local counters; no customer text, identities or authority."""
from collections import Counter
from threading import Lock

_lock = Lock()
_counts = Counter()


def record(event, *, intents=(), reference_kinds=()):
    with _lock:
        _counts[event] += 1
        for intent in set(intents):
            _counts[f'{event}:intent:{intent}'] += 1
        for kind in set(reference_kinds):
            _counts[f'{event}:reference:{kind}'] += 1


def snapshot():
    with _lock:
        return dict(_counts)


def reset():
    with _lock:
        _counts.clear()
