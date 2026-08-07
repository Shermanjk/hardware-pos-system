Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = oWS.SpecialFolders("Desktop") & "\Isra Hardware POS.lnk"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "http://ISRA-POS-SERVER:3001"
oLink.IconLocation = "C:\Windows\System32\shell32.dll,44"
oLink.Description = "Isra Hardware POS - Browser Application"
oLink.Save
WScript.Echo "Desktop shortcut created successfully!"
