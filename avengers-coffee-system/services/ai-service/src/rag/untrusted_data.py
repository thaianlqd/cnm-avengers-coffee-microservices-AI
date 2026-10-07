"""Shared projection of retrieval/review data; never an intent interpreter."""
from copy import deepcopy
import re
from src.rag.documents import normalize_text

_UNSAFE = re.compile(
    r'ignore\s+(?:all\s+)?(?:previous|system)\s+instructions|bo qua.*(?:chi dan|huong dan).*truoc|'
    r'system\s*prompt|api[_ ]?key|access[_ ]?token|password|(?:reveal|expose).*secret', re.I)


def safe_evidence_text(value):
    if not isinstance(value, str) or _UNSAFE.search(normalize_text(value)):
        return False
    from src.function_calling.tools import ALL_TOOL_SCHEMAS
    from src.agents.semantic_registry import operation_registry
    names = [row['function']['name'] for row in ALL_TOOL_SCHEMAS] + list(operation_registry())
    return not any(re.search(r'(?<!\w)' + re.escape(name) + r'(?!\w)', value, re.I) for name in names)


def safe_review_result(result):
    """Filter instruction-shaped comments; retain ratings and legitimate text."""
    result = deepcopy(result)
    def clean(node):
        if isinstance(node, dict):
            for key, value in list(node.items()):
                if key == 'recent_comments' and isinstance(value, list):
                    node[key] = [text for text in value if safe_evidence_text(text)]
                elif key == 'reviews' and isinstance(value, list):
                    node[key] = [row for row in value if not isinstance(row, dict)
                        or all(safe_evidence_text(row[field]) for field in ('comment', 'binh_luan', 'nhan_xet') if field in row)]
                    clean(node[key])
                else:
                    clean(value)
        elif isinstance(node, list):
            for row in node:
                clean(row)
    clean(result)
    return result
