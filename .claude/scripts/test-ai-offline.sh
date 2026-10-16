#!/usr/bin/env bash
# Chạy pytest của ai-service OFFLINE bằng Python 3.11 (image ai-service đã build).
# - .venv local là Python 3.9 -> lỗi collection (cú pháp `X | None`), nên không dùng.
# - --network none, key LLM rỗng, mount read-only; KHÔNG mount .env.
# - Image cũ (thiếu thư viện mới)? chạy: docker compose build ai-service
# Dùng: .claude/scripts/test-ai-offline.sh [đối số pytest]   (mặc định: tests -q)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${AI_TEST_IMAGE:-cnm-avengers-coffee-microservices-ai-ai-service:latest}"
[ "$#" -eq 0 ] && set -- tests -q
exec docker run --rm --network none \
  --mount type=tmpfs,destination=/app \
  -v "$ROOT/avengers-coffee-system:/repo/avengers-coffee-system:ro" \
  -v "$ROOT/docker-compose.yml:/repo/docker-compose.yml:ro" \
  -v "$ROOT/.env.example:/repo/.env.example:ro" \
  -w /repo/avengers-coffee-system/services/ai-service \
  -e GEMINI_API_KEY= -e GROQ_API_KEY= -e OPENAI_API_KEY= \
  -e PYTHONDONTWRITEBYTECODE=1 \
  "$IMAGE" python -m pytest -p no:cacheprovider "$@"
