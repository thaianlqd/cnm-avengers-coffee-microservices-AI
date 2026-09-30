# ─── Stage 1: Build Frontend (React + Vite) ───
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ─── Stage 2: Backend & Web Server (FastAPI + Uvicorn) ───
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/server

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy built SPA from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Copy backend server code
COPY server ./server

EXPOSE 8501

CMD ["python", "server/server.py"]
