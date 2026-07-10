#!/bin/bash
set -e

LOG="/opt/airflow/dags/airflow_init.log"
echo "=== Initializing Airflow at $(date) ===" > "$LOG"

airflow db migrate >> "$LOG" 2>&1

airflow users create \
    --username "${AIRFLOW_ADMIN_USER:-admin}" \
    --firstname Admin \
    --lastname User \
    --role Admin \
    --email admin@avengers.coffee \
    --password "${AIRFLOW_ADMIN_PASSWORD:-admin123}" >> "$LOG" 2>&1 || true

# Clean up any stale PID files from previous runs
rm -f /opt/airflow/airflow-webserver.pid /opt/airflow/airflow-webserver-monitor.pid /opt/airflow/airflow-scheduler.pid

echo "Starting Airflow scheduler in background..." >> "$LOG"
airflow scheduler >> /opt/airflow/dags/scheduler.log 2>&1 &

echo "Starting Airflow webserver..." >> "$LOG"
exec airflow webserver --host 0.0.0.0 --port 8080 >> /opt/airflow/dags/webserver.log 2>&1
