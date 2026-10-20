# Renders the README screenshots with headless Chrome (or Edge).
# Start the dev server first (npm run dev), then: powershell -File scripts/screenshots.ps1
# The demo scenes live in src/devShots.ts (http://localhost:5173/?shot=<name>).
param(
  [string]$Url = 'http://localhost:5173',
  [int]$Width = 1600,
  [int]$Height = 900,
  [string[]]$Shots = @('hero', 'night', 'scripts', 'terrain', 'mesh', 'measure', 'palette', 'tour', 'openscad', 'convert', 'plugins', 'text3d', 'translations')
)
$ErrorActionPreference = 'Stop'
# scenes with the OpenSCAD plugin load its 14 MB WebAssembly first (needs plugins/openscad/dist: npm run build there).
# Virtual time runs out long before that, so these are driven over the DevTools protocol instead and photographed
# as soon as the scene reports itself ready (document.body.dataset.shotReady) - at most this many seconds
$WaitForReady = @{ openscad = 120; convert = 90; plugins = 90; text3d = 60; translations = 60 }
# -File passes "palette,tour" as one string
$Shots = $Shots -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'docs\screenshots'
New-Item -ItemType Directory -Force $out | Out-Null

$browser = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'Chrome or Edge not found' }

# Sends one DevTools command and returns the raw JSON answer (the screenshot is too big for ConvertFrom-Json).
function Invoke-Cdp($socket, [int]$id, [string]$method, $params = @{}) {
  $json = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 6 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $socket.SendAsync((New-Object 'ArraySegment[byte]' (, $bytes)), 'Text', $true, [Threading.CancellationToken]::None).Wait()
  $buffer = New-Object byte[] 1048576
  while ($true) {
    $stream = New-Object IO.MemoryStream
    do {
      $result = $socket.ReceiveAsync((New-Object 'ArraySegment[byte]' (, $buffer)), [Threading.CancellationToken]::None).Result
      $stream.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)
    $message = [Text.Encoding]::UTF8.GetString($stream.ToArray())
    if ($message -match ('^\{"id":' + $id + '[,}]')) { return $message } # events have no id - skip them
  }
}

# Opens the scene in headless Chrome, waits until it is ready and saves a $Width x $Height screenshot.
function Save-ReadyShot([string]$shot, [string]$userDir, [string]$target, [int]$seconds) {
  $port = 9333
  $chrome = Start-Process -FilePath $browser -PassThru -WindowStyle Hidden -ArgumentList @(
    '--headless=new', "--user-data-dir=$userDir", "--remote-debugging-port=$port", "--window-size=$Width,$Height", '--hide-scrollbars',
    '--force-device-scale-factor=1', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank')
  try {
    $page = $null
    for ($i = 0; $i -lt 40 -and -not $page; $i++) {
      Start-Sleep -Milliseconds 250
      try { $page = (Invoke-RestMethod "http://127.0.0.1:$port/json/list") | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 } catch { }
    }
    if (-not $page) { throw "Chrome did not open a DevTools port for $shot" }
    $socket = New-Object Net.WebSockets.ClientWebSocket
    $socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
    $id = 0
    Invoke-Cdp $socket (++$id) 'Emulation.setDeviceMetricsOverride' @{ width = $Width; height = $Height; deviceScaleFactor = 1; mobile = $false } | Out-Null
    Invoke-Cdp $socket (++$id) 'Page.navigate' @{ url = "$Url/?shot=$shot" } | Out-Null
    $deadline = (Get-Date).AddSeconds($seconds); $ready = $false
    while (-not $ready -and (Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 500
      $answer = Invoke-Cdp $socket (++$id) 'Runtime.evaluate' @{ expression = "document.body?.dataset.shotReady ?? ''"; returnByValue = $true }
      $ready = $answer -match '"value":"1"'
    }
    if (-not $ready) { Write-Warning "$shot did not report ready within $seconds s - taking the screenshot anyway" }
    Start-Sleep -Milliseconds 500
    $answer = Invoke-Cdp $socket (++$id) 'Page.captureScreenshot' @{ format = 'png' }
    if ($answer -notmatch '"data":"([^"]+)"') { throw "no screenshot for $shot" }
    [IO.File]::WriteAllBytes($target, [Convert]::FromBase64String($Matches[1]))
    $socket.Dispose()
  } finally {
    & taskkill /PID $chrome.Id /T /F 2>&1 | Out-Null
  }
}

$tmp = Join-Path $env:TEMP "s3d-shots-raw-$PID"
New-Item -ItemType Directory -Force $tmp | Out-Null

try {
  foreach ($s in $Shots) {
    $raw = Join-Path $tmp "$s.png"
    # fresh profile per scene: no autosave or settings left over from the previous one
    $userDir = Join-Path $tmp "profile-$s"
    Write-Host "rendering $s ..."
    if ($WaitForReady[$s]) {
      $ErrorActionPreference = 'Continue'
      Save-ReadyShot $s $userDir (Join-Path $out "$s.png") $WaitForReady[$s]
      $ErrorActionPreference = 'Stop'
      continue
    }
    # headless Chrome keeps an invisible window frame - render a larger window and crop the page area
    # Chrome logs harmless warnings to stderr - Windows PowerShell would treat them as errors
    $ErrorActionPreference = 'Continue'
    & $browser --headless=new "--user-data-dir=$userDir" "--window-size=$($Width + 16),$($Height + 95)" --hide-scrollbars --force-device-scale-factor=1 `
      --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=15000 "--screenshot=$raw" "$Url/?shot=$s" 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    if (-not (Test-Path $raw)) { throw "no screenshot for $s" }
    $img = [System.Drawing.Image]::FromFile($raw)
    try {
      $crop = New-Object System.Drawing.Bitmap $Width, $Height
      $g = [System.Drawing.Graphics]::FromImage($crop)
      $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $Width, $Height), (New-Object System.Drawing.Rectangle 0, 0, $Width, $Height), [System.Drawing.GraphicsUnit]::Pixel)
      $g.Dispose()
      $crop.Save((Join-Path $out "$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
      $crop.Dispose()
    } finally { $img.Dispose() }
  }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
Write-Host "done - $($Shots.Count) screenshots in $out"
