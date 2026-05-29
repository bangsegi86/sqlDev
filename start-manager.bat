@echo off
REM ── SQLDev 서버 관리자 실행 (Windows) ──
REM 이 파일을 더블클릭하면 GUI 제어판이 브라우저로 열립니다.
cd /d "%~dp0"
title SQLDev 서버 관리자
where node >nul 2>nul
if errorlevel 1 (
  echo [오류] Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치하세요.
  pause
  exit /b 1
)
echo SQLDev 서버 관리자를 시작합니다... 잠시 후 브라우저가 열립니다.
node manager\manager.js
echo.
echo 관리자가 종료되었습니다.
pause
