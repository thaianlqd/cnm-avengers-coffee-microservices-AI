FROM python:3.11-slim

WORKDIR /app

COPY data-sync/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY data-sync/sync.py .

COPY pipeline-common/ /opt/pipeline-common/
COPY metadata/ /opt/data-platform-metadata/
ENV PYTHONPATH=/opt/pipeline-common DATA_PLATFORM_DATA_CONTRACTS_PATH=/opt/data-platform-metadata/runtime_data_contracts.json

CMD ["python", "-u", "sync.py"]
