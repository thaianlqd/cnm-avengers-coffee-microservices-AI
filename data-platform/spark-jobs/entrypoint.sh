#!/bin/bash
# Run all pipeline jobs in order: Bronze → Silver → Gold
set -e

echo "================================================="
echo "  Avengers Coffee - Spark Pipeline Runner"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================="

echo ""
echo "[1/3] Running Bronze Layer (Raw ingestion)..."
python /opt/spark-jobs/bronze_ingestion.py
echo "Bronze layer complete!"

echo ""
echo "[2/3] Running Silver Layer (Clean & transform)..."
python /opt/spark-jobs/silver_transform.py
echo "Silver layer complete!"

echo ""
echo "[3/3] Running Gold Layer (Aggregations)..."
python /opt/spark-jobs/gold_aggregation.py
echo "Gold layer complete!"

echo ""
echo "Pipeline finished at $(date '+%Y-%m-%d %H:%M:%S')"
