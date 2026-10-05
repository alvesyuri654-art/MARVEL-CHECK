Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = scriptDir & "\start.ps1"
portFile = scriptDir & "\active_port.txt"
hostFile = scriptDir & "\server_host.txt"

Function GetActivePort()
    On Error Resume Next
    If fso.FileExists(portFile) Then
        Set file = fso.OpenTextFile(portFile, 1)
        portStr = Trim(file.ReadAll())
        file.Close
        If IsNumeric(portStr) Then
            GetActivePort = Trim(portStr)
            Exit Function
        End If
    End If
    GetActivePort = "18080"
    On Error Goto 0
End Function

Function GetServerHost()
    On Error Resume Next
    ' Check if script path is UNC e.g. \\servidor\CONTROLES\...
    If Left(scriptDir, 2) = "\\" Then
        Dim parts
        parts = Split(scriptDir, "\")
        If UBound(parts) >= 2 Then
            If parts(2) <> "" Then
                GetServerHost = parts(2)
                Exit Function
            End If
        End If
    End If

    ' Check server_host.txt file
    If fso.FileExists(hostFile) Then
        Set file = fso.OpenTextFile(hostFile, 1)
        hStr = Trim(file.ReadAll())
        file.Close
        If hStr <> "" Then
            GetServerHost = hStr
            Exit Function
        End If
    End If

    GetServerHost = "127.0.0.1"
    On Error Goto 0
End Function

Function IsHostReady(targetHost, port)
    On Error Resume Next
    Dim http
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    http.SetTimeouts 500, 500, 500, 500
    http.Open "GET", "http://" & targetHost & ":" & port & "/api/health", False
    http.Send
    If Err.Number = 0 Then
        If http.Status = 200 And InStr(http.ResponseText, "marvel-checklist") > 0 Then
            IsHostReady = True
            Exit Function
        End If
    End If
    IsHostReady = False
    On Error Goto 0
End Function

currentPort = GetActivePort()
serverHost = GetServerHost()

' 1. Check if server host is accessible (localhost or network host)
If IsHostReady("127.0.0.1", currentPort) Then
    targetUrl = "http://localhost:" & currentPort & "/"
ElseIf serverHost <> "127.0.0.1" And IsHostReady(serverHost, currentPort) Then
    targetUrl = "http://" & serverHost & ":" & currentPort & "/"
Else
    ' 2. Try starting PowerShell daemon on local machine if server not reachable
    powershellExe = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    If Not fso.FileExists(powershellExe) Then powershellExe = "powershell.exe"
    WshShell.Run """" & powershellExe & """ -NonInteractive -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """", 0, False
    
    ' Poll for local server readiness (up to 30 x 200ms = 6s)
    Dim i
    For i = 1 To 30
        WScript.Sleep 200
        currentPort = GetActivePort()
        If IsHostReady("127.0.0.1", currentPort) Then Exit For
    Next

    If IsHostReady("127.0.0.1", currentPort) Then
        targetUrl = "http://localhost:" & currentPort & "/"
    ElseIf serverHost <> "127.0.0.1" Then
        targetUrl = "http://" & serverHost & ":" & currentPort & "/"
    Else
        targetUrl = "http://localhost:18080/"
    End If
End If

' 3. Locate Browser binary (Chrome or Edge)
Dim browserPath
browserPath = ""
If fso.FileExists("C:\Program Files\Google\Chrome\Application\chrome.exe") Then
    browserPath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
ElseIf fso.FileExists("C:\Program Files (x86)\Google\Chrome\Application\chrome.exe") Then
    browserPath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
ElseIf fso.FileExists("C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe") Then
    browserPath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
ElseIf fso.FileExists("C:\Program Files\Microsoft\Edge\Application\msedge.exe") Then
    browserPath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
End If

' 4. Open system in browser
If browserPath <> "" Then
    WshShell.Run """" & browserPath & """ """ & targetUrl & """", 1, False
Else
    WshShell.Run "cmd /c start """" """ & targetUrl & """", 0, False
End If
