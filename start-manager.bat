@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title SQLDev 서버 관리자

REM ── 이미 실행 중인지 확인 (포트 3100 응답 체크) ──
powershell -NoProfile -Command ^
  "try{$null=Invoke-WebRequest -Uri 'http://localhost:3100/api/status' -TimeoutSec 2 -UseBasicParsing;exit 0}catch{exit 1}" ^
  2>nul
if not errorlevel 1 (
  echo 관리자가 이미 실행 중입니다. 브라우저를 엽니다...
  start "" "http://localhost:3100/"
  exit /b 0
)

REM ── Node.js 설치 여부 확인 ──
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [오류] Node.js 가 설치되어 있지 않습니다.
  echo       https://nodejs.org 에서 설치 후 다시 시도하세요.
  echo.
  pause
  exit /b 1
)

REM ── 관리자를 백그라운드로 시작 (PowerShell Start-Process 사용 — VBS 불필요) ──
echo SQLDev 관리자를 백그라운드로 시작합니다...
powershell -NoProfile -Command ^
  "Start-Process 'node' -ArgumentList '%~dp0manager\manager.js','--no-open' -WorkingDirectory '%~dp0' -WindowStyle Hidden"

REM ── 관리자 HTTP 서버 준비 대기 (최대 10초) ──
set READY=0
for /l %%i in (1,1,10) do (
  if !READY!==0 (
    timeout /t 1 /nobreak >nul
    powershell -NoProfile -Command ^
      "try{$null=Invoke-WebRequest -Uri 'http://localhost:3100/api/status' -TimeoutSec 1 -UseBasicParsing;exit 0}catch{exit 1}" ^
      2>nul
    if not errorlevel 1 set READY=1
  )
)

if !READY!==0 (
  echo.
  echo [경고] 관리자 시작 확인 실패. http://localhost:3100/ 을 직접 열어보세요.
  echo.
)

REM ── 브라우저 열기 ──
start "" "http://localhost:3100/"
exit /b 0
