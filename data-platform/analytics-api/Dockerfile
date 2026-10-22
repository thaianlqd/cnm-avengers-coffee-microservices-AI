FROM python:3.11-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY analytics-api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY analytics-api/ ./
COPY pipeline-common/ /opt/pipeline-common/
ENV PYTHONPATH=/app:/opt/pipeline-common

EXPOSE 8000

CMD ["python", "server.py"]
