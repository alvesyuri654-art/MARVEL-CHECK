if ($PSScriptRoot) { Set-Location $PSScriptRoot }
$AppDir = Get-Location

$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$icoPath = Join-Path $AppDir.Path "marvel_icon.ico"
$vbsPath = Join-Path $AppDir.Path "abrir_sistema.vbs"

# 1. Primary LNK Shortcut on Desktop: Marvel Check
$ShortcutPath1 = Join-Path $DesktopPath "Marvel Check.lnk"
$Shortcut1 = $WshShell.CreateShortcut($ShortcutPath1)
$Shortcut1.TargetPath = "wscript.exe"
$Shortcut1.Arguments = "`"$vbsPath`""
$Shortcut1.WorkingDirectory = $AppDir.Path
$Shortcut1.Description = "Marvel Check - Anomalias / Transportes Marvel"
if (Test-Path $icoPath) {
    $Shortcut1.IconLocation = "$icoPath, 0"
}
$Shortcut1.Save()

# 2. Secondary LNK Shortcut on Desktop: Anomalias Marvel - Torre de Controle
$ShortcutPath2 = Join-Path $DesktopPath "Anomalias Marvel - Torre de Controle.lnk"
$Shortcut2 = $WshShell.CreateShortcut($ShortcutPath2)
$Shortcut2.TargetPath = "wscript.exe"
$Shortcut2.Arguments = "`"$vbsPath`""
$Shortcut2.WorkingDirectory = $AppDir.Path
$Shortcut2.Description = "Acessar Sistema Anomalias Marvel"
if (Test-Path $icoPath) {
    $Shortcut2.IconLocation = "$icoPath, 0"
}
$Shortcut2.Save()

# 3. Startup Folder Shortcut for Automatic Server Readiness
$StartupPath = [System.Environment]::GetFolderPath('Startup')
$StartupShortcut = $WshShell.CreateShortcut("$StartupPath\MarvelChecklistServer.lnk")
$StartupShortcut.TargetPath = "wscript.exe"
$StartupShortcut.Arguments = "`"$(Join-Path $AppDir.Path 'iniciar_servidor.vbs')`""
$StartupShortcut.WorkingDirectory = $AppDir.Path
$StartupShortcut.Description = "Inicializacao automatica do Servidor Marvel"
$StartupShortcut.Save()

# 4. Notify Windows Shell to refresh Desktop icons
try {
    $code = @'
    using System;
    using System.Runtime.InteropServices;
    public class ShellNotify {
        [DllImport("shell32.dll")]
        public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
    }
'@
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
    [ShellNotify]::SHChangeNotify(0x8000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
} catch {}

Write-Host "ATALHOS CRIADOS COM SUCESSO NA ÁREA DE TRABALHO:"
Write-Host " - $ShortcutPath1"
Write-Host " - $ShortcutPath2"
