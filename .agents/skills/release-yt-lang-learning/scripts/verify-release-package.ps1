param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
)

$ErrorActionPreference = "Stop"

$asarExe = Join-Path $ProjectRoot "node_modules\.bin\asar.exe"
$asarPath = Join-Path $ProjectRoot "out\yt-lang-learning-win32-x64\resources\app.asar"
$indexPath = Join-Path $ProjectRoot "index.html"

foreach ($requiredPath in @($asarExe, $asarPath, $indexPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Не найден обязательный файл: $requiredPath"
  }
}

$entries = @(& $asarExe list $asarPath)
if ($LASTEXITCODE -ne 0) {
  throw "Не удалось прочитать app.asar (код $LASTEXITCODE)."
}

$requiredEntries = @("\index.html", "\main.js", "\preload.js")
$html = Get-Content -LiteralPath $indexPath -Raw
$scriptPattern = '<script[^>]+\bsrc\s*=\s*["'']([^"'']+)["'']'

foreach ($match in [regex]::Matches($html, $scriptPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
  $source = $match.Groups[1].Value
  if ($source -match '^(?:https?:)?//') {
    continue
  }

  $source = ($source -split '[?#]', 2)[0]
  $entry = "\" + $source.TrimStart(".", "/", "\").Replace("/", "\")
  $requiredEntries += $entry
}

$requiredEntries = $requiredEntries | Sort-Object -Unique
$missingEntries = @($requiredEntries | Where-Object { $entries -notcontains $_ })
$secretEntries = @($entries | Where-Object {
  $_ -match '(^|[\\/])\.env(?:\.|$|[\\/])' -and
  $_ -notmatch '(^|[\\/])\.env\.example$'
})

if ($missingEntries.Count -gt 0) {
  Write-Error ("В app.asar отсутствуют обязательные файлы: " + ($missingEntries -join ", "))
}

if ($secretEntries.Count -gt 0) {
  Write-Error ("В app.asar обнаружены запрещённые env-файлы: " + ($secretEntries -join ", "))
}

Write-Host "app.asar проверен: $($requiredEntries.Count) обязательных файлов присутствуют, env-файлов нет."
