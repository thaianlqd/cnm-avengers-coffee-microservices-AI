"""
Avengers Coffee - Kafka Event Producer
Reads from PostgreSQL and publishes business events to Kafka topics.
Polls every POLL_INTERVAL_SECONDS for new records.
"""
import os
import json
import time
import logging
from datetime import datetime, timezone
from decimal import Decimal

import psycopg2
import psycopg2.extras
from kafka import KafkaProducer
from kafka.admin import KafkaAdminClient, NewTopic
from kafka.errors import TopicAlreadyExistsError

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s - %(message)s',
)
logger = logging.getLogger("kafka-producer")

# ─── Config ───────────────────────────────────────────────────────────────────
KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
DB_HOST       = os.getenv("DB_HOST", "postgres-db")
DB_PORT       = int(os.getenv("DB_PORT", 5432))
DB_USER       = os.getenv("DB_USER", "admin")
DB_PASSWORD   = os.getenv("DB_PASSWORD", "123")
DB_NAME       = os.getenv("DB_NAME", "avengers_coffee")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", 30))

TOPICS = [
    "orders-events",
    "order-items-events",
    "customer-events",
    "shipper-events",
    "product-events",
]

# Track last-seen IDs/timestamps per topic
_state: dict = {}


def json_serial(obj):
    """JSON serializer for objects not serializable by default json code."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


def create_producer() -> KafkaProducer:
    logger.info(f"Connecting to Kafka at {KAFKA_SERVERS}…")
    return KafkaProducer(
        bootstrap_servers=KAFKA_SERVERS,
        value_serializer=lambda v: json.dumps(v, default=json_serial).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8") if k else None,
        retries=5,
        acks="all",
    )


def ensure_topics(producer: KafkaProducer):
    admin = KafkaAdminClient(bootstrap_servers=KAFKA_SERVERS)
    existing = admin.list_topics()
    new_topics = [
        NewTopic(name=t, num_partitions=3, replication_factor=1)
        for t in TOPICS if t not in existing
    ]
    if new_topics:
        try:
            admin.create_topics(new_topics)
            logger.info(f"Created topics: {[t.name for t in new_topics]}")
        except TopicAlreadyExistsError:
            pass
    admin.close()


def get_db_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASSWORD, dbname=DB_NAME,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def fetch_and_publish(producer: KafkaProducer, conn):
    """Fetch new records since last poll and publish to Kafka."""
    cur = conn.cursor()
    published = 0

    # ── 1. Orders ─────────────────────────────────────────────────────────────
    try:
        last_ts = _state.get("orders_last_ts", "2020-01-01 00:00:00")
        cur.execute("""
            SELECT
                d.ma_don_hang,
                d.trang_thai_don_hang,
                d.phuong_thuc_thanh_toan,
                d.tong_tien,
                d.co_so_ma,
                d.ngay_tao,
                d.ngay_cap_nhat,
                d.loai_don,
                d.ghi_chu,
                d.khach_hang_id
            FROM orders.don_hang d
            WHERE d.ngay_tao > %s
            ORDER BY d.ngay_tao ASC
            LIMIT 500
        """, (last_ts,))
        rows = cur.fetchall()
        for row in rows:
            event = {
                "event_type": "order_created",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": dict(row),
            }
            producer.send("orders-events", key=str(row["ma_don_hang"]), value=event)
            published += 1
            if row["ngay_tao"]:
                _state["orders_last_ts"] = str(row["ngay_tao"])
        if rows:
            logger.info(f"Published {len(rows)} order events")
    except Exception as e:
        logger.warning(f"Orders fetch error: {e}")

    # ── 2. Order Items ─────────────────────────────────────────────────────────
    try:
        last_ts = _state.get("items_last_ts", "2020-01-01 00:00:00")
        cur.execute("""
            SELECT
                ct.ma_chi_tiet,
                ct.ma_don_hang,
                ct.ma_san_pham,
                ct.so_luong,
                ct.don_gia,
                ct.ghi_chu,
                d.ngay_tao
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.ngay_tao > %s
            ORDER BY d.ngay_tao ASC
            LIMIT 1000
        """, (last_ts,))
        rows = cur.fetchall()
        for row in rows:
            event = {
                "event_type": "order_item",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": dict(row),
            }
            producer.send("order-items-events", key=str(row["ma_don_hang"]), value=event)
            published += 1
            if row["ngay_tao"]:
                _state["items_last_ts"] = str(row["ngay_tao"])
        if rows:
            logger.info(f"Published {len(rows)} order-item events")
    except Exception as e:
        logger.warning(f"Order items fetch error: {e}")

    # ── 3. Shipper Deliveries ──────────────────────────────────────────────────
    try:
        last_ts = _state.get("shipper_last_ts", "2020-01-01 00:00:00")
        cur.execute("""
            SELECT
                sd.id,
                sd.ma_don_hang,
                sd.shipper_id,
                sd.status,
                sd.assigned_at,
                sd.picked_up_at,
                sd.delivered_at,
                sd.delivery_fee,
                sd.cod_amount,
                sd.fail_reason
            FROM orders.shipper_delivery sd
            WHERE sd.assigned_at > %s
            ORDER BY sd.assigned_at ASC
            LIMIT 200
        """, (last_ts,))
        rows = cur.fetchall()
        for row in rows:
            event = {
                "event_type": "delivery_assigned",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": dict(row),
            }
            producer.send("shipper-events", key=str(row["ma_don_hang"]), value=event)
            published += 1
            if row["assigned_at"]:
                _state["shipper_last_ts"] = str(row["assigned_at"])
        if rows:
            logger.info(f"Published {len(rows)} shipper events")
    except Exception as e:
        logger.warning(f"Shipper deliveries fetch error (table may not exist): {e}")

    # ── 4. Flush ───────────────────────────────────────────────────────────────
    producer.flush()
    return published


def main():
    logger.info("=== Avengers Coffee Kafka Producer Starting ===")

    # Wait for Kafka
    for attempt in range(20):
        try:
            producer = create_producer()
            ensure_topics(producer)
            logger.info("Kafka connected successfully!")
            break
        except Exception as e:
            logger.warning(f"Kafka not ready ({attempt+1}/20): {e}. Retrying in 10s…")
            time.sleep(10)
    else:
        logger.error("Failed to connect to Kafka after 20 attempts. Exiting.")
        return

    # Wait for PostgreSQL
    for attempt in range(20):
        try:
            conn = get_db_conn()
            logger.info("PostgreSQL connected successfully!")
            break
        except Exception as e:
            logger.warning(f"PG not ready ({attempt+1}/20): {e}. Retrying in 10s…")
            time.sleep(10)
    else:
        logger.error("Failed to connect to PostgreSQL after 20 attempts.")
        return

    logger.info(f"Starting poll loop every {POLL_INTERVAL}s…")
    while True:
        try:
            count = fetch_and_publish(producer, conn)
            logger.info(f"Poll done. Total events published this cycle: {count}")
        except psycopg2.OperationalError:
            logger.warning("DB connection lost. Reconnecting…")
            try:
                conn = get_db_conn()
            except Exception:
                pass
        except Exception as e:
            logger.error(f"Poll error: {e}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
