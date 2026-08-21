Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = currentDir & "\IsraPrintAgent.exe"
WshShell.CurrentDirectory = currentDir

If fso.FileExists(exePath) Then
    WshShell.Run """" & exePath & """", 0, False
Else
    WshShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & currentDir & "\agent.ps1""", 0, False
End If

Set WshShell = Nothing
Set fso = Nothing
