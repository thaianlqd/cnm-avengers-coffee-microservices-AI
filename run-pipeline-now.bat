@echo off
echo Chay Spark pipeline thu cong (Bronze - Silver - Gold)...
docker compose -f docker-compose.data.yml run --rm spark-jobs
echo Pipeline hoan thanh!
pause
