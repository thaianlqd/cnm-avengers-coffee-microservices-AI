import os
from functools import lru_cache
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.engine import URL


def get_db_engine() -> Engine:
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    user = os.getenv("DB_USER", "admin")
    password = os.getenv("DB_PASSWORD", "123")
    dbname = os.getenv("DB_NAME", "avengers_coffee")
    return _pooled_engine(host, port, user, password, dbname, os.getenv("PGSSLMODE", "require"))


@lru_cache(maxsize=4)
def _pooled_engine(host, port, user, password, dbname, sslmode="require") -> Engine:
    # Reuse connections, never query results. Engines/pools are thread safe;
    # pre-ping still detects disconnected connections before each checkout.
    url = URL.create("postgresql", username=user, password=password,
                     host=host, port=int(port), database=dbname,
                     query={"sslmode": sslmode})
    return create_engine(
        url,
        pool_size=1,
        max_overflow=2,
        pool_recycle=60,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10}
    )
