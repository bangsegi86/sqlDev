' start-manager.vbs
' SQLDev 관리자를 CMD 창 없이 백그라운드에서 실행합니다.
Dim WshShell, fso, rootDir, nodeCmd

Set WshShell = CreateObject("WScript.Shell")
Set fso     = CreateObject("Scripting.FileSystemObject")

' WScript.ScriptFullName = 이 .vbs 파일의 전체 경로 (올바른 속성명)
rootDir = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = rootDir

' windowStyle = 0 (숨김), bWaitOnReturn = False (비동기)
nodeCmd = "node """ & rootDir & "\manager\manager.js"" --no-open"
WshShell.Run nodeCmd, 0, False
