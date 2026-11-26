# One-click Windows installer for the Pixopik Illustrator CEP 12 Plugin
$ErrorActionPreference = "Stop"

Write-Host "==> Enabling Adobe CEP PlayerDebugMode for CSXS.11 and CSXS.12..." -ForegroundColor Cyan
foreach ($ver in @("11", "12")) {
    $regPath = "HKCU:\Software\Adobe\CSXS.$ver"
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath -Name "PlayerDebugMode" -Value "1" -Type String
}

$extRoot = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$targetDir = Join-Path $extRoot "com.thepixopik.illustrator.mcp"

if (-not (Test-Path $extRoot)) {
    New-Item -ItemType Directory -Path $extRoot -Force | Out-Null
}

if (Test-Path $targetDir) {
    Remove-Item -Path $targetDir -Recurse -Force
}

$sourceDir = $PSScriptRoot
Write-Host "==> Copying CEP extension to $targetDir ..." -ForegroundColor Cyan
Copy-Item -Path $sourceDir -Destination $targetDir -Recurse -Force

Write-Host ""
Write-Host "SUCCESS! Restart Adobe Illustrator and open:" -ForegroundColor Green
Write-Host "   Window > Extensions > Pixopik MCP Bridge" -ForegroundColor Yellow
