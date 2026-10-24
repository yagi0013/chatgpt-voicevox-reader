$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$extension = Join-Path $root 'chrome-extension'
$mock = @'
const saved = {};
const calls = [];
let paused = 0;
let failQuery = false;
let failSynthesis = false;
let holdQuery = false;
let releaseQuery;
window.chrome = {
 storage: {local: {async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, saved[k]])); }, async set(data) { Object.assign(saved, data); }}, onChanged: {addListener() {}}},
 permissions: {async request() { return true; }},
 tabs: {async query() { return []; }}
};
window.Audio = class {async setSinkId() {} async play() {} pause() { paused++; } removeAttribute() {} load() {}};
window.fetch = async (url, options) => {
 calls.push(url);
 if (url.includes('audio_query')) {
   if (failQuery) throw new Error('test failure');
   if (holdQuery) await new Promise(resolve => {releaseQuery = resolve;});
 }
 if (url.includes('/synthesis?') && failSynthesis) return {ok:false, status:500, async text() {return '{"detail":"Internal Server Error"}';}};
 return {ok: true, async json() {
   if (url.endsWith('/version')) return 'test';
   if (url.endsWith('/speakers')) return [{name: '四国めたん', styles: [{id: 2, name: 'ノーマル'}]}];
   return {};
 }, async blob() {return new Blob(['test']);}};
};
const castStatus = document.querySelector('#casting-status');
const castTabId = null;
'@
$check = @'
(async () => {
 const tick = () => new Promise(resolve => setTimeout(resolve, 0));
 function assert(value, message) {if (!value) throw new Error(message);}
 try {
  await tick(); await tick();
  assert(engineInput.value === defaultEngine, 'default URL');
  assert(normalizeEngineUrl('https://example.com/engine/') === 'https://example.com/engine', 'URL normalization');
  for (const url of ['file:///test', 'http://user:pass@example.com', 'http://example.com?q=1']) {
   let rejected = false; try {normalizeEngineUrl(url);} catch {rejected = true;} assert(rejected, 'invalid URL accepted');
  }
  engineInput.value = 'http://192.0.2.1:50022/'; engineSave.click();
  await tick(); await tick();
  assert(saved.voicevoxUrl === 'http://192.0.2.1:50022', 'save endpoint');
  assert(calls.includes(saved.voicevoxUrl + '/version') && saved.speakerCatalog.length === 1, 'health and roster');
  const buttons = [...document.querySelectorAll('#members button')];
  assert(buttons.length > 1, 'member controls');
  buttons[0].click(); await tick();
  assert(buttons[0].textContent === '停止' && previewActive.audio, 'playing toggle');
  const first = previewActive;
  buttons[1].click();
  assert(first.controller.signal.aborted && paused === 1 && buttons[0].textContent === '試聴', 'immediate switch');
  await tick(); buttons[1].click();
  assert(!previewActive && buttons[1].textContent === '試聴', 'stop toggle');
  holdQuery = true; buttons[0].click(); await tick();
  const pending = previewActive; buttons[0].click();
  assert(pending.controller.signal.aborted && !previewActive, 'cancel synthesis');
  releaseQuery(); holdQuery = false; await tick();
  assert(!previewActive, 'stale synthesis restarted');
  failQuery = true; buttons[0].click(); await tick();
  assert(!previewActive && buttons[0].textContent === '試聴', 'error restores button');
  failQuery = false; failSynthesis = true;
  await previewVoice('No.7', 29, buttons[0]);
  assert(castStatus.textContent.includes('styleId=29') && castStatus.textContent.includes('synthesis') && castStatus.textContent.includes('HTTP 500') && castStatus.textContent.includes('Internal Server Error'), 'preview reports upstream synthesis failure and exact style');
  failSynthesis = false;
  failQuery = false; buttons[0].click(); await tick(); previewActive.audio.onended();
  assert(!previewActive && buttons[0].textContent === '試聴', 'end restores button');
  assert(calls.some(url => url.startsWith(saved.voicevoxUrl + '/audio_query')), 'preview endpoint');
  assert(document.querySelector('#custom-instructions').readOnly, 'copyable prompt');
  const originalFetch = window.fetch;
  memberRoster = null;
  window.fetch = async (url, options) => {
    if (url.endsWith('/speakers')) return {ok:true, async json() {return [{speaker_uuid:'test-portrait', styles:[{id:2}]}];}};
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => resolve({ok:true, async json() {return {portrait:'portrait-test'};}}),6000);
      options.signal.addEventListener('abort', () => {clearTimeout(timer); reject(options.signal.reason);}, {once:true});
    });
  };
  const portrait = await memberPortrait({styleId:2}, memberImageVersion);
  assert(portrait === 'data:image/png;base64,portrait-test', 'portrait must tolerate response slower than five seconds');
  window.fetch = originalFetch;
  document.querySelector('#result').textContent = 'PASS: settings URL, health, roster, preview switching, cancellation, completion, errors and prompt';
 } catch (error) {document.querySelector('#result').textContent = 'FAIL: ' + error.stack;}
})();
'@
$html = [IO.File]::ReadAllText((Join-Path $extension 'audio-settings.html'))
$html = $html.Replace('<script src="casting-settings.js"></script>', '<script>' + $mock + '</script>')
foreach ($name in @('settings-tabs.js','speakers.js','audio-settings.js','speech-tools.js','speech-settings.js','engine-settings.js','availability.js','availability-settings.js')) {
 $source = [IO.File]::ReadAllText((Join-Path $extension $name))
 $html = $html.Replace('<script src="' + $name + '"></script>', '<script>' + $source.Replace('</script', '<\/script') + '</script>')
}
$syntax = ''
foreach ($file in Get-ChildItem $extension -Filter '*.js') {
 $json = ConvertTo-Json -Compress -InputObject ([IO.File]::ReadAllText($file.FullName))
 $syntax += 'new Function(' + $json + ');'
}
$regressions = ''
foreach ($suite in @(
 @{Files=@('speakers.js','speech-tools.js'); Test='speech-tools'},
 @{Files=@('speakers.js','parser.js','auto-core.js'); Test='core'},
 @{Files=@('speakers.js','casting.js'); Test='casting'}
)) {
 $source = "const print = () => {};`n"
 foreach ($name in $suite.Files) { $source += [IO.File]::ReadAllText((Join-Path $extension $name)) + "`n" }
 $source += [IO.File]::ReadAllText((Join-Path $PSScriptRoot ($suite.Test + '.test.js')))
 $regressions += 'new Function(' + (ConvertTo-Json -Compress -InputObject $source) + ')();'
}
$runner = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'run.py'))
foreach ($suite in @('background', 'player')) {
 $source = "const print = () => {};`n" + [IO.File]::ReadAllText((Join-Path $extension 'speakers.js')) + "`n" + [IO.File]::ReadAllText((Join-Path $extension 'speech-tools.js')) + "`n"
 $mockSource = [regex]::Match($runner, ($suite + "_mock = r'''(.*?)'''"), 'Singleline').Groups[1].Value
 $mockSource = [regex]::Replace($mockSource, 'const GLib = imports.gi.GLib;\r?\n', '')
 $mockSource = [regex]::Replace($mockSource, 'function setTimeout\(callback, ms\).*?\r?\n', '')
 $implementation = [IO.File]::ReadAllText((Join-Path $extension ($suite + '.js')))
 if ($suite -eq 'player') { $implementation = $implementation.Replace('const SYNTHESIS_RETRY_DELAY_MS = 2000;', 'const SYNTHESIS_RETRY_DELAY_MS = 1;') }
 $source += $mockSource + "`n" + $implementation + "`n"
 $test = [IO.File]::ReadAllText((Join-Path $PSScriptRoot ($suite + '.test.js')))
 $test = $test.Substring(0, $test.IndexOf('const loop ='))
 $function = if ($suite -eq 'background') {'testBackground'} else {'testPlayer'}
 $source += $test + "`nreturn " + $function + '();'
 $regressions += 'await new Function(' + (ConvertTo-Json -Compress -InputObject $source) + ')();'
}
$insertionPoint = $check.IndexOf('await tick(); await tick();')
if ($insertionPoint -lt 0) {throw 'Regression insertion point not found'}
$check = $check.Substring(0, $insertionPoint) + $regressions + $check.Substring($insertionPoint)
$html = $html.Replace('</body>', '<pre id="result">PENDING</pre><script>' + $syntax + $check + '</script></body>')
$folder = Join-Path $env:TEMP ('voicevox-settings-' + [guid]::NewGuid())
[IO.Directory]::CreateDirectory($folder) | Out-Null
$page = Join-Path $folder 'test.html'
[IO.File]::WriteAllText($page, $html, [Text.UTF8Encoding]::new($false))
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$stdout = Join-Path $folder 'stdout.txt'
$stderr = Join-Path $folder 'stderr.txt'
$arguments = @('--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', ('--user-data-dir="' + $folder + '\profile"'), '--virtual-time-budget=15000', '--dump-dom', ([uri]$page).AbsoluteUri)
$process = Start-Process -FilePath $chrome -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
if (!$process.WaitForExit(60000)) {throw ('Chrome timed out; logs: ' + $folder)}
$output = Get-Content -Encoding utf8 $stdout
$result = [regex]::Match(($output -join "`n"), '<pre id="result">(.*?)</pre>', 'Singleline').Groups[1].Value
Write-Output $result
if (!$result.StartsWith('PASS:')) {throw 'Settings browser checks failed'}
