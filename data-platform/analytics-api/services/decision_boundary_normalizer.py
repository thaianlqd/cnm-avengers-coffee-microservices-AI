"""Small, value-preserving compatibility at the model JSON boundary.

No prompt, catalog, grounding or SQL belongs here. Optional operations are
normalized independently so their rejection cannot abort mandatory work.
"""

from copy import deepcopy
from services.analytical_tool_contract import ToolContractError, issue


FILTER_RULES = frozenset({"filter_field_to_dimension", "redundant_filter_field_removed"})


def normalize_operation(raw):
    if not isinstance(raw, dict):
        raise ToolContractError([issue("contract", "invalid_analysis_shape")])
    filters = raw.get("filters")
    if isinstance(filters, list) and len(filters) > 12:
        raise ToolContractError([issue("filters", "invalid_range")])
    data = deepcopy(raw)
    rules = []
    filters = data.get("filters")
    if isinstance(filters, list):
        for item in filters:
            if not isinstance(item, dict) or "field" not in item:
                continue
            if "dimension" not in item:
                item["dimension"] = item.pop("field")
                rules.append("filter_field_to_dimension")
            elif type(item["field"]) is type(item["dimension"]) and item["field"] == item["dimension"]:
                item.pop("field")
                rules.append("redundant_filter_field_removed")
            else:
                raise ToolContractError([issue("filters.dimension", "conflicting_filter_dimension")])
    return data, rules
