FROM python:3.11-slim

WORKDIR /opt/spark-jobs

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    psycopg2-binary==2.9.9 \
    boto3==1.37.32 \
    pandas==2.1.4 \
    pyarrow==14.0.2 \
    sqlalchemy==2.0.36

COPY spark-jobs/ /opt/spark-jobs/

COPY pipeline-common/ /opt/pipeline-common/
COPY metadata/ /opt/data-platform-metadata/
ENV PYTHONPATH=/opt/pipeline-common DATA_PLATFORM_DATA_CONTRACTS_PATH=/opt/data-platform-metadata/data_contracts.json

ENTRYPOINT ["/bin/bash", "/opt/spark-jobs/entrypoint.sh"]
