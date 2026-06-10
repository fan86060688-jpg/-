$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runScript = Join-Path $projectRoot "scripts\run-live.ps1"
$taskName = "AutoShortVideoPublisher"
$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runScript`""

schtasks.exe /Create /F /TN $taskName /SC DAILY /ST 10:00 /TR $action /RL LIMITED
