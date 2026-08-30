Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = currentDir & "\Launch_POS_Kiosk.bat"
WshShell.CurrentDirectory = currentDir

If fso.FileExists(batPath) Then
    WshShell.Run """" & batPath & """", 0, False
End If

Set WshShell = Nothing
Set fso = Nothing
