<#
.SYNOPSIS
  Generate rounded-corner brand icons for Synchro-D (app, taskbar, favicon).

DESCRIPTION
  Renders a gradient "badge" tile with a continuous rounded-rectangle mask
  (transparent outside the corners) and the white logo mark centered inside.

  Outputs:
    resources/icon.png   (512)  - BrowserWindow / notification icon
    public/favicon.png   (512)  - browser tab favicon
    build/icon.ico       (16/24/32/48/64/128/256 frames) - app/taskbar icon

Usage:
  powershell -ExecutionPolicy Bypass -File apps/desktop/tools/generate-icons.ps1
#>

[CmdletBinding()]
param(
  [string]$LogoPath,
  [double]$RadiusRatio = 0.22,
  [double]$LogoScale = 0.56
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
if (-not $LogoPath) { $LogoPath = Join-Path $PSScriptRoot '../public/logo.png' }
$ResourcesDir = Join-Path $root 'resources'
$PublicDir = Join-Path $root 'public'
$BuildDir = Join-Path $root 'build'

$primary = [System.Drawing.Color]::FromArgb(255, 59, 130, 246)
$violet = [System.Drawing.Color]::FromArgb(255, 139, 92, 246)

function New-BadgeBitmap([int]$size) {
  $bmp = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $radius = [float]($size * 0.22)
  if ($size -le 32) { $radius = [float]($size * 0.25) }
  $d = $radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc(0, 0, $d, $d, 180, 90)
  $path.AddArc($size - $d, 0, $d, $d, 270, 90)
  $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $path.AddArc(0, $size - $d, $d, $d, 90, 90)
  $path.CloseFigure()

  $rect = [System.Drawing.RectangleF]::new(0, 0, $size, $size)
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, $primary, $violet, 45.0)
  $g.FillPath($brush, $path)

  if (Test-Path -LiteralPath $LogoPath) {
    $logo = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $LogoPath).Path)
    $target = [double]($size * 0.56)
    $scale = [Math]::Min($target / $logo.Width, $target / $logo.Height)
    $w = [double]($logo.Width * $scale)
    $h = [double]($logo.Height * $scale)
    $x = [double](($size - $w) / 2)
    $y = [double](($size - $h) / 2)
    $g.DrawImage($logo, [float]$x, [float]$y, [float]$w, [float]$h)
    $logo.Dispose()
  } else {
    Write-Warning "Logo not found at $LogoPath; exporting gradient tile only."
  }

  $brush.Dispose()
  $path.Dispose()
  $g.Dispose()
  return $bmp
}

function Save-BadgePng([int]$size, [string]$path) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp = New-BadgeBitmap $size
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("  {0} ({1}px)" -f $path, $size)
}

$resolvedLogo = (Resolve-Path -LiteralPath $LogoPath -ErrorAction SilentlyContinue)
if ($resolvedLogo) { $LogoPath = $resolvedLogo.Path }

Write-Host 'Generating app icon PNGs...'
Save-BadgePng 512 (Join-Path $ResourcesDir 'icon.png')
Save-BadgePng 512 (Join-Path $PublicDir 'favicon.png')

Write-Host 'Building multi-resolution icon.ico...'
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$tmp = Join-Path $env:TEMP ("synchro-icon-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$frames = @()
foreach ($s in $sizes) {
  $p = Join-Path $tmp ("icon-$s.png")
  $bmp = New-BadgeBitmap $s
  $bmp.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $frames += [pscustomobject]@{ Size = $s; Bytes = [System.IO.File]::ReadAllBytes($p) }
}

$icoPath = Join-Path $BuildDir 'icon.ico'
if (-not (Test-Path -LiteralPath $BuildDir)) { New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null }

$memory = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($memory)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$frames.Count)
$offset = 6 + (16 * $frames.Count)
foreach ($f in $frames) {
  $dim = if ($f.Size -ge 256) { 0 } else { $f.Size }
  $writer.Write([Byte]$dim)
  $writer.Write([Byte]$dim)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$f.Bytes.Length)
  $writer.Write([UInt32]$offset)
  $offset += $f.Bytes.Length
}
foreach ($f in $frames) { $writer.Write($f.Bytes) }
$writer.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $memory.ToArray())
$writer.Dispose()
$memory.Dispose()
Remove-Item -Recurse -Force $tmp
Write-Host ("  {0} ({1} frames)" -f $icoPath, $frames.Count)
Write-Host 'Done.'
