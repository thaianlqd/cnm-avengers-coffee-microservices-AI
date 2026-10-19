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


def _identity(context):
    import hashlib
    raw = context['dag_run'].run_id
    run_id = 'run_'+hashlib.sha256(('avengers_daily_pipeline|'+raw).encode()).hexdigest()[:32]
    return run_id, context['logical_date'].isoformat()


def _reference(manifest):
    return {key:manifest[key] for key in ('run_id','manifest_fingerprint','requested_as_of','publication_quality')}


def run_bronze(**context):
    sys.path.insert(0, JOBS_DIR)
    import bronze_ingestion
    run_id, as_of = _identity(context)
    return _reference(bronze_ingestion.main(run_id=run_id, as_of=as_of))


def run_silver(**context):
    sys.path.insert(0, JOBS_DIR)
    import silver_transform
    upstream = context['ti'].xcom_pull(task_ids='ingest_bronze')
    run_id, as_of = _identity(context)
    if not upstream or upstream['run_id'] != run_id: raise ValueError('Expected current Bronze run is missing')
    return _reference(silver_transform.main(run_id=run_id, as_of=as_of, input_run=upstream['run_id']))


def run_gold(**context):
    sys.path.insert(0, JOBS_DIR)
    import gold_aggregation
    upstream = context['ti'].xcom_pull(task_ids='transform_silver')
    run_id, as_of = _identity(context)
    if not upstream or upstream['run_id'] != run_id: raise ValueError('Expected current Silver run is missing')
    return _reference(gold_aggregation.main(run_id=run_id, as_of=as_of, input_run=upstream['run_id']))


def check_pipeline_health(**context):
    sys.path.insert(0, JOBS_DIR)
    import gold_aggregation
    from batch_runtime import verify_publication
    expected = context['ti'].xcom_pull(task_ids='aggregate_gold')
    run_id, _ = _identity(context)
    if not expected or expected['run_id'] != run_id: raise ValueError('Expected current Gold run is missing')
    engine = gold_aggregation.get_engine()
    connection = engine.raw_connection()
    try:
        connection.set_session(readonly=True)
        result = verify_publication(gold_aggregation.get_minio(), 'avengers-gold', run_id,
                                    expected['manifest_fingerprint'], gold_aggregation.CONTRACT, connection)
        logger.info('Pipeline health: run=%s status=%s optional_missing=%d completeness=%s',
            run_id, result['status'], len(result['optional_missing']), result['source_completeness'])
        return result
    finally:
        connection.rollback()
        connection.close()
        engine.dispose()


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
