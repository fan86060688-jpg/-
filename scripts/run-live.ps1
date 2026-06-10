$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

New-Item -ItemType Directory -Force -Path "data\logs" | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = "data\logs\scheduled-$timestamp.log"

try {
  "[$(Get-Date -Format o)] Starting live workflow" | Tee-Object -FilePath $logPath
  npm run run -- --live=true 2>&1 | Tee-Object -FilePath $logPath -Append
  npm run render-missing-videos 2>&1 | Tee-Object -FilePath $logPath -Append
  "[$(Get-Date -Format o)] Finished live workflow" | Tee-Object -FilePath $logPath -Append
} catch {
  "[$(Get-Date -Format o)] Failed: $($_.Exception.Message)" | Tee-Object -FilePath $logPath -Append
  throw
}
