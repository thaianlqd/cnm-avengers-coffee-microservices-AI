FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY kafka-consumer/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY kafka-consumer/ .

COPY pipeline-common/ /opt/pipeline-common/
COPY metadata/ /opt/data-platform-metadata/
ENV PYTHONPATH=/opt/pipeline-common DATA_PLATFORM_DATA_CONTRACTS_PATH=/opt/data-platform-metadata/data_contracts.json

CMD ["python", "consumer.py"]
