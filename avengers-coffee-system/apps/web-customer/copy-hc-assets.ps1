$src = "c:\Users\ad\Documents\Nam4_Hocki2\cnm-avengers-coffee-microservices-AI\Highlands Coffee - Đặt Giao Ngay 19001755_files"
$dst = "c:\Users\ad\Documents\Nam4_Hocki2\cnm-avengers-coffee-microservices-AI\avengers-coffee-system\apps\web-customer\public\hc-assets"

New-Item -ItemType Directory -Force -Path $dst | Out-Null

$files = @(
  "HCO_7825_SUMMERDI_GAME___DC_BANNER_1920x926.jpg",
  "HCO_7824_1000_STORE_DC_MWB.jpg",
  "HCO_7825_SUMMERDI_DC_BANNER_1920x926.jpg",
  "HCO_7825_AME__SUMMERDI_DC_BANNER_1920x926.jpg",
  "HCO_7801_MISMATCHES_DISCOUNT_FA_MWB_1920x926_1.png",
  "HCO_7820_MATCHA_LAUNCH_DC_MWB_1920X926.jpg",
  "Website_bannerr.png",
  "WEB_Banner_2.png",
  "WEB_Banner_1.png",
  "505392773_1120548066764868_2724070916068790506_n.jpg",
  "web_banner_2000x2000.jpg",
  "2.png",
  "1_1.jpg",
  "ftlogo.png",
  "red_BG_logo800.png",
  "isoc1.png",
  "isoc2.png",
  "isoc3.png",
  "isoc4.png"
)

foreach ($f in $files) {
  $srcPath = Join-Path $src $f
  $dstPath = Join-Path $dst $f
  if (Test-Path $srcPath) {
    Copy-Item $srcPath $dstPath -Force
    Write-Host "Copied: $f"
  } else {
    Write-Host "NOT FOUND: $f"
  }
}

Write-Host "All done!"
