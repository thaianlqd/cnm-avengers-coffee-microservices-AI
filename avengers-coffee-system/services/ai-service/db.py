import os
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine


def get_db_engine() -> Engine:
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    user = os.getenv("DB_USER", "admin")
    password = os.getenv("DB_PASSWORD", "123")
    dbname = os.getenv("DB_NAME", "avengers_coffee")
    url = f"postgresql://{user}:{password}@{host}:{port}/{dbname}?sslmode=require"
    return create_engine(
        url,
        pool_size=1,
        max_overflow=2,
        pool_recycle=60,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10}
    )
