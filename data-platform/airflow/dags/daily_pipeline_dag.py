"""
Airflow DAG: Daily Data Pipeline
Runs at 2AM: Bronze → Silver → Gold → Update stats
"""
from __future__ import annotations

import os
import sys
import logging
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator

logger = logging.getLogger(__name__)

# Add spark-jobs to path so we can import them
JOBS_DIR = "/opt/airflow/spark-jobs"

default_args = {
    "owner": "avengers-data-team",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}


def run_bronze(**context):
    """Run bronze ingestion job."""
    sys.path.insert(0, JOBS_DIR)
    try:
        import bronze_ingestion
        bronze_ingestion.main()
        logger.info("Bronze layer completed successfully")
    except Exception as e:
        logger.error(f"Bronze layer failed: {e}")
        raise


def run_silver(**context):
    """Run silver transformation job."""
    sys.path.insert(0, JOBS_DIR)
    try:
        import silver_transform
        silver_transform.main()
        logger.info("Silver layer completed successfully")
    except Exception as e:
        logger.error(f"Silver layer failed: {e}")
        raise


def run_gold(**context):
    """Run gold aggregation job."""
    sys.path.insert(0, JOBS_DIR)
    try:
        import gold_aggregation
        gold_aggregation.main()
        logger.info("Gold layer completed successfully")
    except Exception as e:
        logger.error(f"Gold layer failed: {e}")
        raise


def check_pipeline_health(**context):
    """Check if all Gold datasets were created."""
    import boto3
    from botocore.client import Config

    s3 = boto3.client(
        "s3",
        endpoint_url=os.getenv("MINIO_ENDPOINT", "http://minio:9000"),
        aws_access_key_id=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        aws_secret_access_key=os.getenv("MINIO_SECRET_KEY", "minioadmin123"),
        config=Config(signature_version="s3v4"),
    )
    expected_keys = [
        "kpi/latest.json",
        "revenue_daily/latest.json",
        "top_products/latest.json",
        "customer_segments/latest.json",
    ]
    missing = []
    for key in expected_keys:
        try:
            s3.head_object(Bucket="avengers-gold", Key=key)
        except Exception:
            missing.append(key)

    if missing:
        raise ValueError(f"Missing Gold datasets: {missing}")
    logger.info("All Gold datasets verified ✓")


with DAG(
    dag_id="avengers_daily_pipeline",
    description="Daily data pipeline: PostgreSQL → Bronze → Silver → Gold",
    default_args=default_args,
    schedule="0 2 * * *",    # 2:00 AM every day
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["avengers", "data-pipeline", "daily"],
    max_active_runs=1,
) as dag:

    t_bronze = PythonOperator(
        task_id="ingest_bronze",
        python_callable=run_bronze,
        doc_md="Ingest raw data from PostgreSQL to MinIO Bronze layer",
    )

    t_silver = PythonOperator(
        task_id="transform_silver",
        python_callable=run_silver,
        doc_md="Clean and normalize data into Silver layer",
    )

    t_gold = PythonOperator(
        task_id="aggregate_gold",
        python_callable=run_gold,
        doc_md="Produce Gold aggregations: KPIs, revenue, products, customers, shippers",
    )

    t_health = PythonOperator(
        task_id="verify_pipeline",
        python_callable=check_pipeline_health,
        doc_md="Verify all Gold datasets were created successfully",
    )

    t_bronze >> t_silver >> t_gold >> t_health
