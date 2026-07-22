Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "C:\Users\Public\Desktop\Isra Hardware POS.lnk"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "wscript.exe"
oLink.Arguments = """E:\POS System\launch.vbs"""
oLink.WorkingDirectory = "E:\POS System"
oLink.IconLocation = "E:\POS System\client\public\Desktop Icon.ico"
oLink.Description = "Isra Hardware POS"
oLink.Save
WScript.Echo "Shortcut created on Desktop!"
