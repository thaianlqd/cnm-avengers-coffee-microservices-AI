@echo off
docker logs avengers_api_gateway > gateway_logs.txt 2>&1
docker logs avengers_identity_service > identity_logs.txt 2>&1
docker logs avengers_web_customer > web_customer_logs.txt 2>&1
echo Done.
