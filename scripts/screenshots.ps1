# Renders the README screenshots with headless Chrome (or Edge). Linux and macOS: scripts/screenshots.sh (same scenes and options).
# Start the dev server first (npm run dev), then: powershell -File scripts/screenshots.ps1
# The demo scenes live in src/devShots.ts (http://localhost:5173/?shot=<name>).
# Plugin packages render their own screenshots: -Query adds URL parameters (e.g. "package=<folder>" installs
# plugins/<folder>/dist first), -Out picks the folder (relative to the current one) and -Name the file name.
param(
  [string]$Url = 'http://localhost:5173',
  [int]$Width = 1600,
  [int]$Height = 900,
  [string[]]$Shots = @('hero', 'night', 'scripts', 'terrain', 'mesh', 'measure', 'palette', 'tour', 'convert', 'plugins', 'text3d', 'translations'),
  [string]$Query = '',
  [string]$Out = '',
  [string]$Name = ''
)
$ErrorActionPreference = 'Stop'
# Some scenes take longer than headless Chrome's virtual time (fonts, plugin packages with WebAssembly). These are
# driven over the DevTools protocol instead (scripts/capture-shot.mjs, needs Node.js 22) and photographed as soon as the
# scene reports itself ready (document.body.dataset.shotReady) - at most this many seconds. Every scene that installs a
# package waits like that.
$WaitForReady = @{ script = 120; convert = 90; plugins = 90; text3d = 60; translations = 60 }
# -File passes "palette,tour" as one string
$Shots = $Shots -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if ($Name -and $Shots.Count -ne 1) { throw '-Name needs exactly one shot' }
$extra = if ($Query) { '&' + $Query.TrimStart('&', '?') } else { '' }
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$out = if ($Out) { Join-Path (Get-Location) $Out } else { Join-Path $root 'docs\screenshots' }
New-Item -ItemType Directory -Force $out | Out-Null

$browser = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'Chrome or Edge not found' }

# Opens the scene in headless Chrome, waits until it is ready and saves a $Width x $Height screenshot.
# The DevTools part (waiting, screenshot, closing the browser) is scripts/capture-shot.mjs - shared with screenshots.sh.
$script:port = 9332
function Save-ReadyShot([string]$shot, [string]$userDir, [string]$target, [int]$seconds) {
  $script:port++ # a port of its own per scene, so a Chrome that is still closing cannot answer
  $chrome = Start-Process -FilePath $browser -PassThru -WindowStyle Hidden -ArgumentList @(
    '--headless=new', "--user-data-dir=$userDir", "--remote-debugging-port=$($script:port)", "--window-size=$Width,$Height", '--hide-scrollbars',
    '--force-device-scale-factor=1', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank')
  try {
    & node (Join-Path $PSScriptRoot 'capture-shot.mjs') $script:port "$Url/?shot=$shot$extra" $Width $Height $seconds $target $shot
    if ($LASTEXITCODE -ne 0) { throw "no screenshot for $shot" }
  } finally {
    # capture-shot.mjs closes the browser itself - this only catches a Chrome that is left over
    & taskkill /PID $chrome.Id /T /F 2>&1 | Out-Null
  }
}

$tmp = Join-Path $env:TEMP "s3d-shots-raw-$PID"
New-Item -ItemType Directory -Force $tmp | Out-Null

try {
  foreach ($s in $Shots) {
    $raw = Join-Path $tmp "$s.png"
    $file = Join-Path $out "$(if ($Name) { $Name } else { $s }).png"
    $seconds = if ($WaitForReady[$s]) { $WaitForReady[$s] } elseif ($Query -match 'package=') { 120 } else { 0 }
    # fresh profile per scene: no autosave or settings left over from the previous one
    $userDir = Join-Path $tmp "profile-$s"
    Write-Host "rendering $s ..."
    if ($seconds) {
      $ErrorActionPreference = 'Continue'
      Save-ReadyShot $s $userDir $file $seconds
      $ErrorActionPreference = 'Stop'
      continue
    }
    # headless Chrome keeps an invisible window frame - render a larger window and crop the page area
    # Chrome logs harmless warnings to stderr - Windows PowerShell would treat them as errors
    $ErrorActionPreference = 'Continue'
    & $browser --headless=new "--user-data-dir=$userDir" "--window-size=$($Width + 16),$($Height + 95)" --hide-scrollbars --force-device-scale-factor=1 `
      --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=15000 "--screenshot=$raw" "$Url/?shot=$s$extra" 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    if (-not (Test-Path $raw)) { throw "no screenshot for $s" }
    $img = [System.Drawing.Image]::FromFile($raw)
    try {
      $crop = New-Object System.Drawing.Bitmap $Width, $Height
      $g = [System.Drawing.Graphics]::FromImage($crop)
      $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $Width, $Height), (New-Object System.Drawing.Rectangle 0, 0, $Width, $Height), [System.Drawing.GraphicsUnit]::Pixel)
      $g.Dispose()
      $crop.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
      $crop.Dispose()
    } finally { $img.Dispose() }
  }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
Write-Host "done - $($Shots.Count) screenshots in $out"
