' ──────────────────────────────────────────────────────────────
' start-manager.vbs
' SQLDev 관리자를 CMD 창 없이 백그라운드에서 실행합니다.
' 이 파일을 직접 실행하지 마세요 — start-manager.bat 이 호출합니다.
' ──────────────────────────────────────────────────────────────
Dim WshShell, fso, rootDir, nodeCmd

Set WshShell = CreateObject("WScript.Shell")
Set fso     = CreateObject("Scripting.FileSystemObject")

' 이 .vbs 파일이 있는 폴더 = 프로젝트 루트
rootDir = fso.GetParentFolderName(WScript.ScriptFullPath)

' 작업 디렉터리를 프로젝트 루트로 설정
WshShell.CurrentDirectory = rootDir

' --no-open : manager.js 가 브라우저를 자동으로 열지 않도록 함
'             (브라우저 열기는 .bat 파일에서 직접 처리)
nodeCmd = "node """ & rootDir & "\manager\manager.js"" --no-open"

' windowStyle = 0 (숨김), bWaitOnReturn = False (비동기)
WshShell.Run nodeCmd, 0, False
