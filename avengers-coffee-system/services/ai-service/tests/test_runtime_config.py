import pytest

from src.common.runtime_config import secret_with_dev_default


def test_development_secret_default_is_explicit(monkeypatch):
    monkeypatch.setenv("NODE_ENV", "test")
    monkeypatch.delenv("TEST_RUNTIME_SECRET", raising=False)
    assert secret_with_dev_default("TEST_RUNTIME_SECRET", "test-only") == "test-only"


def test_missing_production_secret_fails_fast(monkeypatch):
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("TEST_RUNTIME_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="TEST_RUNTIME_SECRET"):
        secret_with_dev_default("TEST_RUNTIME_SECRET", "test-only")
