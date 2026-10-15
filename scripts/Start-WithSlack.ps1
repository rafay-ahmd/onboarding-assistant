[CmdletBinding()]
param([string]$NodePath = 'node', [int]$Port = 4173)
# Credentials exist in this process and its Node child only. Nothing is saved.
$secret = Read-Host 'Slack USER OAuth token (hidden)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $env:SLACK_USER_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
$env:SLACK_TEAM_ID = 'TT299RP8X'
$env:SLACK_CHANNEL_ID = 'C0111SZ86CE'
$env:PORT = [string]$Port
try { & $NodePath (Join-Path $PSScriptRoot '..\server.mjs') }
finally { Remove-Item Env:SLACK_USER_TOKEN -ErrorAction SilentlyContinue }
