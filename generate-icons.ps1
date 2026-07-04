Add-Type -AssemblyName System.Drawing

$sizes = @(16, 48, 128)

function New-EyeIcon($size, $closed) {
  $bmp = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)

  $penColor = if ($closed) { [System.Drawing.Color]::FromArgb(0x22, 0xC5, 0x5E) } else { [System.Drawing.Color]::FromArgb(0x6B, 0x72, 0x80) }
  $pen = [System.Drawing.Pen]::new($penColor, [Math]::Max(1, $size / 12))
  $pen.StartCap = 'Round'
  $pen.EndCap = 'Round'

  $cx = $size / 2
  $cy = $size / 2
  $rx = $size * 0.35
  $ry = $size * 0.25

  if ($closed) {
    $g.DrawEllipse($pen, $cx - $rx, $cy - $ry, $rx * 2, $ry * 2)
    $irisPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(0x22, 0xC5, 0x5E), [Math]::Max(1, $size / 20))
    $g.DrawEllipse($irisPen, $cx - $rx/2, $cy - $ry/2, $rx, $ry)

    $linePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(0x22, 0xC5, 0x5E), [Math]::Max(1.5, $size / 8))
    $linePen.StartCap = 'Round'
    $linePen.EndCap = 'Round'
    $g.DrawLine($linePen, $cx - $rx*1.3, $cy - $ry*1.3, $cx + $rx*1.3, $cy + $ry*1.3)
  } else {
    $g.DrawEllipse($pen, $cx - $rx, $cy - $ry, $rx * 2, $ry * 2)
    $irisPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(0x6B, 0x72, 0x80), [Math]::Max(1, $size / 20))
    $g.DrawEllipse($irisPen, $cx - $rx/2, $cy - $ry/2, $rx, $ry)
  }

  $g.Dispose()
  return $bmp
}

foreach ($size in $sizes) {
  $openBmp = New-EyeIcon $size $false
  $openBmp.Save("icons\icon-inactive_$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $openBmp.Dispose()

  $closedBmp = New-EyeIcon $size $true
  $closedBmp.Save("icons\icon-active_$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $closedBmp.Dispose()

  Write-Output "Generated ${size}x${size} icons"
}
