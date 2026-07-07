#!/bin/bash
set -e

echo "Initializing Airflow..."
airflow db migrate

# Create admin user
airflow users create \
    --username "${AIRFLOW_ADMIN_USER:-admin}" \
    --firstname Admin \
    --lastname User \
    --role Admin \
    --email admin@avengers.coffee \
    --password "${AIRFLOW_ADMIN_PASSWORD:-admin123}" 2>/dev/null || true

echo "Starting Airflow scheduler in background..."
airflow scheduler &

echo "Starting Airflow webserver..."
exec airflow webserver --port 8080
