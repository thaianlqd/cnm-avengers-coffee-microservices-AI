FROM python:3.11-slim
WORKDIR /workspace
COPY pipeline-tests/requirements.txt /tmp/pipeline-test-requirements.txt
RUN pip install --no-cache-dir -r /tmp/pipeline-test-requirements.txt
ENV AI_OFFLINE=1 PYTHONPATH=/workspace/pipeline-common:/workspace/spark-jobs
CMD ["python", "-m", "unittest", "discover", "-s", "pipeline-tests"]
