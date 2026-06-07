@echo off
REM ── SQLDev 관리자 종료 ──
REM 앱 서버와 관리자 프로세스를 모두 정상 종료합니다.

powershell -NoProfile -Command ^
  "try{$null=Invoke-WebRequest -Uri 'http://localhost:3100/api/shutdown' -Method POST -TimeoutSec 5 -UseBasicParsing;Write-Host 'SQLDev 관리자가 종료되었습니다.';exit 0}catch{Write-Host '[오류] 관리자가 실행 중이지 않거나 연결할 수 없습니다.';exit 1}"
pause
