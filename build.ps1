# PowerShell Build & Setup Script for Windows
$ErrorActionPreference = "Stop"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Starting PowerShell Build & Setup Pipeline        " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

Write-Host "`n[BUILD] Installing npm packages..." -ForegroundColor Yellow
npm install

Write-Host "`n[BUILD] Running test suite..." -ForegroundColor Yellow
npm test

Write-Host "`n[BUILD] Executing build validator..." -ForegroundColor Yellow
npm run build

Write-Host "`n====================================================" -ForegroundColor Green
Write-Host "  Build & Setup completed successfully!             " -ForegroundColor Green
Write-Host "  Run 'npm start' to launch server.                 " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
