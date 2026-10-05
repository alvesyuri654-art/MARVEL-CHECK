Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = scriptDir & "\start.ps1"
portFile = scriptDir & "\active_port.txt"

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

Function IsServerReady(port)
    On Error Resume Next
    Dim http
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    http.SetTimeouts 300, 300, 300, 300
    http.Open "GET", "http://127.0.0.1:" & port & "/api/health", False
    http.Send
    If Err.Number = 0 Then
        If http.Status = 200 And InStr(http.ResponseText, "marvel-checklist") > 0 Then
            IsServerReady = True
            Exit Function
        End If
    End If
    IsServerReady = False
    On Error Goto 0
End Function

currentPort = GetActivePort()

If Not IsServerReady(currentPort) Then
    powershellExe = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    If Not fso.FileExists(powershellExe) Then powershellExe = "powershell.exe"
    WshShell.Run """" & powershellExe & """ -NonInteractive -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """", 0, False
End If
