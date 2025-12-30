# Docker Build and Push Script
# Usage: .\docker-build-push.ps1

param(
    [string]$ImageName = "kasusa/oil-assist",
    [string]$Port = "3088"
)

# Set error handling
$ErrorActionPreference = "Stop"

# Generate tag with date and time
$DateTime = Get-Date -Format "yyyyMMdd-HHmmss"
$Tag = "${ImageName}:${DateTime}"
$LatestTag = "${ImageName}:latest"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Docker Build and Push Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Image Name: ${ImageName}" -ForegroundColor Yellow
Write-Host "Time Tag: ${Tag}" -ForegroundColor Yellow
Write-Host "Latest Tag: ${LatestTag}" -ForegroundColor Yellow
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker status..." -ForegroundColor Green
try {
    docker ps | Out-Null
    Write-Host "[OK] Docker is running" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker is not running, please start Docker Desktop" -ForegroundColor Red
    exit 1
}

# Step 1: Build image
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 1: Build Docker Image" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Will execute: docker build -t ${Tag} -t ${LatestTag} ." -ForegroundColor Yellow
$confirm = Read-Host "Confirm build? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "Build cancelled" -ForegroundColor Red
    exit 0
}

Write-Host "Starting image build..." -ForegroundColor Green
docker build -t ${Tag} -t ${LatestTag} .
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Build successful" -ForegroundColor Green

# Test run container
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 1.5: Test Run Container" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Will run container on port ${Port} for testing" -ForegroundColor Yellow
$confirm = Read-Host "Confirm test run? (Y/N)"
if ($confirm -eq "Y" -or $confirm -eq "y") {
    # Check and remove existing test container if exists
    $existingContainer = docker ps -a --filter "name=oil-assist-test" --format "{{.Names}}" 2>$null
    if ($existingContainer -eq "oil-assist-test") {
        Write-Host "Removing existing test container..." -ForegroundColor Yellow
        docker stop oil-assist-test 2>$null | Out-Null
        docker rm oil-assist-test 2>$null | Out-Null
    }
    
    Write-Host "Starting test container..." -ForegroundColor Green
    docker run -d -p "${Port}:3000" --name oil-assist-test ${LatestTag}
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Container started successfully" -ForegroundColor Green
        Write-Host "Access http://localhost:${Port} for testing" -ForegroundColor Yellow
        Write-Host ""
        $stop = Read-Host "Press Enter to stop and remove test container after testing"
        docker stop oil-assist-test 2>$null | Out-Null
        docker rm oil-assist-test 2>$null | Out-Null
        Write-Host "[OK] Test container cleaned up" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Container start failed" -ForegroundColor Red
    }
}

# Step 2: Push to Docker Hub
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 2: Push to Docker Hub" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Will push the following tags to Docker Hub:" -ForegroundColor Yellow
Write-Host "  - ${Tag}" -ForegroundColor Yellow
Write-Host "  - ${LatestTag}" -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Confirm push? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "Push skipped" -ForegroundColor Yellow
} else {
    # Check login status
    Write-Host "Checking Docker Hub login status..." -ForegroundColor Green
    $loginCheck = docker info 2>&1 | Select-String "Username"
    if (-not $loginCheck) {
        Write-Host "Need to login to Docker Hub" -ForegroundColor Yellow
        docker login
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Login failed" -ForegroundColor Red
            exit 1
        }
    }
    
    Write-Host "Pushing tag: ${Tag}" -ForegroundColor Green
    docker push ${Tag}
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Push ${Tag} failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] ${Tag} pushed successfully" -ForegroundColor Green
    
    Write-Host "Pushing tag: ${LatestTag}" -ForegroundColor Green
    docker push ${LatestTag}
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Push ${LatestTag} failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] ${LatestTag} pushed successfully" -ForegroundColor Green
}

# Step 3: Package local tar file
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 3: Package Local Tar File" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
$confirm = Read-Host "Confirm package image as tar file? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "Package skipped" -ForegroundColor Yellow
} else {
    $TarFileName = "oil-assist-${DateTime}.tar"
    $TarFilePath = Join-Path $PSScriptRoot $TarFileName
    
    Write-Host "Packaging image as: ${TarFileName}" -ForegroundColor Green
    docker save -o $TarFilePath ${LatestTag}
    
    if ($LASTEXITCODE -eq 0) {
        $FileSize = (Get-Item $TarFilePath).Length / 1MB
        Write-Host "[OK] Package successful" -ForegroundColor Green
        Write-Host "File path: ${TarFilePath}" -ForegroundColor Yellow
        Write-Host "File size: $([math]::Round($FileSize, 2)) MB" -ForegroundColor Yellow
        Write-Host ""
        
        # Ask if open file location
        $open = Read-Host "Open file location? (Y/N)"
        if ($open -eq "Y" -or $open -eq "y") {
            Invoke-Item (Split-Path $TarFilePath -Parent)
        }
    } else {
        Write-Host "[ERROR] Package failed" -ForegroundColor Red
    }
}

# Complete
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[OK] All operations completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Image Tag: ${Tag}" -ForegroundColor Yellow
Write-Host "Latest Tag: ${LatestTag}" -ForegroundColor Yellow
Write-Host ""
