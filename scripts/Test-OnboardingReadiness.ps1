[CmdletBinding()]
param(
    [string]$SourceRoot = 'C:\dtnsourcecode',
    [string]$OracleRoot = 'C:\Oracle\product\11.2.0\client_1',
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\reports\readiness.json')
)

# Local inspection only. Does not run setup, install, restore, build, authenticate,
# probe remote services, or read configuration/connection-string contents.
$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check($Id, $Name, $Status, $Detail) {
    $checks.Add([pscustomobject]@{ id=$Id; name=$Name; status=$Status; detail=$Detail })
}
function Check-Path($Id, $Name, $Path, $Instruction) {
    try {
        $present = Test-Path -LiteralPath $Path -ErrorAction Stop
        if ($present) { Add-Check $Id $Name 'ready' 'Expected local path exists; functionality is not verified.' }
        else { Add-Check $Id $Name 'missing' $Instruction }
    } catch { Add-Check $Id $Name 'blocked' 'Inspection was denied or unavailable. No changes made.' }
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    $elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($elevated) { Add-Check 'elevation' 'Current process elevation' 'ready' 'This process is elevated. This does not verify entitlement duration.' }
    else { Add-Check 'elevation' 'Current process elevation' 'unverified' 'Running without elevation. This does not prove admin rights are absent; the checker does not require elevation.' }
} catch { Add-Check 'elevation' 'Current process elevation' 'blocked' 'Could not inspect Windows token.' }

foreach ($tool in @('git','nuget','winget')) {
    if (Get-Command $tool -ErrorAction SilentlyContinue) { Add-Check $tool "$tool on PATH" 'ready' 'Command is discoverable. Authentication and execution are not verified.' }
    else { Add-Check $tool "$tool on PATH" 'missing' 'Command is not on the current process PATH; it may be installed elsewhere.' }
}
try {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $lfs = & git lfs version 2>$null
        if ($LASTEXITCODE -eq 0) { Add-Check 'lfs' 'Git LFS' 'ready' 'Git LFS responds to its version command.' }
        else { Add-Check 'lfs' 'Git LFS' 'missing' 'Install/enable Git LFS before cloning the setup repository.' }
    } else { Add-Check 'lfs' 'Git LFS' 'unverified' 'Git is not available on PATH.' }
} catch { Add-Check 'lfs' 'Git LFS' 'blocked' 'Could not execute the version check.' }

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
try {
    if (Test-Path -LiteralPath $vswhere) {
        $msbuild = @(& $vswhere -products '*' -latest -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe')
        $web = @(& $vswhere -products '*' -latest -requires Microsoft.VisualStudio.Workload.NetWeb -property installationPath)
        if ($msbuild.Count -gt 0) { Add-Check 'msbuild' 'Visual Studio MSBuild' 'ready' 'Visual Studio MSBuild was located. No build was run.' }
        else { Add-Check 'msbuild' 'Visual Studio MSBuild' 'missing' 'Install the approved Visual Studio MSBuild components.' }
        if ($web.Count -gt 0) { Add-Check 'web-workload' 'ASP.NET web workload' 'ready' 'Visual Studio reports the NetWeb workload installed.' }
        else { Add-Check 'web-workload' 'ASP.NET web workload' 'missing' 'Visual Studio does not report the NetWeb workload; verify equivalent individual components if installed.' }
    } else {
        Add-Check 'msbuild' 'Visual Studio MSBuild' 'unverified' 'vswhere was not found in the expected location.'
        Add-Check 'web-workload' 'ASP.NET web workload' 'unverified' 'Visual Studio inventory unavailable.'
    }
} catch {
    Add-Check 'msbuild' 'Visual Studio MSBuild' 'blocked' 'Visual Studio inventory failed.'
    Add-Check 'web-workload' 'ASP.NET web workload' 'blocked' 'Visual Studio inventory failed.'
}
foreach ($version in @('4.5.2','4.6.1','4.6.2','4.8')) {
    $path = Join-Path ${env:ProgramFiles(x86)} "Reference Assemblies\Microsoft\Framework\.NETFramework\v$version\mscorlib.dll"
    Check-Path "net-$version" ".NET Framework $version reference assemblies" $path 'Reference assemblies were not found. Confirm project requirements and obtain IT approval if installation is blocked.'
}
Check-Path 'oracle' '32-bit Oracle client expected path' (Join-Path $OracleRoot 'bin\oci.dll') 'Expected Oracle client DLL is absent. A different installation path may be in use; architecture is not checked.'
Check-Path 'tns' 'Oracle naming configuration' (Join-Path $OracleRoot 'network\admin\tnsnames.ora') 'Expected tnsnames.ora is absent. Contents and credentials are not read.'
foreach ($repo in @('dev-workstation-setup','DTN.Core.Base','DTN.Status','DTN.CommonObjects','DTN.ReferenceLib')) {
    Check-Path "repo-$repo" "$repo checkout" (Join-Path $SourceRoot "$repo\.git") 'Repository metadata is absent at the expected path. Remote access and branch are not checked.'
}
foreach ($asset in @('wwwroot\wwwroot.zip','oracle\win32_11gR2_client.zip')) {
    try {
        $path = Join-Path $SourceRoot "dev-workstation-setup\$asset"
        if (Test-Path -LiteralPath $path) {
            $size = (Get-Item -LiteralPath $path -ErrorAction Stop).Length
            if ($size -lt 1024) { Add-Check "asset-$asset" $asset 'missing' 'File is tiny and may be an LFS pointer. Fetch real assets before setup.' }
            else { Add-Check "asset-$asset" $asset 'ready' 'File exceeds pointer size. Archive integrity and completeness are not verified.' }
        } else { Add-Check "asset-$asset" $asset 'missing' 'Setup asset is absent.' }
    } catch { Add-Check "asset-$asset" $asset 'blocked' 'Could not inspect file metadata.' }
}
Check-Path 'countryhawk-root' 'Shared CountryHawk DLL' 'C:\inetpub\wwwroot\Bin\CountryHawk.dll' 'Shared DLL is absent; check complete extraction of approved wwwroot assets.'
$appcmd = Join-Path $env:windir 'System32\inetsrv\appcmd.exe'
try {
    if (Test-Path -LiteralPath $appcmd) {
        $poolChecks = @(
            @{ name='DealerTrackCanadaX86'; id='iis-core'; application='/DTCanada/Core'; path=(Join-Path $SourceRoot 'DTN.Core.Base\DTN.Core.Web') },
            @{ name='Status'; id='iis-status'; application='/DTCanada/Status'; path=(Join-Path $SourceRoot 'DTN.Status\DTC.Status.Website') }
        )
        foreach ($expected in $poolChecks) {
            $poolText = & $appcmd list apppool $expected.name /xml 2>$null
            $poolExit = $LASTEXITCODE
            $appsText = & $appcmd list app /xml 2>$null
            $appsExit = $LASTEXITCODE
            $dirsText = & $appcmd list vdir /xml 2>$null
            $dirsExit = $LASTEXITCODE
            if ($poolExit -ne 0 -or $appsExit -ne 0 -or $dirsExit -ne 0) {
                Add-Check $expected.id "IIS $($expected.name)" 'blocked' 'IIS inventory unavailable; permissions or missing configuration may be responsible.'
                continue
            }
            [xml]$poolXml = $poolText -join "`n"
            [xml]$appsXml = $appsText -join "`n"
            [xml]$dirsXml = $dirsText -join "`n"
            $pool = @($poolXml.appcmd.APPPOOL)[0]
            $app = @($appsXml.appcmd.APP | Where-Object { $_.'APP.NAME' -eq "DealerTrackCanada$($expected.application)" })
            $dir = @($dirsXml.appcmd.VDIR | Where-Object { $_.'VDIR.NAME' -eq "DealerTrackCanada$($expected.application)/" })
            if ($null -eq $pool -or $app.Count -eq 0 -or $dir.Count -eq 0) {
                Add-Check $expected.id "IIS $($expected.name)" 'missing' 'Expected application, pool, or virtual directory is absent.'
            } elseif ($app[0].'APPPOOL.NAME' -ne $expected.name -or $dir[0].physicalPath -ne $expected.path) {
                Add-Check $expected.id "IIS $($expected.name)" 'missing' 'Application pool or physical path differs from the expected profile. Review manually; no changes made.'
            } else {
                Add-Check $expected.id "IIS $($expected.name)" 'unverified' 'Application mapping matches. Detailed pool architecture, pipeline, identity and runtime settings still need verification.'
            }
        }
    } else {
        Add-Check 'iis-core' 'IIS Core' 'missing' 'appcmd is absent at the expected path.'
        Add-Check 'iis-status' 'IIS Status' 'missing' 'appcmd is absent at the expected path.'
    }
} catch {
    Add-Check 'iis-inventory' 'IIS inventory' 'blocked' 'IIS inventory could not be interpreted. No changes made.'
}
foreach ($item in @(
    @{ id='github-auth'; name='GitHub access' },
    @{ id='jfrog-auth'; name='JFrog access / package restore' },
    @{ id='vpn-connectivity'; name='VPN / database connectivity' },
    @{ id='app-smoke'; name='Application smoke test' }
)) { Add-Check $item.id $item.name 'unverified' 'Not tested by the local-only checker. Requires a separate approved verification step.' }

$report = [ordered]@{
    schemaVersion=1
    profileId='dealertrack-developer'
    generatedAt=[DateTime]::UtcNow.ToString('o')
    mode='read-only'
    checks=@($checks.ToArray())
}
$absoluteOutput = [IO.Path]::GetFullPath($OutputPath)
$parent = Split-Path -Parent $absoluteOutput
if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $absoluteOutput -Encoding UTF8
Write-Output "Report saved to $absoluteOutput"
$checks | Group-Object status | Select-Object Name,Count | Format-Table -AutoSize
