$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$extension = Join-Path $root 'chrome-extension'
$settingsHtml = [IO.File]::ReadAllText((Join-Path $extension 'audio-settings.html'))
if ($settingsHtml -match 'id="check-voices"|src="availability(?:-settings)?\.js"') {throw 'Suspended precheck must not be exposed or loaded'}
$manifestText = [IO.File]::ReadAllText((Join-Path $extension 'manifest.json'))
if ($manifestText -match '"availability.js"') {throw 'Suspended precheck must not be injected'}
$checks = ''
foreach ($path in Get-ChildItem -LiteralPath $extension -Filter '*.js') {
 $checks += 'new Function(' + (ConvertTo-Json -Compress -InputObject ([IO.File]::ReadAllText($path.FullName))) + ');'
}
foreach ($suite in @(
 @{Test='core'; Files=@('speakers.js','parser.js','auto-core.js')},
 @{Test='casting'; Files=@('speakers.js','casting.js')},
 @{Test='speech-tools'; Files=@('speakers.js','speech-tools.js')}
)) {
 $source = "const print = () => {};`n"
 foreach ($name in $suite.Files) { $source += [IO.File]::ReadAllText((Join-Path $extension $name)) + "`n" }
 $source += [IO.File]::ReadAllText((Join-Path $PSScriptRoot ($suite.Test + '.test.js')))
 $checks += 'new Function(' + (ConvertTo-Json -Compress -InputObject $source) + ')();'
}
$runner = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'run.py'))
$availabilityTest = [IO.File]::ReadAllText((Join-Path $extension 'availability.js')) + "`n" + [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'availability.test.js')) + "`nreturn testAvailability();"
$checks += 'await new Function(' + (ConvertTo-Json -Compress -InputObject $availabilityTest) + ')();'
$availabilityUi = [IO.File]::ReadAllText((Join-Path $extension 'speakers.js')) + "`n" + [IO.File]::ReadAllText((Join-Path $extension 'availability.js')) + "`n" + [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'availability-settings.test.js')) + "`n" + [IO.File]::ReadAllText((Join-Path $extension 'availability-settings.js')) + "`nreturn testAvailabilitySettings();"
$checks += 'await new Function(' + (ConvertTo-Json -Compress -InputObject $availabilityUi) + ')();'
foreach ($suite in @('background', 'player', 'content')) {
 $source = "const print = () => {};`n" + [IO.File]::ReadAllText((Join-Path $extension 'speakers.js')) + "`n" + [IO.File]::ReadAllText((Join-Path $extension 'speech-tools.js')) + "`n"
 $mockSource = [regex]::Match($runner, ($suite + "_mock = r'''(.*?)'''"), 'Singleline').Groups[1].Value
 $mockSource = [regex]::Replace($mockSource, 'const GLib = imports.gi.GLib;\r?\n', '')
 $mockSource = [regex]::Replace($mockSource, 'function setTimeout\(callback, ms\).*?\r?\n', '')
 $source += $mockSource + "`n"
 if ($suite -eq 'content') {
  foreach ($name in @('parser.js','auto-core.js','casting.js','availability.js')) { $source += [IO.File]::ReadAllText((Join-Path $extension $name)) + "`n" }
 }
 $source += [IO.File]::ReadAllText((Join-Path $extension ($suite + '.js'))) + "`n"
 $test = [IO.File]::ReadAllText((Join-Path $PSScriptRoot ($suite + '.test.js')))
 $test = $test.Substring(0, $test.IndexOf('const loop ='))
 $function = if ($suite -eq 'background') {'testBackground'} elseif ($suite -eq 'content') {'testContent'} else {'testPlayer'}
 $source += $test + "`nreturn " + $function + '();'
 $checks += 'await new Function(' + (ConvertTo-Json -Compress -InputObject $source) + ')();'
}
$html = '<!doctype html><meta charset="utf-8"><pre id="result">PENDING</pre><script>(async () => {try {' + $checks + 'document.querySelector("#result").textContent="PASS: syntax, core, casting, speech tools, background and player regressions";} catch(error) {document.querySelector("#result").textContent="FAIL: " + error.stack;}})();</script>'
$folder = Join-Path $env:TEMP ('voicevox-regressions-' + [guid]::NewGuid())
[IO.Directory]::CreateDirectory($folder) | Out-Null
$page = Join-Path $folder 'test.html'
[IO.File]::WriteAllText($page, $html, [Text.UTF8Encoding]::new($false))
$stdout = Join-Path $folder 'stdout.txt'
$arguments = @('--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', ('--user-data-dir="' + $folder + '\profile"'), '--virtual-time-budget=10000', '--dump-dom', ([uri]$page).AbsoluteUri)
$process = Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError (Join-Path $folder 'stderr.txt')
if (!$process.WaitForExit(60000)) {throw ('Chrome timed out; logs: ' + $folder)}
$output = Get-Content -Encoding UTF8 -LiteralPath $stdout
$result = [regex]::Match(($output -join "`n"), '<pre id="result">(.*?)</pre>', 'Singleline').Groups[1].Value
Write-Output $result
if (!$result.StartsWith('PASS:')) {throw 'Regression checks failed'}
