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
$GithubApi = "https://api.github.com/repos/$Repo"
$Headers = @{
  'Accept' = 'application/vnd.github+json'
  'User-Agent' = 'arkts-mcp-installer'
}

function Write-Usage {
  @"
Usage: .\install.ps1 [options]

Download the arkts-mcp executable for this platform, extract it here, and register it globally.

Options:
  -Dir DIR           Install directory (default: current directory)
  -Version TAG       Release tag or version (default: latest release)
  -NoGlobal          Do not add the install directory to the user PATH

Examples:
  irm https://raw.githubusercontent.com/$Repo/main/install.ps1 | iex
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

function Get-ReleaseJson {
  param([string] $VersionTag)

  if ([string]::IsNullOrWhiteSpace($VersionTag)) {
    try {
      return Invoke-RestMethod -Uri "$GithubApi/releases/latest" -Headers $Headers
    }
    catch {
      $releases = @(Invoke-RestMethod -Uri "$GithubApi/releases?per_page=1" -Headers $Headers)
      if ($releases.Count -eq 0) {
        throw 'No releases found'
      }
      return $releases[0]
    }
  }

  $normalized = $VersionTag.TrimStart('v')
  $normalized = $normalized -replace '^@arkts/mcp@', ''
  $candidates = @(
    $VersionTag,
    "v$normalized",
    "@arkts/mcp@$normalized"
  )

  foreach ($candidate in $candidates) {
    try {
      return Invoke-RestMethod -Uri "$GithubApi/releases/tags/$candidate" -Headers $Headers
    }
    catch {
      continue
    }
  }

  throw "Release not found for version: $VersionTag"
}

function Get-ReleaseAsset {
  param(
    [object] $Release,
    [string] $Platform
  )

  $asset = $Release.assets | Where-Object { $_.name -match "^$([regex]::Escape($Platform))-.*\.zip$" } | Select-Object -First 1
  if (-not $asset) {
    throw "No release asset found for platform: $Platform"
  }
  return $asset
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

$release = Get-ReleaseJson -VersionTag $Version
$asset = Get-ReleaseAsset -Release $release -Platform $platform
$zipPath = Join-Path $installDir $asset.name

Write-Host "Asset: $($asset.name)"
Save-FileWithProgress -Url $asset.browser_download_url -Destination $zipPath

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
