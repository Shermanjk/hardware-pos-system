Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = currentDir & "\agent.ps1"
WshShell.CurrentDirectory = currentDir
WshShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """", 0, False
Set WshShell = Nothing
Set fso = Nothing
