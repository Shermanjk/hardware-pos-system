Set oWS = WScript.CreateObject("WScript.Shell")
oWS.CurrentDirectory = "E:\POS System"
oWS.Run """E:\POS System\node_modules\electron\dist\electron.exe"" ""E:\POS System\electron\main.cjs""", 0, False
