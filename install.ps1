#Requires -Version 5.1
[CmdletBinding()]
param(
  [string] $Dir = (Get-Location).Path,
  [string] $Version = '',
  [switch] $NoGlobal
)

$ErrorActionPreference = 'Stop'

$Repo = 'ohosvscode/mcp'
$BinaryName = 'arkts-mcp.exe'
$JsdelivrGh = "https://fastly.jsdelivr.net/gh/$Repo"
$JsdelivrApi = "https://data.jsdelivr.com/v1/package/gh/$Repo"
$ReleaseAssetsDir = 'release-assets'
$GitRef = 'main'

function Write-Usage {
  @"
Usage: .\install.ps1 [options]

Download the arkts-mcp executable for this platform, extract it here, and register it globally.

Options:
  -Dir DIR           Install directory (default: current directory)
  -Version TAG       Release tag or version (default: latest release)
  -NoGlobal          Do not add the install directory to the user PATH

Examples:
  irm ${JsdelivrGh}@${GitRef}/install.ps1 | iex
  .\install.ps1 -Version 0.0.1-alpha.2
"@
}

function Get-PlatformArtifact {
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
  switch ($arch) {
    'Arm64' { return 'win-arm64' }
    'X64' { return 'win-x64' }
    default { throw "Unsupported Windows architecture: $arch" }
  }
}

function Get-NormalizedVersion {
  param([string] $Value)
  $normalized = $Value.TrimStart('v')
  return ($normalized -replace '^@arkts/mcp@', '')
}

function Get-LatestVersion {
  $data = Invoke-RestMethod -Uri $JsdelivrApi
  if (-not $data.versions -or $data.versions.Count -eq 0) {
    throw 'Failed to resolve the latest version from jsDelivr.'
  }
  return [string]$data.versions[0]
}

function Get-AssetDownloadUrl {
  param(
    [string] $Version,
    [string] $AssetName,
    [string] $Ref = $GitRef
  )
  return "$JsdelivrGh@$Ref/$ReleaseAssetsDir/$AssetName"
}

function Test-ReleaseAsset {
  param([string] $Url)
  try {
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Method = 'HEAD'
    $request.UserAgent = 'arkts-mcp-installer'
    $request.AllowAutoRedirect = $true
    $response = $request.GetResponse()
    $response.Close()
    return $true
  }
  catch {
    return $false
  }
}

function Resolve-ReleaseAsset {
  param(
    [string] $Platform,
    [string] $VersionTag
  )

  $version = if ([string]::IsNullOrWhiteSpace($VersionTag)) {
    Get-LatestVersion
  }
  else {
    Get-NormalizedVersion $VersionTag
  }

  $assetName = "$Platform-$version.zip"
  $refs = @($GitRef, $version, "v$version")

  foreach ($ref in $refs) {
    $url = Get-AssetDownloadUrl -Version $version -AssetName $assetName -Ref $ref
    if (Test-ReleaseAsset -Url $url) {
      return [pscustomobject]@{
        Version = $version
        Name = $assetName
        Url = $url
      }
    }
  }

  throw "No release asset found for platform: $Platform (version: $version)"
}

function Save-FileWithProgress {
  param(
    [string] $Url,
    [string] $Destination
  )

  Write-Host 'Downloading...'

  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    & curl.exe -fL --progress-bar -o $Destination $Url
    if ($LASTEXITCODE -ne 0) {
      throw "Download failed: $Url"
    }
    return
  }

  $request = [System.Net.HttpWebRequest]::Create($Url)
  $request.UserAgent = 'arkts-mcp-installer'
  $request.AllowAutoRedirect = $true
  $response = $request.GetResponse()
  $total = $response.ContentLength
  $stream = $response.GetResponseStream()
  $fileStream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::Create)
  $buffer = New-Object byte[] 8192
  $read = 0
  $downloaded = 0L

  while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
    $fileStream.Write($buffer, 0, $read)
    $downloaded += $read
    if ($total -gt 0) {
      $percent = [math]::Floor(($downloaded * 100) / $total)
      Write-Progress -Activity 'Downloading arkts-mcp' -Status "$downloaded / $total bytes" -PercentComplete $percent
    }
  }

  Write-Progress -Activity 'Downloading arkts-mcp' -Completed
  $fileStream.Close()
  $stream.Close()
  $response.Close()
}

function Install-GlobalCommand {
  param([string] $InstallDirectory)

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $normalizedInstall = $InstallDirectory.TrimEnd('\')
  $pathEntries = $userPath -split ';' | Where-Object { $_ -ne '' }

  if ($pathEntries -notcontains $normalizedInstall) {
    $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) {
      $normalizedInstall
    }
    else {
      "$userPath;$normalizedInstall"
    }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    $env:Path = "$env:Path;$normalizedInstall"
    Write-Host "Added to user PATH: $normalizedInstall"
  }
  else {
    Write-Host "Install directory already in user PATH: $normalizedInstall"
  }

  Write-Host "Global command available: $BinaryName"
}

if ($PSBoundParameters.ContainsKey('Help')) {
  Write-Usage
  exit 0
}

$platform = Get-PlatformArtifact
$installDir = (Resolve-Path -Path $Dir).Path
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

Write-Host "Platform: $platform"
Write-Host "Install directory: $installDir"

$asset = Resolve-ReleaseAsset -Platform $platform -VersionTag $Version
$zipPath = Join-Path $installDir $asset.Name

Write-Host "Version: $($asset.Version)"
Write-Host "Asset: $($asset.Name)"
Save-FileWithProgress -Url $asset.Url -Destination $zipPath

Write-Host 'Extracting...'
Expand-Archive -Path $zipPath -DestinationPath $installDir -Force
Remove-Item -Path $zipPath -Force

$binaryPath = Join-Path $installDir $BinaryName
if (-not (Test-Path -LiteralPath $binaryPath)) {
  throw "Expected binary not found after extraction: $binaryPath"
}

if (-not $NoGlobal) {
  Install-GlobalCommand -InstallDirectory $installDir
}

Write-Host ''
Write-Host 'Installation complete.'
Write-Host "Run: $BinaryName --help"
if (-not $NoGlobal) {
  Write-Host 'Open a new terminal if the command is not available yet.'
}
