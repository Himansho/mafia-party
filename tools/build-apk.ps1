#!/usr/bin/env pwsh
# Build Mafia Party APK with the Android SDK directly — no Gradle, no npm.
# Usage:  pwsh tools/build-apk.ps1
$ErrorActionPreference = 'Stop'

$SDK     = "$env:LOCALAPPDATA\Android\Sdk"
$BT      = "$SDK\build-tools\34.0.0"
$PLAT    = "$SDK\platforms\android-34\android.jar"
$JBR     = "C:\Program Files\Android\Android Studio\jbr"
$env:JAVA_HOME = $JBR
$env:PATH = "$JBR\bin;$env:PATH"
$JAVAC   = "$JBR\bin\javac.exe"
$KEYTOOL = "$JBR\bin\keytool.exe"
$PROJ    = Split-Path $PSScriptRoot -Parent
$D       = "$PROJ\android"
$OUT     = "$D\build"

if (Test-Path $OUT) { Remove-Item $OUT -Recurse -Force }
New-Item -ItemType Directory -Path "$OUT\gen", "$OUT\classes", "$OUT\assets\www" -Force | Out-Null

Write-Host '== 1. compile resources =='
& "$BT\aapt2.exe" compile --dir "$D\res" -o "$OUT\res.zip"
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile failed' }

Write-Host '== 2. link resources =='
& "$BT\aapt2.exe" link -o "$OUT\base.ap_" -I "$PLAT" --manifest "$D\AndroidManifest.xml" --java "$OUT\gen" --auto-add-overlay "$OUT\res.zip"
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

Write-Host '== 3. compile Java =='
$srcFiles = @(Get-ChildItem "$D\src" -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$srcFiles += @(Get-ChildItem "$OUT\gen" -Recurse -Filter *.java | ForEach-Object { $_.FullName })
& $JAVAC -source 8 -target 8 -g:none -nowarn -bootclasspath "$PLAT" -classpath "$PLAT" -d "$OUT\classes" $srcFiles
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

Write-Host '== 4. dex =='
# jar the classes from the package root (forward-slash entries; loose files trip an R8 bug)
$jarTool = "$JBR\bin\jar.exe"
Push-Location "$OUT\classes"
& $jarTool cf "$OUT\classes.jar" com
Pop-Location
& "$BT\d8.bat" --release --min-api 24 --lib "$PLAT" --output "$OUT" "$OUT\classes.jar"
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

Write-Host '== 5. copy web assets =='
foreach ($item in @('index.html', 'manifest.webmanifest', 'css', 'js', 'icons')) {
  Copy-Item "$PROJ\$item" "$OUT\assets\www\" -Recurse -Force
}

Write-Host '== 6. pack apk + assets =='
Copy-Item "$OUT\base.ap_" "$OUT\unsigned.apk" -Force
# entry names MUST use forward slashes (Android requirement)
$assetFiles = @(Get-ChildItem "$OUT\assets" -Recurse -File | ForEach-Object { $_.FullName.Replace("$OUT\", '').Replace('\', '/') })
Push-Location $OUT
& "$BT\aapt.exe" add "$OUT\unsigned.apk" $assetFiles
Pop-Location
if ($LASTEXITCODE -ne 0) { throw 'aapt add failed' }

Write-Host '== 7. zipalign =='
& "$BT\zipalign.exe" -f 4 "$OUT\unsigned.apk" "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

Write-Host '== 8. keystore =='
$KS = "$D\mafiaparty.keystore"
if (-not (Test-Path $KS)) {
  & $KEYTOOL -genkeypair -v -keystore $KS -alias mafiaparty -keyalg RSA -keysize 2048 -validity 10000 -storepass mafiaparty -keypass mafiaparty -dname 'CN=Mafia Party, OU=Games, O=Himansho, L=Dehradun, C=IN'
  if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}

Write-Host '== 9. sign =='
& "$BT\apksigner.bat" sign --ks $KS --ks-pass pass:mafiaparty --key-pass pass:mafiaparty --out "$PROJ\mafia-party-v1.0.apk" "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'apksigner failed' }

Write-Host '== 10. verify =='
& "$BT\apksigner.bat" verify --print-certs "$PROJ\mafia-party-v1.0.apk"
& "$BT\aapt.exe" dump badging "$PROJ\mafia-party-v1.0.apk" | Select-Object -First 4

Write-Host "DONE: $PROJ\mafia-party-v1.0.apk"
