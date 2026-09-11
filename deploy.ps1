# CVMorph Multi-Environment Deployment Script for Windows PowerShell
param (
    [Parameter(Position = 0)]
    [string]$Target = ""
)

$ScriptPath = Join-Path $PSScriptRoot "scripts\deploy.mjs"

if (-not (Test-Path $ScriptPath)) {
    Write-Error "Deployment script not found at $ScriptPath"
    exit 1
}

if ($Target) {
    node $ScriptPath $Target
} else {
    node $ScriptPath
}
