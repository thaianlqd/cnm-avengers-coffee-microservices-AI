#!/bin/bash
# One explicit run identity across all layers. No independent latest readers.
set -euo pipefail
pipeline_run_id="${DATA_PLATFORM_RUN_ID:-$(python -c 'import uuid; print("run_"+uuid.uuid4().hex)')}"
pipeline_as_of="${DATA_PLATFORM_AS_OF:-$(python -c 'from datetime import datetime, timezone; print(datetime.now(timezone.utc).isoformat())')}"
python /opt/spark-jobs/bronze_ingestion.py --run-id "$pipeline_run_id" --as-of "$pipeline_as_of"
python /opt/spark-jobs/silver_transform.py --run-id "$pipeline_run_id" --as-of "$pipeline_as_of" --input-run "$pipeline_run_id"
python /opt/spark-jobs/gold_aggregation.py --run-id "$pipeline_run_id" --as-of "$pipeline_as_of" --input-run "$pipeline_run_id"
