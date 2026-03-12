param(
  [string]$Container = "avengers_db",
  [string]$Database = "avengers_coffee",
  [string]$User = "admin",
  [string]$OutputDir = ".\backups"
)

$ErrorActionPreference = "Stop"
if (!(Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outputFile = Join-Path $OutputDir "${Database}_${timestamp}.sql"

Write-Host "--- Dang tao ban backup .sql (Dung lenh INSERT) ---" -ForegroundColor Cyan

# --inserts: Dung lenh INSERT INTO de chong loi Tab/Space
# --column-inserts: Ghi ro ten cot de dam bao chinh xac 100%
docker exec $Container sh -c "pg_dump -U $User --inserts --column-inserts $Database > /tmp/temp.sql"
docker cp "${Container}:/tmp/temp.sql" $outputFile
docker exec $Container rm /tmp/temp.sql

Write-Host "DONE! File .sql nay bac mo ra doc cuc ngon." -ForegroundColor Green