from src.agents.tier1 import classify_order_intent


def test_cart_quantity_language_never_routes_to_existing_order():
    intent = classify_order_intent("cho số lượng Bánh Trung Thu Matcha trong giỏ về 1")
    assert intent == {"intent": "SET_QUANTITY", "quantity": 1}


def test_product_review_is_not_mistaken_for_cart_price():
    assert classify_order_intent("cho tôi xem đánh giá Bạc Xỉu") == {"intent": "BROWSING"}


def test_matcha_browse_with_dung_does_not_become_voucher_intent():
    assert classify_order_intent(
        "ngoài món đang có, hiển thị đúng các món nào về matcha nhé"
    ) == {"intent": "BROWSING"}
    assert classify_order_intent("áp dụng mã tốt nhất cho tôi") == {"intent": "SELECT_VOUCHER"}


def test_history_edit_requires_explicit_order_context():
    assert classify_order_intent("sửa đơn hàng mã 123") == {"intent": "UPDATE_EXISTING_ORDER"}


def test_topping_spelling_survives_confirmation_normalization():
    assert classify_order_intent("đổi topping của món nước trong giỏ") == {"intent": "EDIT_OPTIONS"}


def test_add_with_quantity_never_updates_the_previous_cart_focus():
    assert classify_order_intent("oke thêm cho tôi đi số lượng 2 cái nhé") == {
        "intent": "ADD_ITEM",
        "quantity": 2,
    }
    assert classify_order_intent("cho tôi thêm món bánh số 4 vào giỏ nhé") == {
        "intent": "ADD_ITEM",
        "quantity": 1,
    }
    assert classify_order_intent("cho tôi bánh số 3 số lượng 2 cái nhé") == {
        "intent": "ADD_ITEM",
        "quantity": 2,
    }


def test_numbered_selection_without_add_verb_is_still_a_canonical_add():
    assert classify_order_intent("cho tôi món số 2 nhé") == {
        "intent": "ADD_ITEM",
        "quantity": 1,
    }


def test_category_numbered_selection_is_an_add_without_the_word_mon():
    assert classify_order_intent("cho tôi nước số 1 và bánh số 2 đi") == {
        "intent": "ADD_ITEM",
        "quantity": 1,
    }


def test_broad_cake_and_drink_purchase_request_starts_a_menu_browse():
    assert classify_order_intent("tôi muốn mua bánh và nước") == {"intent": "BROWSING"}


def test_named_absolute_quantity_correction_routes_to_cart_update():
    assert classify_order_intent("cho tôi bánh trung thu cà phê 1 cái thôi") == {
        "intent": "SET_QUANTITY",
        "quantity": 1,
    }


def test_browse_more_is_not_an_add_to_cart_command():
    assert classify_order_intent("có nhé, cho tôi xem thêm các món bánh Trung Thu đi") == {
        "intent": "BROWSING",
    }


def test_checkout_language_finishes_cart_before_fulfillment():
    assert classify_order_intent("tiến hành đặt hàng đi") == {"intent": "FINISH_CART"}
    assert classify_order_intent("như giỏ hiện tại cũng được") == {"intent": "FINISH_CART"}
    assert classify_order_intent("tôi không thêm gì nữa, cho vào giỏ hàng đi") == {"intent": "FINISH_CART"}
