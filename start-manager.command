#!/bin/bash
# ── SQLDev 서버 관리자 실행 (macOS) ──
# 이 파일을 더블클릭하면 GUI 제어판이 브라우저로 열립니다.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "[오류] Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치하세요."
  read -r -p "엔터를 누르면 종료합니다..."
  exit 1
fi
echo "SQLDev 서버 관리자를 시작합니다... 잠시 후 브라우저가 열립니다."
node manager/manager.js
