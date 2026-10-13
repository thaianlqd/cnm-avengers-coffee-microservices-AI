from unittest.mock import MagicMock
import pytest
from fastapi import HTTPException
import main
from src.common import db


def test_db_url_escapes_password_and_honors_ssl(monkeypatch):
    factory = MagicMock()
    monkeypatch.setattr(db, 'create_engine', factory)
    db._pooled_engine.cache_clear()
    db._pooled_engine('synthetic-host', '5432', 'synthetic-user', 'synthetic:@/password', 'synthetic-db', 'disable')
    url = factory.call_args.args[0]
    assert url.password == 'synthetic:@/password'
    assert url.query['sslmode'] == 'disable'
    assert factory.call_args.kwargs['pool_size'] == 1
    db._pooled_engine.cache_clear()


def test_get_db_engine_preserves_default_ssl(monkeypatch):
    factory = MagicMock()
    monkeypatch.setattr(db, '_pooled_engine', factory)
    monkeypatch.delenv('PGSSLMODE', raising=False)
    db.get_db_engine()
    assert factory.call_args.args[-1] == 'require'
    monkeypatch.setenv('PGSSLMODE', 'disable')
    db.get_db_engine()
    assert factory.call_args.args[-1] == 'disable'


def test_live_never_calls_database_or_provider(monkeypatch):
    import psycopg2
    connect = MagicMock(side_effect=AssertionError('liveness must not connect'))
    monkeypatch.setattr(psycopg2, 'connect', connect)
    assert main.health_live() == {'status': 'ok'}
    connect.assert_not_called()


def test_ready_only_reads_and_closes_connection(monkeypatch):
    import psycopg2
    connection = MagicMock()
    connect = MagicMock(return_value=connection)
    monkeypatch.setattr(psycopg2, 'connect', connect)
    monkeypatch.setenv('PGSSLMODE', 'disable')
    assert main.health_ready() == {'status': 'ok'}
    connection.cursor.return_value.__enter__.return_value.execute.assert_called_once_with('SELECT 1')
    connection.close.assert_called_once()
    assert connect.call_args.kwargs['connect_timeout'] == 2
    assert connect.call_args.kwargs['options'] == '-c statement_timeout=1000'
    assert connect.call_args.kwargs['sslmode'] == 'disable'


def test_ready_connection_failure_returns_redacted_503(monkeypatch):
    import psycopg2
    monkeypatch.setattr(psycopg2, 'connect', MagicMock(side_effect=Exception('synthetic-secret')))
    with pytest.raises(HTTPException) as error:
        main.health_ready()
    assert error.value.status_code == 503
    assert error.value.detail == 'not_ready'


def test_ready_query_failure_still_closes_connection(monkeypatch):
    import psycopg2
    connection = MagicMock()
    connection.cursor.return_value.__enter__.return_value.execute.side_effect = Exception('synthetic-secret')
    monkeypatch.setattr(psycopg2, 'connect', MagicMock(return_value=connection))
    with pytest.raises(HTTPException):
        main.health_ready()
    connection.close.assert_called_once()


def test_demo_startup_never_opens_database_or_initializes_storage(monkeypatch):
    import asyncio
    monkeypatch.setenv('K8S_DEMO_READ_ONLY', 'true')
    engine = MagicMock(side_effect=AssertionError('demo must not initialize storage/training'))
    monkeypatch.setattr(main, 'get_db_engine', engine)
    async def startup():
        async with main.lifespan(main.app):
            pass
    asyncio.run(startup())
    engine.assert_not_called()
