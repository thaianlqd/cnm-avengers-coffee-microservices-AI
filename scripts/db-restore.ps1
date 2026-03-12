param(
  [string]$Container = "avengers_db",
  [string]$Database = "avengers_coffee",
  [string]$User = "admin",
  [Parameter(Mandatory = $true)]
  [string]$InputFile
)

$ErrorActionPreference = "Stop"

Write-Host "--- 1. XOA DATABASE CU ---" -ForegroundColor Cyan
docker exec $Container psql -U $User -d $Database -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

Write-Host "--- 2. NAP DU LIEU TU FILE .SQL ---" -ForegroundColor Yellow
docker cp $InputFile "${Container}:/tmp/restore.sql"

# Chay truc tiep file tu trong container
docker exec $Container psql -U $User -d $Database -f /tmp/restore.sql

docker exec $Container rm /tmp/restore.sql
Write-Host "DONE! Du lieu da hoi sinh." -ForegroundColor Green