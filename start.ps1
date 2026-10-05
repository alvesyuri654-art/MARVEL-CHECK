if ($PSScriptRoot) { Set-Location $PSScriptRoot }
$path = Get-Location

function Export-ServerInfo($port) {
    $hostname = $env:COMPUTERNAME
    $localIPs = @()
    try {
        $addresses = [System.Net.Dns]::GetHostAddresses($hostname)
        foreach ($addr in $addresses) {
            if ($addr.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
                $ipStr = $addr.IPAddressToString
                if ($ipStr -ne "127.0.0.1" -and $localIPs -notcontains $ipStr) {
                    $localIPs += $ipStr
                }
            }
        }
    } catch {}

    $primaryIp = if ($localIPs.Count -gt 0) { $localIPs[0] } else { "127.0.0.1" }
    $serverInfoObj = @{
        port = $port
        hostname = $hostname
        ips = $localIPs
        primaryIp = $primaryIp
        serverUrl = "http://${primaryIp}:${port}/"
        updatedAt = (Get-Date).ToString("o")
    }
    $serverInfoJson = $serverInfoObj | ConvertTo-Json -Depth 5
    $serverInfoFile = Join-Path $path "server_info.json"
    $serverInfoJson | Out-File -FilePath $serverInfoFile -Encoding utf8 -Force

    $serverHostFile = Join-Path $path "server_host.txt"
    $primaryIp | Out-File -FilePath $serverHostFile -Encoding utf8 -Force
}

# 1. Check if server is ALREADY running and healthy on LAN IP
$portFile = Join-Path $path "active_port.txt"
$existingPort = 18080
if (Test-Path $portFile) {
    $savedPort = (Get-Content $portFile -ErrorAction SilentlyContinue).Trim()
    if ($savedPort -match '^\d+$') { $existingPort = [int]$savedPort }
}

$hostname = $env:COMPUTERNAME
$localIPs = @()
try {
    $addresses = [System.Net.Dns]::GetHostAddresses($hostname)
    foreach ($addr in $addresses) {
        if ($addr.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
            $ipStr = $addr.IPAddressToString
            if ($ipStr -ne "127.0.0.1" -and $localIPs -notcontains $ipStr) {
                $localIPs += $ipStr
            }
        }
    }
} catch {}
$primaryIp = if ($localIPs.Count -gt 0) { $localIPs[0] } else { "127.0.0.1" }

try {
    $healthLocal = (Invoke-WebRequest -Uri "http://127.0.0.1:$existingPort/api/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop).Content
    $healthLan = (Invoke-WebRequest -Uri "http://${primaryIp}:$existingPort/api/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop).Content
    if ($healthLocal -like "*marvel-checklist*" -and $healthLan -like "*marvel-checklist*") {
        Write-Host "Servidor Marvel ja esta rodando na porta $existingPort (LAN OK)"
        Export-ServerInfo $existingPort
        exit
    }
} catch {}

$portsToTry = @(18080, 18081, 18082, 18083, 18084, 8888, 8990)
$startedPort = $null
$listener = $null

foreach ($port in $portsToTry) {
    try {
        $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
        $l.Start()
        $listener = $l
        $startedPort = $port
        Write-Host "Servidor Marvel rodando com sucesso via TCP Listener em 0.0.0.0:$startedPort"
        break
    } catch {
        # Port busy, try next
    }
}

if (-not $startedPort -or -not $listener) {
    Write-Host "Nao foi possivel iniciar o servidor em nenhuma porta disponivel."
    exit
}

# Save active port and export server info
$startedPort | Out-File -FilePath $portFile -Encoding utf8 -Force
Export-ServerInfo $startedPort

$sharedDataFile = Join-Path $path "shared_checklists.json"
if (-not (Test-Path $sharedDataFile)) {
    "[]" | Out-File -FilePath $sharedDataFile -Encoding utf8
}

function Get-ActiveMailConfig {
    param($basePath)
    
    $envFile = Join-Path $basePath ".env"
    $envData = @{}
    if (Test-Path $envFile) {
        try {
            $lines = Get-Content $envFile -Encoding utf8
            foreach ($line in $lines) {
                $trimmed = $line.Trim()
                if ($trimmed -and -not $trimmed.StartsWith("#") -and $trimmed.Contains("=")) {
                    $parts = $trimmed.Split('=', 2)
                    $k = $parts[0].Trim()
                    $v = $parts[1].Trim().Trim('"').Trim("'")
                    $envData[$k] = $v
                }
            }
        } catch {}
    }

    $emailCfgFile = Join-Path $basePath "email_config.json"
    $jsonCfg = if (Test-Path $emailCfgFile) {
        try { (Get-Content $emailCfgFile -Raw -Encoding utf8) | ConvertFrom-Json } catch { [pscustomobject]@{} }
    } else { [pscustomobject]@{} }

    $tenantId = if ($env:MICROSOFT_TENANT_ID) { $env:MICROSOFT_TENANT_ID } elseif ($envData.ContainsKey("MICROSOFT_TENANT_ID")) { $envData["MICROSOFT_TENANT_ID"] } elseif ($jsonCfg.tenantId) { $jsonCfg.tenantId } else { "" }
    $clientId = if ($env:MICROSOFT_CLIENT_ID) { $env:MICROSOFT_CLIENT_ID } elseif ($envData.ContainsKey("MICROSOFT_CLIENT_ID")) { $envData["MICROSOFT_CLIENT_ID"] } elseif ($jsonCfg.clientId) { $jsonCfg.clientId } else { "" }
    $clientSecret = if ($env:MICROSOFT_CLIENT_SECRET) { $env:MICROSOFT_CLIENT_SECRET } elseif ($envData.ContainsKey("MICROSOFT_CLIENT_SECRET")) { $envData["MICROSOFT_CLIENT_SECRET"] } elseif ($jsonCfg.clientSecret) { $jsonCfg.clientSecret } else { "" }
    
    $senderEmail = if ($env:REPORT_EMAIL_FROM) { $env:REPORT_EMAIL_FROM } elseif ($env:OUTLOOK_EMAIL) { $env:OUTLOOK_EMAIL } elseif ($envData.ContainsKey("REPORT_EMAIL_FROM")) { $envData["REPORT_EMAIL_FROM"] } elseif ($envData.ContainsKey("OUTLOOK_EMAIL")) { $envData["OUTLOOK_EMAIL"] } elseif ($jsonCfg.senderEmail) { $jsonCfg.senderEmail } else { "yuri.alves@marvel.com.br" }
    $defaultRecipient = if ($env:REPORT_EMAIL_TO) { $env:REPORT_EMAIL_TO } elseif ($env:DEFAULT_RECIPIENT) { $env:DEFAULT_RECIPIENT } elseif ($envData.ContainsKey("REPORT_EMAIL_TO")) { $envData["REPORT_EMAIL_TO"] } elseif ($envData.ContainsKey("DEFAULT_RECIPIENT")) { $envData["DEFAULT_RECIPIENT"] } elseif ($jsonCfg.defaultRecipient) { $jsonCfg.defaultRecipient } else { "anomalia@marvel.com.br" }
    $defaultSubject = if ($env:DEFAULT_SUBJECT) { $env:DEFAULT_SUBJECT } elseif ($envData.ContainsKey("DEFAULT_SUBJECT")) { $envData["DEFAULT_SUBJECT"] } elseif ($jsonCfg.defaultSubject) { $jsonCfg.defaultSubject } else { "Relatório de Checklist - Protocolo {protocolo} - Frota {frota}" }
    $defaultBody = if ($env:DEFAULT_BODY) { $env:DEFAULT_BODY } elseif ($envData.ContainsKey("DEFAULT_BODY")) { $envData["DEFAULT_BODY"] } elseif ($jsonCfg.defaultBody) { $jsonCfg.defaultBody } else { "<p>Segue relatório do protocolo {protocolo}, frota {frota}.</p>" }

    return [pscustomobject]@{
        tenantId = "$tenantId".Trim()
        clientId = "$clientId".Trim()
        clientSecret = "$clientSecret".Trim()
        senderEmail = "$senderEmail".Trim()
        defaultRecipient = "$defaultRecipient".Trim()
        defaultSubject = "$defaultSubject".Trim()
        defaultBody = $defaultBody
        hasClientSecret = ("$clientSecret".Trim().Length -gt 0)
    }
}

while ($listener.Server.IsBound) {
    if (-not $listener.Pending()) {
        Start-Sleep -Milliseconds 30
        continue
    }

    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $stream.ReadTimeout = 30000
        $stream.WriteTimeout = 30000
        # Read HTTP headers byte-by-byte
        $headerBytes = New-Object System.Collections.Generic.List[byte]
        while ($true) {
            $b = $stream.ReadByte()
            if ($b -eq -1) { break }
            $headerBytes.Add([byte]$b)
            $len = $headerBytes.Count
            if ($len -ge 4) {
                if ($headerBytes[$len - 4] -eq 13 -and $headerBytes[$len - 3] -eq 10 -and 
                    $headerBytes[$len - 2] -eq 13 -and $headerBytes[$len - 1] -eq 10) {
                    break
                }
            }
        }

        if ($headerBytes.Count -lt 4) {
            $client.Close()
            continue
        }

        $headerText = [System.Text.Encoding]::ASCII.GetString($headerBytes.ToArray())
        $headerLines = $headerText -split "`r`n"
        $requestLine = $headerLines[0]
        if (-not $requestLine) {
            $client.Close()
            continue
        }

        $tokens = $requestLine.Split(' ')
        $method = $tokens[0]
        $url = if ($tokens.Count -gt 1) { $tokens[1] } else { "/" }
        $localPath = ($url -split '\?')[0]

        $contentLength = 0
        foreach ($hl in $headerLines) {
            if ($hl.ToLower().StartsWith("content-length:")) {
                $contentLength = [int]($hl.Split(':')[1].Trim())
                break
            }
        }

        # Read exact body bytes
        $bodyText = ""
        if ($contentLength -gt 0) {
            $bodyBytes = New-Object byte[] $contentLength
            $totalRead = 0
            while ($totalRead -lt $contentLength) {
                $read = $stream.Read($bodyBytes, $totalRead, $contentLength - $totalRead)
                if ($read -le 0) { break }
                $totalRead += $read
            }
            $bodyText = [System.Text.Encoding]::UTF8.GetString($bodyBytes, 0, $totalRead)
        }

        $headers = "HTTP/1.1 200 OK`r`n" +
                   "Access-Control-Allow-Origin: *`r`n" +
                   "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
                   "Access-Control-Allow-Headers: Content-Type`r`n" +
                   "X-Marvel-Server: Active`r`n"

        if ($method -eq "OPTIONS") {
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes("${headers}Content-Length: 0`r`n`r`n")
            $stream.Write($respBytes, 0, $respBytes.Length)
            $client.Close()
            continue
        }

        if ($localPath -eq "/api/health") {
            $body = '{"status":"ok","app":"marvel-checklist"}'
            $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
            $hdrStr = "${headers}Content-Type: application/json; charset=utf-8`r`nContent-Length: $($bodyBytes.Length)`r`n`r`n"
            $hdrBytes = [System.Text.Encoding]::UTF8.GetBytes($hdrStr)
            $stream.Write($hdrBytes, 0, $hdrBytes.Length)
            $stream.Write($bodyBytes, 0, $bodyBytes.Length)
            $client.Close()
            continue
        }

        if ($localPath.StartsWith("/api/checklists")) {
            if ($method -eq "GET") {
                $bodyBytes = if (Test-Path $sharedDataFile) { [System.IO.File]::ReadAllBytes($sharedDataFile) } else { [System.Text.Encoding]::UTF8.GetBytes("[]") }
                $hdrStr = "${headers}Content-Type: application/json; charset=utf-8`r`nContent-Length: $($bodyBytes.Length)`r`n`r`n"
                $hdrBytes = [System.Text.Encoding]::UTF8.GetBytes($hdrStr)
                $stream.Write($hdrBytes, 0, $hdrBytes.Length)
                $stream.Write($bodyBytes, 0, $bodyBytes.Length)
            }
            elseif ($method -eq "POST") {
                if ($bodyText.Trim().StartsWith("[") -and $bodyText.Trim().EndsWith("]")) {
                    [System.IO.File]::WriteAllText($sharedDataFile, $bodyText, [System.Text.Encoding]::UTF8)
                }
                $body = '{"status":"success"}'
                $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
                $hdrStr = "${headers}Content-Type: application/json; charset=utf-8`r`nContent-Length: $($bodyBytes.Length)`r`n`r`n"
                $hdrBytes = [System.Text.Encoding]::UTF8.GetBytes($hdrStr)
                $stream.Write($hdrBytes, 0, $hdrBytes.Length)
                $stream.Write($bodyBytes, 0, $bodyBytes.Length)
            }
            $client.Close()
            continue
        }

        if ($localPath -eq "/api/email/config") {
            $cfg = Get-ActiveMailConfig $path
            if ($method -eq "GET") {
                $safeCfg = [ordered]@{
                    status = "success"
                    senderEmail = $cfg.senderEmail
                    defaultRecipient = $cfg.defaultRecipient
                    defaultSubject = $cfg.defaultSubject
                    defaultBody = $cfg.defaultBody
                    tenantId = $cfg.tenantId
                    clientId = $cfg.clientId
                    hasClientSecret = $cfg.hasClientSecret
                    graphConfigured = ($cfg.tenantId -and $cfg.clientId -and $cfg.hasClientSecret)
                    outlookAppAvailable = $true
                }
                $respJson = $safeCfg | ConvertTo-Json -Depth 5
                $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
                $hdrStr = "${headers}Content-Type: application/json; charset=utf-8`r`nContent-Length: $($bodyBytes.Length)`r`n`r`n"
                $hdrBytes = [System.Text.Encoding]::UTF8.GetBytes($hdrStr)
                $stream.Write($hdrBytes, 0, $hdrBytes.Length)
                $stream.Write($bodyBytes, 0, $bodyBytes.Length)
            }
            elseif ($method -eq "POST") {
                try {
                    $newCfg = $bodyText | ConvertFrom-Json
                    $emailCfgFile = Join-Path $path "email_config.json"
                    $currentCfg = if (Test-Path $emailCfgFile) { (Get-Content $emailCfgFile -Raw -Encoding utf8) | ConvertFrom-Json } else { [pscustomobject]@{} }
                    
                    $merged = [ordered]@{
                        senderEmail = if ($newCfg.senderEmail) { $newCfg.senderEmail.Trim() } else { $currentCfg.senderEmail }
                        defaultRecipient = if ($newCfg.defaultRecipient) { $newCfg.defaultRecipient.Trim() } else { $currentCfg.defaultRecipient }
                        defaultSubject = if ($newCfg.defaultSubject) { $newCfg.defaultSubject.Trim() } else { $currentCfg.defaultSubject }
                        defaultBody = if ($newCfg.defaultBody -ne $null) { $newCfg.defaultBody } else { $currentCfg.defaultBody }
                        sendMethod = if ($newCfg.sendMethod) { $newCfg.sendMethod } else { if ($currentCfg.sendMethod) { $currentCfg.sendMethod } else { "outlook_app" } }
                        tenantId = if ($newCfg.tenantId -ne $null) { $newCfg.tenantId.Trim() } else { $currentCfg.tenantId }
                        clientId = if ($newCfg.clientId -ne $null) { $newCfg.clientId.Trim() } else { $currentCfg.clientId }
                        clientSecret = if ($newCfg.clientSecret) { $newCfg.clientSecret.Trim() } else { $currentCfg.clientSecret }
                    }
                    $merged | ConvertTo-Json -Depth 5 | Out-File -FilePath $emailCfgFile -Encoding utf8 -Force
                    $respBody = '{"status":"success","message":"Configurações salvas com sucesso."}'
                } catch {
                    $respBody = '{"status":"error","message":"' + ($_.Exception.Message -replace '"', '\"') + '"}'
                }
                $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($respBody)
                $hdrStr = "${headers}Content-Type: application/json; charset=utf-8`r`nContent-Length: $($bodyBytes.Length)`r`n`r`n"
                $hdrBytes = [System.Text.Encoding]::UTF8.GetBytes($hdrStr)
                $stream.Write($hdrBytes, 0, $hdrBytes.Length)
                $stream.Write($bodyBytes, 0, $bodyBytes.Length)
            }
            $client.Close()
            continue
        }

        if (($localPath -eq "/api/email/send" -or $localPath -eq "/api/send-report") -and $method -eq "POST") {
            $sendResult = @{ status = "error"; message = ""; method = "" }
            try {
                if (-not $bodyText -or $bodyText.Trim().Length -eq 0) {
                    throw "Corpo da requisição vazio."
                }
                $payload = $bodyText | ConvertFrom-Json
                $cfg = Get-ActiveMailConfig $path
                
                $recipient = if ($payload.recipient) { $payload.recipient.Trim() } else { $cfg.defaultRecipient }
                if (-not $recipient) { $recipient = "anomalia@marvel.com.br" }
                if ($recipient -notmatch "^[^@\s]+@[^@\s]+\.[^@\s]+$") {
                    throw "Destinatário de e-mail inválido ($recipient)."
                }
                
                $subject = if ($payload.subject) { $payload.subject.Trim() } else { "Relatório de Anomalias - Marvel Check" }
                $body = if ($payload.body) { $payload.body } else { "<p>Olá,<br>Segue em anexo o relatório de anomalias gerado pelo sistema.<br>Atenciosamente.</p>" }
                $filename = if ($payload.filename) { $payload.filename.Trim() } else { "Relatorio_Anomalias.pdf" }
                if (-not $filename.EndsWith(".pdf", [System.StringComparison]::OrdinalIgnoreCase)) { $filename += ".pdf" }
                
                $pdfBase64 = $payload.pdfBase64
                if (-not $pdfBase64) {
                    throw "O arquivo PDF gerado não foi fornecido para o envio (PDF vazio)."
                }
                
                $b64Index = $pdfBase64.IndexOf("base64,")
                $rawB64 = if ($b64Index -ge 0) { $pdfBase64.Substring($b64Index + 7).Trim() } else { $pdfBase64.Trim() }
                $pdfBytes = [System.Convert]::FromBase64String($rawB64)
                if ($pdfBytes.Length -lt 10) {
                    throw "Arquivo PDF recebido está inválido ou corrompido."
                }
                if ($pdfBytes.Length -gt 26214400) {
                    throw "O arquivo PDF excede o limite máximo permitido de 25 MB para envio por e-mail."
                }
                
                $sentOk = $false
                $methodUsed = ""
                $graphError = ""

                # Método 1: Microsoft Graph API oficial (OAuth 2.0 / Microsoft Entra ID)
                if ($cfg.tenantId -and $cfg.clientId -and $cfg.clientSecret) {
                    try {
                        $tokenUrl = "https://login.microsoftonline.com/$($cfg.tenantId)/oauth2/v2.0/token"
                        $tokenBody = @{
                            grant_type = "client_credentials"
                            client_id = $cfg.clientId
                            client_secret = $cfg.clientSecret
                            scope = "https://graph.microsoft.com/.default"
                        }
                        $tokenResp = Invoke-RestMethod -Uri $tokenUrl -Method Post -Body $tokenBody -ErrorAction Stop
                        $accessToken = $tokenResp.access_token

                        $sender = if ($cfg.senderEmail) { $cfg.senderEmail } else { "yuri.alves@marvel.com.br" }
                        $graphUrl = "https://graph.microsoft.com/v1.0/users/$sender/sendMail"

                        $graphPayload = @{
                            message = @{
                                subject = $subject
                                body = @{
                                    contentType = "HTML"
                                    content = $body
                                }
                                toRecipients = @(
                                    @{
                                        emailAddress = @{
                                            address = $recipient
                                        }
                                    }
                                )
                                attachments = @(
                                    @{
                                        "@odata.type" = "#microsoft.graph.fileAttachment"
                                        name = $filename
                                        contentType = "application/pdf"
                                        contentBytes = $rawB64
                                    }
                                )
                            }
                            saveToSentItems = "true"
                        } | ConvertTo-Json -Depth 10

                        $headersObj = @{
                            "Authorization" = "Bearer $accessToken"
                            "Content-Type" = "application/json"
                        }

                        $graphResp = Invoke-RestMethod -Uri $graphUrl -Method Post -Headers $headersObj -Body $graphPayload -ErrorAction Stop
                        $sentOk = $true
                        $methodUsed = "microsoft_graph_api"
                        $sendResult.status = "success"
                        $sendResult.method = "microsoft_graph_api"
                        $sendResult.message = "Relatório enviado com sucesso via Microsoft Graph API para $recipient."
                    } catch {
                        $graphError = "Microsoft Graph: " + $_.Exception.Message
                    }
                }

                # Método 2: Cliente Corporativo Oficial Microsoft 365 (Outlook Application COM)
                if (-not $sentOk) {
                    try {
                        $tempDir = [System.IO.Path]::GetTempPath()
                        $tempFilePath = Join-Path $tempDir $filename
                        [System.IO.File]::WriteAllBytes($tempFilePath, $pdfBytes)
                        
                        $ol = New-Object -ComObject Outlook.Application
                        $mail = $ol.CreateItem(0) # olMailItem
                        $mail.To = $recipient
                        $mail.Subject = $subject
                        $mail.HTMLBody = $body
                        $mail.Attachments.Add($tempFilePath)
                        $mail.Send()
                        
                        Start-Sleep -Milliseconds 300
                        if (Test-Path $tempFilePath) {
                            try { Remove-Item $tempFilePath -Force } catch {}
                        }
                        
                        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($mail) | Out-Null
                        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ol) | Out-Null
                        
                        $sentOk = $true
                        $methodUsed = "outlook_365_application"
                        $sendResult.status = "success"
                        $sendResult.method = "outlook_365_application"
                        $sendResult.message = "Relatório enviado com sucesso via Outlook/Microsoft 365 para $recipient."
                    } catch {
                        $finalErr = $_.Exception.Message
                        if ($graphError) { $finalErr = "$graphError | Falha Outlook: $finalErr" }
                        throw $finalErr
                    }
                }
            } catch {
                $sendResult.status = "error"
                $sendResult.message = "Falha ao enviar e-mail: $($_.Exception.Message)"
            }
            
            $respJson = $sendResult | ConvertTo-Json -Depth 5
            $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $hdrStr = "${headers}Content-Type: application/json; charset=utf-8`r`nContent-Length: $($bodyBytes.Length)`r`n`r`n"
            $hdrBytes = [System.Text.Encoding]::UTF8.GetBytes($hdrStr)
            $stream.Write($hdrBytes, 0, $hdrBytes.Length)
            $stream.Write($bodyBytes, 0, $bodyBytes.Length)
            $client.Close()
            continue
        }

        # Static Files
        if ($localPath -eq "/") { $localPath = "/index.html" }
        $filePath = Join-Path $path $localPath.TrimStart('/')

        if (Test-Path $filePath -PathType Leaf) {
            $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
            $mime = "text/html; charset=utf-8"
            if ($filePath.EndsWith(".css")) { $mime = "text/css; charset=utf-8" }
            elseif ($filePath.EndsWith(".js")) { $mime = "application/javascript; charset=utf-8" }
            elseif ($filePath.EndsWith(".png")) { $mime = "image/png" }
            elseif ($filePath.EndsWith(".jpg") -or $filePath.EndsWith(".jpeg")) { $mime = "image/jpeg" }
            elseif ($filePath.EndsWith(".json")) { $mime = "application/json; charset=utf-8" }

            $hdrStr = "${headers}Content-Type: ${mime}`r`nContent-Length: $($fileBytes.Length)`r`n`r`n"
            $hdrBytes = [System.Text.Encoding]::UTF8.GetBytes($hdrStr)
            $stream.Write($hdrBytes, 0, $hdrBytes.Length)
            $stream.Write($fileBytes, 0, $fileBytes.Length)
        } else {
            $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $hdrStr = "HTTP/1.1 404 Not Found`r`nContent-Length: $($bodyBytes.Length)`r`n`r`n"
            $hdrBytes = [System.Text.Encoding]::UTF8.GetBytes($hdrStr)
            $stream.Write($hdrBytes, 0, $hdrBytes.Length)
            $stream.Write($bodyBytes, 0, $bodyBytes.Length)
        }

        $client.Close()
    } catch {
        try { $client.Close() } catch {}
    }
}
