"""Branch stock wording must agree with strict Order Service checkout."""
import pytest

from src.function_calling.tools import product_tools


@pytest.mark.parametrize(
    "branch,stock,quantity,expected_code,expected_in_stock",
    [
        ("Chưa chọn", None, 1, "UNKNOWN_BRANCH", None),
        (None, None, 1, "UNKNOWN_BRANCH", None),
        ("BR-1", None, 1, "UNVERIFIED_STOCK", None),
        ("BR-1", {"so_luong_ton": 3, "dang_kinh_doanh": True}, 2, "AVAILABLE", True),
        ("BR-1", {"so_luong_ton": 1, "dang_kinh_doanh": True}, 2, "INSUFFICIENT_QUANTITY", False),
        ("BR-1", {"so_luong_ton": 3, "dang_kinh_doanh": False}, 1, "PRODUCT_DISABLED", False),
    ],
)
def test_product_stock_is_verified_only_from_branch_row(monkeypatch, branch, stock, quantity, expected_code, expected_in_stock):
    class Result:
        def __init__(self, value):
            self.value = value

        def mappings(self):
            return self

        def all(self):
            return [self.value]

        def first(self):
            return self.value

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, _params):
            sql = str(statement)
            if "ton_kho_san_pham" in sql:
                return Result(stock)
            return Result({"product_id": "12", "ten_san_pham": "Matcha Latte", "gia_ban": 49000, "category": "Đồ uống"})

    class Engine:
        def connect(self):
            return Connection()

    monkeypatch.setattr(product_tools, "_get_engine", lambda: Engine())
    result = product_tools.execute_check_price_and_stock(
        "Matcha Latte", branch_id=branch, quantity=quantity,
    )
    assert result["status"] == "ok"
    product = result["products"][0]
    assert product["availability_code"] == expected_code
    assert product["in_stock"] is expected_in_stock
    if stock is None:
        assert product["availability_status"] != "available"
