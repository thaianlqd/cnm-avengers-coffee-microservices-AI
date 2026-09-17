from typing import Dict, Any, List

from .branch_tools import (
    TOOL_ASK_BRANCH, execute_ask_branch,
    TOOL_FIND_NEAREST_BRANCH, execute_find_nearest_branch,
    TOOL_SET_SESSION_BRANCH, execute_set_session_branch
)
from .product_tools import (
    TOOL_GET_PRODUCT_OPTIONS, execute_get_product_options,
    TOOL_CHECK_PRICE_AND_STOCK, execute_check_price_and_stock,
    TOOL_GET_PRODUCT_INSIGHTS, execute_get_product_insights,
    TOOL_GET_RECOMMENDATIONS, execute_get_recommendations
)
from .cart_tools import (
    TOOL_ADD_TO_CART, execute_add_to_cart,
    TOOL_GET_CART, execute_get_cart,
    TOOL_REQUEST_CHECKOUT, execute_request_checkout,
    TOOL_CONFIRM_CHECKOUT, execute_confirm_checkout
)
from .order_tools import (
    TOOL_TRACK_ORDER_STATUS, execute_track_order_status,
    TOOL_GET_ORDER_HISTORY, execute_get_order_history,
    TOOL_GET_ORDER_DETAILS, execute_get_order_details,
    TOOL_CANCEL_ORDER, execute_cancel_order,
    TOOL_UPDATE_ORDER, execute_update_order
)
from .user_tools import (
    TOOL_GET_USER_PREFERENCES, execute_get_user_preferences,
    TOOL_GET_USER_PROFILE, execute_get_user_profile
)
from .knowledge_tools import (
    TOOL_SEARCH_KNOWLEDGE_BASE, execute_search_knowledge_base
)

ALL_TOOL_SCHEMAS: List[Dict[str, Any]] = [
    TOOL_ASK_BRANCH,
    TOOL_FIND_NEAREST_BRANCH,
    TOOL_SET_SESSION_BRANCH,
    TOOL_GET_PRODUCT_OPTIONS,
    TOOL_CHECK_PRICE_AND_STOCK,
    TOOL_GET_PRODUCT_INSIGHTS,
    TOOL_ADD_TO_CART,
    TOOL_GET_CART,
    TOOL_REQUEST_CHECKOUT,
    TOOL_CONFIRM_CHECKOUT,
    TOOL_SEARCH_KNOWLEDGE_BASE,
    TOOL_GET_RECOMMENDATIONS,
    TOOL_TRACK_ORDER_STATUS,
    TOOL_GET_ORDER_HISTORY,
    TOOL_GET_ORDER_DETAILS,
    TOOL_CANCEL_ORDER,
    TOOL_GET_USER_PREFERENCES,
    TOOL_GET_USER_PROFILE,
    TOOL_UPDATE_ORDER,
]

# Dispatch map: tool_name -> executor function
# Backend injection for session_id via lambda args, session_id
TOOL_EXECUTORS = {
    "ask_branch": lambda args, session_id: execute_ask_branch(),
    "find_nearest_branch": lambda args, session_id: execute_find_nearest_branch(session_id=session_id, **args),
    "set_session_branch": lambda args, session_id: execute_set_session_branch(session_id=session_id, **args),
    "get_product_options": lambda args, session_id: execute_get_product_options(**args),
    "check_price_and_stock": lambda args, session_id: execute_check_price_and_stock(**args),
    "get_product_insights": lambda args, session_id: execute_get_product_insights(**args),
    "add_to_cart": lambda args, session_id: execute_add_to_cart(session_id=session_id, **args),
    "get_cart": lambda args, session_id: execute_get_cart(session_id=session_id),
    "request_checkout": lambda args, session_id: execute_request_checkout(session_id=session_id, **args),
    "confirm_checkout": lambda args, session_id: execute_confirm_checkout(session_id=session_id, **args),
    "search_knowledge_base": lambda args, session_id: execute_search_knowledge_base(**args),
    "get_recommendations": lambda args, session_id: execute_get_recommendations(**args),
    "track_order_status": lambda args, session_id: execute_track_order_status(session_id=session_id, **args),
    "get_order_history": lambda args, session_id: execute_get_order_history(session_id=session_id),
    "get_order_details": lambda args, session_id: execute_get_order_details(session_id=session_id, **args),
    "cancel_order": lambda args, session_id: execute_cancel_order(session_id=session_id, **args),
    "update_order": lambda args, session_id: execute_update_order(session_id=session_id, **args),
    "get_user_preferences": lambda args, session_id: execute_get_user_preferences(session_id=session_id),
    "get_user_profile": lambda args, session_id: execute_get_user_profile(session_id=session_id),
}
