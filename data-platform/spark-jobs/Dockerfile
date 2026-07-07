FROM python:3.11-slim

WORKDIR /opt/spark-jobs

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    psycopg2-binary==2.9.9 \
    boto3==1.34.0 \
    pandas==2.1.4 \
    pyarrow==14.0.2 \
    sqlalchemy==2.0.36

COPY . /opt/spark-jobs/

ENTRYPOINT ["/bin/bash", "/opt/spark-jobs/entrypoint.sh"]
