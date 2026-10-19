"""Governed event observability publisher; no canonical fact writes or CDC claim."""
import json
import logging
import os
from pathlib import Path
import signal
import time

import psycopg2
from kafka import KafkaProducer
from producer_runtime import json_value, poll_stream

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('kafka-producer')
running = True


LOCK_NOT_AVAILABLE = '55P03'  # lock_timeout while a replica cycle owns the table
MAX_LOCK_WAITS = 5


def stop(sig, frame):
    global running
    running = False


def get_db_conn(*, writer=False):
    credentials=None
    if os.getenv('DATA_PLATFORM_GOVERNED_STREAMING','0')=='1':
        from pipeline_runtime import private_database_profile
        credentials=private_database_profile()
    def setting(name, default=None):
        return os.getenv('STATE_DB_'+name, os.getenv('DB_'+name, default)) if writer else os.getenv('DB_'+name, default)
    connection = psycopg2.connect(host=setting('HOST', 'postgres-analytics'), port=int(setting('PORT', '5432')),
        user=credentials[0] if credentials else setting('USER', 'analytics'),
        password=credentials[1] if credentials else setting('PASSWORD'), dbname=setting('NAME', 'analytics'),
        sslmode=setting('SSLMODE', 'disable'), connect_timeout=3,
        options='-c statement_timeout=15000 -c lock_timeout=3000')
    if not writer:
        connection.set_session(readonly=True, isolation_level='REPEATABLE READ')
    return connection


def create_producer():
    return KafkaProducer(bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'kafka:9092'),
        value_serializer=lambda value: json.dumps(json_value(value), ensure_ascii=False, allow_nan=False,
                                                  sort_keys=True, separators=(',', ':')).encode(),
        key_serializer=lambda key: key.encode(), acks='all', retries=2, max_block_ms=2000,
        request_timeout_ms=5000, retry_backoff_ms=200, max_in_flight_requests_per_connection=1)


def contracts():
    root = Path(os.getenv('DATA_PLATFORM_DATA_CONTRACTS_PATH', '/opt/data-platform-metadata/data_contracts.json')).parent
    value = json.loads((root / 'stream_contracts.json').read_text())
    if value.get('version') != '3.4.0' or not value.get('streams'):
        raise ValueError('Reviewed stream contract required')
    return value['streams']


def fetch_and_publish(producer, source, state_connection):
    result = []
    deadline = time.monotonic()+45
    for contract in contracts():
        result.append(poll_stream(producer, source, state_connection, contract, deadline=deadline))
    return result


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    if os.getenv('DATA_PLATFORM_GOVERNED_STREAMING','0')!='1':
        logger.info('Streaming standby: rollout disabled; no source, state or Kafka connections')
        while running:time.sleep(0.5)
        return
    from pipeline_runtime import private_database_profile
    private_database_profile()  # Fail before Kafka/source I/O if credentials are not provisioned.
    producer = source = state_connection = None
    try:
        producer = create_producer()
        source, state_connection = get_db_conn(), get_db_conn(writer=True)
        interval = max(1, min(300, int(os.getenv('POLL_INTERVAL_SECONDS', '60'))))
        lock_waits = 0
        while running:
            try:
                results = fetch_and_publish(producer, source, state_connection)
                lock_waits = 0
                logger.info('Poll: published=%d pending_streams=%d completeness=unknown',
                    sum(item['published'] for item in results), sum(item['has_more'] for item in results))
            except Exception as error:
                source.rollback()
                state_connection.rollback()
                logger.error('Publisher cursor preserved: %s', type(error).__name__)
                # Replica TRUNCATE+INSERT briefly holds table locks; wait and retry a bounded
                # number of times instead of restarting. Cursor/offsets are never reset.
                lock_waits += 1
                if getattr(error, 'pgcode', None) != LOCK_NOT_AVAILABLE or lock_waits > MAX_LOCK_WAITS:
                    raise
                logger.warning('Source lock busy (%d/%d); retrying after backoff', lock_waits, MAX_LOCK_WAITS)
                end = time.monotonic()+min(30, 2**lock_waits)
                while running and time.monotonic() < end:
                    time.sleep(0.5)
                continue
            end = time.monotonic()+(1 if any(item['has_more'] for item in results) else interval)
            while running and time.monotonic() < end:
                time.sleep(min(0.5, max(0, end-time.monotonic())))
    finally:
        if source is not None: source.close()
        if state_connection is not None: state_connection.close()
        if producer is not None: producer.close(timeout=5)


if __name__ == '__main__':
    main()
