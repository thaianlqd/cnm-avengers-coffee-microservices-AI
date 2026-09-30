"""
Avengers Coffee - Kafka Streaming Consumer
Consumes events from Kafka topics, buffers them, and:
1. Ingests raw streaming micro-batches into MinIO Bronze Lake (avengers-bronze/streaming/{topic}/...)
2. Persists real-time events into postgres-analytics (public.realtime_events) for instant visibility.
"""
import os
import sys
import json
import time
import signal
import logging
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from kafka import KafkaConsumer
from kafka.errors import NoBrokersAvailable
import boto3
from botocore.client import Config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s - %(message)s',
)
logger = logging.getLogger("kafka-consumer")

KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "avengers-bronze-consumer")
TOPICS = ["orders-events", "order-items-events", "shipper-events"]

DB_HOST     = os.getenv("DB_HOST", "postgres-analytics")
DB_PORT     = int(os.getenv("DB_PORT", 5432))
DB_USER     = os.getenv("DB_USER", "analytics")
DB_PASSWORD = os.getenv("DB_PASSWORD", "analytics123")
DB_NAME     = os.getenv("DB_NAME", "analytics")

MINIO_ENDPOINT   = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
BRONZE_BUCKET    = "avengers-bronze"

BATCH_SIZE = int(os.getenv("BATCH_SIZE", 50))
FLUSH_INTERVAL = int(os.getenv("FLUSH_INTERVAL_SECONDS", 15))

running = True


def signal_handler(sig, frame):
    global running
    logger.info("Received termination signal. Gracefully stopping...")
    running = False


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def get_db_conn():
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, user=DB_USER,
            password=DB_PASSWORD, dbname=DB_NAME,
            connect_timeout=10,
            sslmode=os.getenv('DB_SSLMODE', 'disable')
        )
        conn.autocommit = True
        return conn
    except Exception as e:
        logger.warning(f"Could not connect to PostgreSQL: {e}")
        return None


def get_minio():
    try:
        return boto3.client(
            "s3", endpoint_url=MINIO_ENDPOINT,
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
        )
    except Exception as e:
        logger.warning(f"Could not connect to MinIO: {e}")
        return None


def ensure_bucket(s3, bucket: str):
    if s3 is None:
        return
    try:
        s3.head_bucket(Bucket=bucket)
    except Exception:
        try:
            s3.create_bucket(Bucket=bucket)
        except Exception:
            pass


def init_db_schema(conn):
    """Ensure realtime_events table exists in postgres-analytics."""
    if conn is None:
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS public.realtime_events (
                    id BIGSERIAL PRIMARY KEY,
                    topic VARCHAR(100) NOT NULL,
                    event_key VARCHAR(255),
                    event_type VARCHAR(100),
                    payload JSONB NOT NULL,
                    received_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_realtime_events_topic ON public.realtime_events(topic);
                CREATE INDEX IF NOT EXISTS idx_realtime_events_received ON public.realtime_events(received_at DESC);
            """)
        logger.info("Verified public.realtime_events table in DB.")
    except Exception as e:
        logger.warning(f"Error checking realtime_events table: {e}")


def create_consumer() -> KafkaConsumer:
    """Connect to Kafka with retry logic until broker becomes ready."""
    logger.info(f"Connecting to Kafka brokers at {KAFKA_SERVERS}...")
    while running:
        try:
            consumer = KafkaConsumer(
                *TOPICS,
                bootstrap_servers=KAFKA_SERVERS,
                group_id=KAFKA_GROUP_ID,
                auto_offset_reset='earliest',
                enable_auto_commit=True,
                value_deserializer=lambda m: json.loads(m.decode('utf-8', errors='ignore')),
                key_deserializer=lambda k: k.decode('utf-8', errors='ignore') if k else None,
                consumer_timeout_ms=1000
            )
            logger.info(f"Connected to Kafka and subscribed to topics: {TOPICS}")
            return consumer
        except NoBrokersAvailable:
            logger.warning("Kafka broker not available yet. Retrying in 5 seconds...")
            time.sleep(5)
        except Exception as e:
            logger.warning(f"Error connecting to Kafka: {e}. Retrying in 5 seconds...")
            time.sleep(5)
    return None


def flush_batch(batch: list, db_conn, s3_client):
    """Flush accumulated events to both PostgreSQL and MinIO Bronze."""
    if not batch:
        return

    # 1. Insert into PostgreSQL public.realtime_events
    if db_conn is not None:
        try:
            with db_conn.cursor() as cur:
                records = [
                    (
                        item["topic"],
                        item["key"],
                        item["event_type"],
                        json.dumps(item["payload"]),
                        item["received_at"]
                    )
                    for item in batch
                ]
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO public.realtime_events (topic, event_key, event_type, payload, received_at)
                    VALUES %s
                    """,
                    records
                )
            logger.info(f"Recorded {len(batch)} real-time events into postgres-analytics.")
        except Exception as e:
            logger.warning(f"DB insert error for real-time events: {e}")

    # 2. Upload streaming batch to MinIO Bronze Lake
    if s3_client is not None:
        try:
            ensure_bucket(s3_client, BRONZE_BUCKET)
            now = datetime.now()
            date_str = now.strftime("%Y/%m/%d")
            ts_str = now.strftime("%Y%m%d_%H%M%S_%f")
            key = f"streaming/{date_str}/batch_{ts_str}.json"

            body = json.dumps(batch, default=str, ensure_ascii=False, indent=2).encode("utf-8")
            s3_client.put_object(
                Bucket=BRONZE_BUCKET,
                Key=key,
                Body=body,
                ContentType="application/json"
            )
            logger.info(f"Ingested streaming batch ({len(batch)} events) → s3://{BRONZE_BUCKET}/{key}")
        except Exception as e:
            logger.warning(f"MinIO streaming upload error: {e}")


def main():
    logger.info("=== Avengers Coffee - Kafka Streaming Consumer Starting ===")
    db_conn = get_db_conn()
    if db_conn:
        init_db_schema(db_conn)
    s3_client = get_minio()

    consumer = create_consumer()
    if consumer is None:
        logger.info("Kafka consumer shutting down before initialization.")
        return

    buffer = []
    last_flush_time = time.time()

    try:
        while running:
            # Poll for new messages
            for message in consumer:
                if not running:
                    break

                try:
                    payload = message.value
                    event_type = payload.get("event_type", "unknown") if isinstance(payload, dict) else "unknown"
                    event_record = {
                        "topic": message.topic,
                        "key": message.key,
                        "event_type": event_type,
                        "payload": payload,
                        "received_at": datetime.now(timezone.utc).isoformat(),
                        "offset": message.offset,
                        "partition": message.partition
                    }
                    buffer.append(event_record)
                except Exception as e:
                    logger.warning(f"Error parsing message from {message.topic}: {e}")

                # Flush if buffer reaches batch size
                if len(buffer) >= BATCH_SIZE:
                    flush_batch(buffer, db_conn, s3_client)
                    buffer = []
                    last_flush_time = time.time()

            # Flush periodically even if batch size not reached
            if buffer and (time.time() - last_flush_time) >= FLUSH_INTERVAL:
                flush_batch(buffer, db_conn, s3_client)
                buffer = []
                last_flush_time = time.time()

            # Check DB health and reconnect if disconnected
            if db_conn is None or db_conn.closed:
                db_conn = get_db_conn()

    except Exception as e:
        logger.error(f"Unexpected error in consumer loop: {e}", exc_info=True)
    finally:
        if buffer:
            logger.info(f"Flushing remaining {len(buffer)} events before shutdown...")
            flush_batch(buffer, db_conn, s3_client)
        if consumer:
            consumer.close()
        if db_conn and not db_conn.closed:
            db_conn.close()
        logger.info("=== Kafka Streaming Consumer Stopped Gracefully ===")


if __name__ == "__main__":
    main()
