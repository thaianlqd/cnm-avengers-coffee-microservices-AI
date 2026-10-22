FROM apache/airflow:2.9.1-python3.11

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

USER airflow
COPY airflow/requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY airflow/entrypoint.sh /entrypoint.sh
USER root
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
USER airflow

COPY pipeline-common/ /opt/pipeline-common/
COPY metadata/ /opt/data-platform-metadata/
ENV PYTHONPATH=/opt/pipeline-common DATA_PLATFORM_DATA_CONTRACTS_PATH=/opt/data-platform-metadata/data_contracts.json

ENTRYPOINT ["/entrypoint.sh"]
