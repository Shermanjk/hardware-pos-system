Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = oWS.SpecialFolders("Desktop") & "\Isra Hardware POS.lnk"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "e:\POS System\dist\win-unpacked\Isra Hardware POS.exe"
oLink.WorkingDirectory = "e:\POS System\dist\win-unpacked"
oLink.IconLocation = "e:\POS System\client\public\Desktop Icon.ico"
oLink.Description = "Isra Hardware POS"
oLink.Save
WScript.Echo "Desktop shortcut created successfully!"
