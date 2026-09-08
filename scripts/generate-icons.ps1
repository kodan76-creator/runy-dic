# scripts/generate-icons.ps1
# Генерирует квадратные иконки из исходного изображения голубя.
# Масштабирование «вписать целиком» (contain): голубь уменьшается так, чтобы
# весь размах крыльев поместился в квадрат с полями (margin).
#
# Использование:
#   powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
#
# Выходные файлы:
#   public/golub.png           512x512  (favicon)
#   public/golub-icon.png       64x64   (маленькая иконка «Новые Руны»)
#   public/icons/icon-192.png  192x192  (PWA)
#   public/icons/icon-512.png  512x512  (PWA)

Add-Type -AssemblyName System.Drawing

$srcPath = (Resolve-Path 'src/golub_prozrachny_HD.png').Path
$src = New-Object System.Drawing.Bitmap($srcPath)

# Доля ширины иконки, которую занимает голубь (0.88 = 6% поля слева и справа).
# Уменьшите значение, чтобы голубь был ещё меньше (больше полей).
$fillRatio = 0.88

# Обрезка до непрозрачного содержимого (крылья), чтобы не тащить пустые поля.
$step = 2
$minX = $src.Width; $minY = $src.Height; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $src.Height; $y += $step) {
  for ($x = 0; $x -lt $src.Width; $x += $step) {
    $p = $src.GetPixel($x, $y)
    if ($p.A -gt 10) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
# Небольшой буфер вокруг содержимого, чтобы не срезать полупрозрачные крылья
$buf = 4
$minX = [Math]::Max(0, $minX - $buf)
$minY = [Math]::Max(0, $minY - $buf)
$maxX = [Math]::Min($src.Width - 1, $maxX + $buf)
$maxY = [Math]::Min($src.Height - 1, $maxY + $buf)
$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1
Write-Host "Content crop: ${cropW}x${cropH} at ($minX,$minY)"

# Вырезаем область с голубем
$cropRect = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
$crop = $src.Clone($cropRect, $src.PixelFormat)

function New-Icon([string]$outPath, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  # Масштаб: вписать голубя по ширине с полями
  $targetW = [int]($size * $fillRatio)
  $scale = $targetW / $cropW
  $drawW = [int]($cropW * $scale)
  $drawH = [int]($cropH * $scale)
  $x = [int](($size - $drawW) / 2)
  $y = [int](($size - $drawH) / 2)
  $destRect = New-Object System.Drawing.Rectangle($x, $y, $drawW, $drawH)
  $g.DrawImage($crop, $destRect, 0, 0, $cropW, $cropH, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  $outFull = Join-Path (Get-Location) $outPath
  $dir = Split-Path $outFull -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $bmp.Save($outFull, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Generated $outPath (${size}x${size})"
}

New-Icon 'public/golub.png' 512
New-Icon 'public/golub-icon.png' 64
New-Icon 'public/icons/icon-192.png' 192
New-Icon 'public/icons/icon-512.png' 512

$crop.Dispose()
$src.Dispose()
Write-Host 'Done.'