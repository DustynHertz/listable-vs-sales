# Listable vs Sales — one-shot Windows install (Node LTS + PostgreSQL 16, no Docker)
# Run in an elevated PowerShell if Postgres service install requires it.
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

Write-Host "== Installing Node.js LTS via winget =="
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --silent
Refresh-Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $nodeDir = "C:\Program Files\nodejs"
  if (Test-Path $nodeDir) { $env:Path = "$nodeDir;$env:Path" }
}
node -v
npm -v

Write-Host "== Installing PostgreSQL 16 via winget =="
# Superuser password is postgres / listable-local-setup. App user is listable/listable.
winget install --id PostgreSQL.PostgreSQL.16 -e --accept-package-agreements --accept-source-agreements --silent --override "--mode unattended --unattendedmodeui none --superpassword listable --servicename postgresql-x64-16 --serverport 5432"
Refresh-Path

$psqlCandidates = @(
  "C:\Program Files\PostgreSQL\16\bin\psql.exe",
  "C:\Program Files\PostgreSQL\17\bin\psql.exe",
  "C:\Program Files\PostgreSQL\15\bin\psql.exe"
)
$psql = $psqlCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $psql) {
  $found = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $psql = $found.FullName }
}
if (-not $psql) { throw "psql.exe not found after PostgreSQL install. Check winget output." }
Write-Host "Using $psql"
$env:Path = "$(Split-Path $psql);$env:Path"

# Ensure service is running
Get-Service | Where-Object { $_.Name -match 'postgres' } | ForEach-Object {
  Write-Host "Service $($_.Name) status=$($_.Status)"
  if ($_.Status -ne "Running") { Start-Service $_.Name }
}

$env:PGPASSWORD = "listable"
# Try connecting as postgres superuser with password listable; fall back to trust/local
$created = $false
foreach ($super in @("postgres", "listable")) {
  try {
    & $psql -U $super -h 127.0.0.1 -p 5432 -d postgres -c "SELECT 1" | Out-Null
    Write-Host "Connected as $super"
    & $psql -U $super -h 127.0.0.1 -p 5432 -d postgres -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'listable') THEN CREATE ROLE listable LOGIN PASSWORD 'listable'; END IF; END `$`$;"
    & $psql -U $super -h 127.0.0.1 -p 5432 -d postgres -c "SELECT 'CREATE DATABASE listable OWNER listable' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'listable')\gexec"
    $created = $true
    break
  } catch {
    Write-Host "Could not connect as $super : $_"
  }
}
if (-not $created) {
  Write-Host "WARNING: Could not auto-create role/db. Create manually:"
  Write-Host "  CREATE USER listable WITH PASSWORD 'listable';"
  Write-Host "  CREATE DATABASE listable OWNER listable;"
}

Copy-Item -Force "$ProjectRoot\api\.env.example" "$ProjectRoot\api\.env"
Write-Host "DATABASE_URL=postgres://listable:listable@127.0.0.1:5432/listable"

Write-Host "== npm install =="
npm install --prefix api
npm install --prefix web

Write-Host "== Start API and web =="
$api = Start-Process -FilePath "npm" -ArgumentList "run","dev","--prefix","api" -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden
$web = Start-Process -FilePath "npm" -ArgumentList "run","dev","--prefix","web" -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden
Write-Host "API pid=$($api.Id)  WEB pid=$($web.Id)"

$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  try {
    $h = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:43124/api/health
    $u = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:43123/
    if ($h.StatusCode -eq 200 -and $u.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
}
if ($ok) {
  Write-Host "SUCCESS: API health OK, UI responding at http://localhost:43123"
} else {
  Write-Host "Servers started but health check not confirmed yet. Open http://localhost:43123"
}

# Optional sample upload
try {
  $sample = Join-Path $ProjectRoot "sample-data\stored-to-listable.csv"
  if (Test-Path $sample) {
    curl.exe -sS -F "file=@$sample" http://127.0.0.1:43124/api/uploads/listable
    $sold = Join-Path $ProjectRoot "sample-data\sold.csv"
    if (Test-Path $sold) { curl.exe -sS -F "file=@$sold" http://127.0.0.1:43124/api/uploads/sold }
  }
} catch {
  Write-Host "Sample upload skipped: $_"
}
