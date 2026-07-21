param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$assetDirectory = Join-Path $ProjectRoot "assets\installer"
$artworkPath = Join-Path $assetDirectory "installer-artwork.png"
$gifPath = Join-Path $assetDirectory "installer-loading.gif"
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source

foreach ($requiredPath in @($artworkPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Не найден исходный файл: $requiredPath"
  }
}

function New-RoundedRectanglePath {
  param(
    [System.Drawing.RectangleF]$Rectangle,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($Rectangle.X, $Rectangle.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rectangle.X, $Rectangle.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-InstallerGif {
  $width = 268
  $height = 167
  $frameRate = 15
  $frameCount = 60
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $tempDirectory = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ("ytll-installer-" + [guid]::NewGuid().ToString("N"))))
  if (-not $tempDirectory.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      -not (Split-Path $tempDirectory -Leaf).StartsWith("ytll-installer-")) {
    throw "Небезопасный путь временного каталога: $tempDirectory"
  }
  $source = [System.Drawing.Bitmap]::FromFile($artworkPath)

  New-Item -ItemType Directory -Force -Path $tempDirectory | Out-Null

  $brandFont = [System.Drawing.Font]::new("Segoe UI", 9, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $badgeFont = [System.Drawing.Font]::new("Segoe UI", 7, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $statusFont = [System.Drawing.Font]::new("Segoe UI", 8, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $mint = [System.Drawing.ColorTranslator]::FromHtml("#71f6bf")
  $text = [System.Drawing.ColorTranslator]::FromHtml("#e9f1fa")
  $muted = [System.Drawing.ColorTranslator]::FromHtml("#91a0b3")
  $track = [System.Drawing.ColorTranslator]::FromHtml("#2a3849")

  try {
    $targetRatio = $width / $height
    $sourceRatio = $source.Width / $source.Height
    if ($sourceRatio -gt $targetRatio) {
      $sourceWidth = [int]($source.Height * $targetRatio)
      $sourceRect = [System.Drawing.Rectangle]::new([int](($source.Width - $sourceWidth) / 2), 0, $sourceWidth, $source.Height)
    } else {
      $sourceHeight = [int]($source.Width / $targetRatio)
      $sourceRect = [System.Drawing.Rectangle]::new(0, [int](($source.Height - $sourceHeight) / 2), $source.Width, $sourceHeight)
    }

    for ($index = 0; $index -lt $frameCount; $index += 1) {
      $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

      try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
        $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(0, 0, $width, $height), $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)

        $topShade = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(92, 8, 13, 18))
        $bottomShade = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(138, 8, 13, 18))
        $badgeBrush = [System.Drawing.SolidBrush]::new($mint)
        $badgeTextBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#073b2c"))
        $textBrush = [System.Drawing.SolidBrush]::new($text)
        $mutedBrush = [System.Drawing.SolidBrush]::new($muted)
        $trackBrush = [System.Drawing.SolidBrush]::new($track)
        $mintBrush = [System.Drawing.SolidBrush]::new($mint)
        $badgePath = New-RoundedRectanglePath -Rectangle ([System.Drawing.RectangleF]::new(13, 11, 19, 19)) -Radius 5

        try {
          $graphics.FillRectangle($topShade, 0, 0, $width, 39)
          $graphics.FillRectangle($bottomShade, 0, 119, $width, 48)
          $graphics.FillPath($badgeBrush, $badgePath)
          $graphics.DrawString("YT", $badgeFont, $badgeTextBrush, 17, 16)
          $graphics.DrawString("LANG LEARNING", $brandFont, $textBrush, 39, 15)
          $graphics.DrawString("УСТАНОВКА ПРИЛОЖЕНИЯ", $statusFont, $mutedBrush, 14, 128)

          $trackX = 14
          $trackY = 150
          $trackWidth = 240
          $trackHeight = 3
          $segmentWidth = 58
          $graphics.FillRectangle($trackBrush, $trackX, $trackY, $trackWidth, $trackHeight)

          $travel = $trackWidth + ($segmentWidth * 2)
          $segmentX = $trackX - $segmentWidth + [int](($index / ($frameCount - 1)) * $travel)
          $visibleLeft = [Math]::Max($trackX, $segmentX)
          $visibleRight = [Math]::Min($trackX + $trackWidth, $segmentX + $segmentWidth)
          if ($visibleRight -gt $visibleLeft) {
            $graphics.FillRectangle($mintBrush, $visibleLeft, $trackY, $visibleRight - $visibleLeft, $trackHeight)
          }
        } finally {
          $badgePath.Dispose()
          $topShade.Dispose()
          $bottomShade.Dispose()
          $badgeBrush.Dispose()
          $badgeTextBrush.Dispose()
          $textBrush.Dispose()
          $mutedBrush.Dispose()
          $trackBrush.Dispose()
          $mintBrush.Dispose()
        }

        $framePath = Join-Path $tempDirectory ("frame-{0:D3}.png" -f $index)
        $bitmap.Save($framePath, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
      }
    }

    $framePattern = Join-Path $tempDirectory "frame-%03d.png"
    $filter = "split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=full[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3"
    & $ffmpeg -y -loglevel error -framerate $frameRate -i $framePattern -filter_complex $filter -loop 0 $gifPath
    if ($LASTEXITCODE -ne 0) {
      throw "FFmpeg не смог создать GIF (код $LASTEXITCODE)."
    }
  } finally {
    $brandFont.Dispose()
    $badgeFont.Dispose()
    $statusFont.Dispose()
    $source.Dispose()
    if (Test-Path -LiteralPath $tempDirectory) {
      Remove-Item -LiteralPath $tempDirectory -Recurse -Force
    }
  }
}

New-InstallerGif

Write-Host "Создан ресурс установщика: $gifPath"
