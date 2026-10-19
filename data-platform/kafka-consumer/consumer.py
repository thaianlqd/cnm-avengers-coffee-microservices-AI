"""Kafka -> immutable Bronze (required), PostgreSQL event projection (replayable)."""
import logging
import os
import signal
import time

import boto3
from botocore.config import Config
import psycopg2
from kafka import KafkaConsumer, TopicPartition
from kafka.structs import OffsetAndMetadata
from kafka.errors import NoBrokersAvailable

from stream_runtime import broker_record, flush_records, project_records

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s - %(message)s')
logger = logging.getLogger('kafka-consumer')
TOPICS = ['orders-events', 'order-items-events', 'shipper-events']
BRONZE_BUCKET = 'avengers-bronze'
BATCH_SIZE = max(1, min(100, int(os.getenv('BATCH_SIZE', '50'))))
FLUSH_INTERVAL = max(1, min(30, int(os.getenv('FLUSH_INTERVAL_SECONDS', '15'))))
running = True


def signal_handler(sig, frame):
    global running
    running = False


def get_db_conn():
    try:
        credentials=None
        if os.getenv('DATA_PLATFORM_GOVERNED_STREAMING','0')=='1':
            from pipeline_runtime import private_database_profile
            credentials=private_database_profile()
        return psycopg2.connect(host=os.getenv('DB_HOST', 'postgres-analytics'),
            port=int(os.getenv('DB_PORT', '5432')), user=credentials[0] if credentials else os.getenv('DB_USER', 'analytics'),
            password=credentials[1] if credentials else os.environ['DB_PASSWORD'], dbname=os.getenv('DB_NAME', 'analytics'),
            connect_timeout=3, options='-c statement_timeout=10000 -c lock_timeout=3000',
            sslmode=os.getenv('DB_SSLMODE', 'disable'))
    except Exception as error:
        logger.warning('Projection unavailable: %s', type(error).__name__)
        return None


def get_minio():
    return boto3.client('s3', endpoint_url=os.getenv('MINIO_ENDPOINT', 'http://minio:9000'),
        aws_access_key_id=os.environ['MINIO_ACCESS_KEY'], aws_secret_access_key=os.environ['MINIO_SECRET_KEY'],
        config=Config(signature_version='s3v4', connect_timeout=2, read_timeout=5,
                      retries={'mode': 'standard', 'total_max_attempts': 3}))


def create_consumer():
    deadline = time.monotonic()+60
    while running:
        try:
            return KafkaConsumer(*TOPICS, bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'kafka:9092'),
                group_id=os.getenv('KAFKA_GROUP_ID', 'avengers-bronze-consumer'),
                auto_offset_reset='earliest', enable_auto_commit=False,
                max_poll_records=BATCH_SIZE, max_poll_interval_ms=300000,
                request_timeout_ms=30000, api_version_auto_timeout_ms=3000)
        except NoBrokersAvailable:
            if time.monotonic() >= deadline:
                raise
            time.sleep(2)
    return None


def flush_batch(batch, db_conn, s3_client, consumer):
    def commit(positions):
        consumer.commit({TopicPartition(*tp): OffsetAndMetadata(offset, '') for tp, offset in positions.items()})
    result = flush_records(batch, s3_client, BRONZE_BUCKET, commit,
                           project=lambda records: project_records(db_conn, records))
    logger.info('Stream flush: rows=%d quarantined=%d projection=%s',
                result['records'], result['quarantined'], result['projection'])
    return result


def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    if os.getenv('DATA_PLATFORM_GOVERNED_STREAMING','0')!='1':
        logger.info('Streaming standby: rollout disabled; no MinIO, Kafka or projection connections')
        while running:time.sleep(0.5)
        return
    from pipeline_runtime import private_database_profile
    private_database_profile()  # Provision explicitly before reading broker/object storage.
    s3 = get_minio()
    # Deployment creates buckets. Missing Bronze fails before consumption.
    s3.head_bucket(Bucket=BRONZE_BUCKET)
    consumer, connection = None, None
    failed = False
    buffer = []
    try:
        consumer = create_consumer()
        if consumer is None:
            return
        connection = get_db_conn()
        last_flush = time.monotonic()
        while running:
            batches = consumer.poll(timeout_ms=1000, max_records=BATCH_SIZE)
            for messages in batches.values():
                for message in messages:
                    buffer.append(broker_record(message.topic, message.partition, message.offset,
                                                message.value or b'', message.key))
            if buffer and (len(buffer) >= BATCH_SIZE or time.monotonic()-last_flush >= FLUSH_INTERVAL):
                flush_batch(buffer, connection, s3, consumer)
                buffer.clear()
                last_flush = time.monotonic()
            if connection is None or connection.closed:
                connection = get_db_conn()
    except Exception as error:
        failed = True
        logger.error('Stream stopped with offsets preserved: %s', type(error).__name__)
        raise
    finally:
        try:
            if buffer and consumer is not None and not failed:
                flush_batch(buffer, connection, s3, consumer)
        finally:
            if consumer is not None:
                consumer.close(autocommit=False)
            if connection is not None and not connection.closed:
                connection.close()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replay-topic', choices=TOPICS)
    parser.add_argument('--partition', type=int)
    parser.add_argument('--first-offset', type=int)
    parser.add_argument('--last-offset', type=int)
    args = parser.parse_args()
    if args.replay_topic:
        from stream_runtime import read_bronze_record
        if (args.partition is None or args.first_offset is None or args.last_offset is None
                or args.partition < 0 or args.first_offset < 0
                or not 0 <= args.last_offset-args.first_offset < 1000):
            parser.error('Replay requires an explicit partition and inclusive range of at most 1000 offsets')
        client, connection = get_minio(), get_db_conn()
        if connection is None: raise RuntimeError('Replay projection database unavailable')
        try:
            records, total, deadline = [], 0, time.monotonic()+60
            for offset in range(args.first_offset,args.last_offset+1):
                if time.monotonic() >= deadline: raise TimeoutError('Projection replay deadline exhausted; retry is idempotent')
                try:
                    record = read_bronze_record(client,BRONZE_BUCKET,args.replay_topic,args.partition,offset)
                except Exception as error:
                    if getattr(error,'response',{}).get('Error',{}).get('Code') not in {'NoSuchKey','404'}: raise
                    record = read_bronze_record(client,BRONZE_BUCKET,args.replay_topic,args.partition,offset,quarantined=True)
                records.append(record)
                if len(records)>=20:
                    project_records(connection,records)
                    total+=len(records)
                    records.clear()
            if records:
                project_records(connection,records)
                total+=len(records)
            logger.info('Projection replay completed: records=%d (Kafka offsets unchanged)',total)
        finally: connection.close()
    else:
        main()
