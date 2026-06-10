param(
  [string]$TaskName = "AutoShortVideoPublisher",
  [string]$ProjectDir = (Resolve-Path ".").Path,
  [string]$Time = "10:00"
)

$npm = (Get-Command npm).Source
$action = New-ScheduledTaskAction -Execute $npm -Argument "run run -- --config=config/config.json --orders=data/input/orders.json" -WorkingDirectory $ProjectDir
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Daily 10:00 product video generation workflow" -Force

Write-Host "Registered scheduled task '$TaskName' at $Time for $ProjectDir"
