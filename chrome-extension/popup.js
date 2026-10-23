const POPUP_BUILD = '0.7.4';
let staleRuntime = false;
document.querySelector('#audio-settings').addEventListener('click', () => chrome.tabs.create({url: chrome.runtime.getURL('audio-settings.html') + (currentTabId ? `?tabId=${currentTabId}` : '')}));
const status = document.querySelector('#status');
const meta = document.querySelector('#meta');
const output = document.querySelector('#response');
const copy = document.querySelector('#copy');
const speakButton = document.querySelector('#speak');
const replayLatestButton = document.querySelector('#replay-latest');
const playbackButtons = {
  TOGGLE: document.querySelector('#pause-playback'),
  SKIP: document.querySelector('#skip-playback'), CANCEL: document.querySelector('#cancel-playback')
};
let playbackState = {};
let controllingPlayback = false;
function updatePlaybackControls(playback = playbackState) {
  playbackState = playback;
  const unavailable = controllingPlayback || staleRuntime || !currentTabId;
  const hasSpeech = Boolean(playback.active || playback.pending > 0);
  playbackButtons.TOGGLE.textContent = hasSpeech && playback.paused ? '再開' : '一時停止';
  playbackButtons.TOGGLE.disabled = unavailable || !hasSpeech;
  playbackButtons.SKIP.disabled = unavailable || !hasSpeech;
  playbackButtons.CANCEL.disabled = unavailable || !hasSpeech;
}
for (const [action, button] of Object.entries(playbackButtons)) {
  button.addEventListener('click', async () => {
    if (button.disabled || controllingPlayback || staleRuntime || !currentTabId) return;
    const command = action === 'TOGGLE' ? (playbackState.paused ? 'RESUME' : 'PAUSE') : action;
    controllingPlayback = true;
    updatePlaybackControls();
    try {
      await background({type: `BG_${command}`});
      const playback = await background({type: 'BG_STATUS'});
      updatePlaybackControls(playback);
      playStatus.textContent = `${playback.status} ／ 再生待ち：${playback.pending}件`;
    } catch (error) { playStatus.textContent = error.message; }
    finally { controllingPlayback = false; updatePlaybackControls(); }
  });
}
let latestSpeeches = [];
let queueing = false;
const stopButton = document.querySelector('#stop');
const playStatus = document.querySelector('#play-status');
const autoToggle = document.querySelector('#auto-toggle');
const autoStatus = document.querySelector('#auto-status');
const engineStatus = document.querySelector('#engine-status');
const pauseUpdates = document.querySelector('#pause-updates');
const diagnostics = document.querySelector('#diagnostics');
const copyDiagnostics = document.querySelector('#copy-diagnostics');
const copyStatus = document.querySelector('#copy-status');
const reloadExtension = document.querySelector('#reload-extension');
const reloadPage = document.querySelector('#reload-page');
reloadExtension.addEventListener('click', () => chrome.runtime.reload());
reloadPage.addEventListener('click', () => { if (currentTabId) chrome.tabs.reload(currentTabId); });
function displayPaused() {
  if (pauseUpdates.checked || window.getSelection()?.toString()) return true;
  const element = document.activeElement;
  return element?.tagName === 'TEXTAREA' && element.selectionStart !== element.selectionEnd;
}
async function copyText(value, label, fallback) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copyStatus.textContent = `${label}をコピーしました。`;
  } catch {
    pauseUpdates.checked = true;
    if (fallback === diagnostics) diagnostics.closest('details').open = true;
    fallback.focus();
    fallback.select();
    copyStatus.textContent = `${label}を選択しました。Ctrl+Cでコピーしてください。`;
  }
}
copyDiagnostics.addEventListener('click', () => copyText(diagnostics.value, '診断情報', diagnostics));
pauseUpdates.addEventListener('change', () => {
  if (pauseUpdates.checked) return;
  window.getSelection()?.removeAllRanges();
  for (const area of [output, diagnostics]) area.setSelectionRange(area.selectionEnd, area.selectionEnd);
  refresh({force: true});
});
let engineOnline = false;
function showEngine(engine) {
  engineOnline = engine?.online === true;
  engineStatus.textContent = engine?.online === null || !engine
    ? 'VOICEVOX：確認中…'
    : engineOnline ? `VOICEVOX：起動中（${engine.version}）` : 'VOICEVOX：未起動／接続不可。ON設定を維持して待機します。';
  updateSpeakButton();
}
let busy = false;
let switching = false;
let currentSource = '';
let currentTabId;
function updateSpeakButton() {
  speakButton.disabled = queueing || staleRuntime || !engineOnline || autoToggle.checked || !document.querySelector('#dialogue input:checked');
  replayLatestButton.disabled = queueing || staleRuntime || !engineOnline || !currentTabId || !latestSpeeches.length;
}
async function background(message) {
  const result = await chrome.runtime.sendMessage({...message, tabId: currentTabId});
  if (!result?.ok) throw new Error(result?.error || '操作できませんでした。');
  return result;
}
async function setAuto(enabled) {
  if (!currentTabId) return;
  switching = true;
  autoToggle.disabled = true;
  try {
    const result = await chrome.tabs.sendMessage(currentTabId, {type: 'VOICEVOX_SET_AUTO', enabled});
    if (!result?.ok) throw new Error(result?.error || '設定できませんでした。');
    autoToggle.checked = result.enabled;
    autoStatus.textContent = result.enabled ? 'ON：次に送信するチャットから自動で読み上げます。' : 'OFF：自動読み上げを停止しました。';
  } catch (error) {
    autoStatus.textContent = error.message;
  } finally {
    switching = false;
    autoToggle.disabled = false;
    updateSpeakButton();
  }
}
autoToggle.addEventListener('change', () => setAuto(autoToggle.checked));
stopButton.addEventListener('click', () => setAuto(false));
async function queueSpeeches(items, message) {
  if (queueing || staleRuntime || !engineOnline || !items.length) return;
  queueing = true;
  updateSpeakButton();
  try {
    const result = await background({type: 'BG_QUEUE', items, batchId: crypto.randomUUID()});
    if (result.engine) showEngine(result.engine);
    playStatus.textContent = result.skipped ? 'VOICEVOXが起動していないため、再生しませんでした。' : message;
  } catch (error) { playStatus.textContent = error.message; }
  finally { queueing = false; updateSpeakButton(); }
}
speakButton.addEventListener('click', () => {
  if (autoToggle.checked) return;
  const items = [...document.querySelectorAll('#dialogue input:checked')].map(box => box.speech);
  return queueSpeeches(items, '選択したセリフを再生待ちに追加しました。');
});
replayLatestButton.addEventListener('click', () =>
  queueSpeeches(latestSpeeches, '直近に取得したセリフを再生待ちに追加しました。'));
function showDialogue(text, mixed = false, speeches) {
  const items = speeches || speechOnly(text);
  latestSpeeches = items;
  document.querySelector('#dialogue-count').textContent = `${items.length}件`;
  const container = document.querySelector('#dialogue');
  container.replaceChildren();
  for (const item of items) {
    const row = document.createElement('p');
    const name = document.createElement('strong');
    name.textContent = `${item.label || item.name} → ${item.name}（${item.styleName} / ID ${item.styleId}）`;
    const body = document.createElement('span');
    body.textContent = item.text;
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !mixed;
    box.speech = item;
    box.addEventListener('change', updateSpeakButton);
    label.append(box, name);
    row.append(label, body);
    container.append(row);
  }
  if (!items.length) container.textContent = '完成したキャラクターのセリフはありません。';
  document.querySelector('#warnings').textContent = [mixed ? '取得範囲は推定または会話全体です。手動再生する場合はセリフを選択してください。' : '', ...items.filter(item => item.styleFallback).map(item => `${item.name}：「${item.requestedStyle}」は未対応のため「${item.styleName}」で読みます。`)].filter(Boolean).join('\n');
  updateSpeakButton();
}
async function refresh({force = false} = {}) {
  if (busy || switching || controllingPlayback || (!force && displayPaused())) return;
  busy = true;
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id || !tab.url || new URL(tab.url).origin !== 'https://chatgpt.com') {
      throw new Error('ChatGPTの会話ページを開いてください。');
    }
    if (!force && displayPaused()) return;
    currentTabId = tab.id;
    let data;
    try { data = await chrome.tabs.sendMessage(tab.id, {type: 'VOICEVOX_READ_RESPONSE'}); }
    catch {
      await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['speakers.js', 'parser.js', 'auto-core.js', 'casting.js', 'content.js']});
      data = await chrome.tabs.sendMessage(tab.id, {type: 'VOICEVOX_READ_RESPONSE'});
    }
    if (!force && displayPaused()) return;
    autoToggle.disabled = false;
    stopButton.disabled = false;
    autoToggle.checked = Boolean(data.auto?.enabled);
    showEngine(data.engine);
    autoStatus.textContent = data.auto?.error || (data.auto?.enabled
      ? (!engineOnline ? 'ON：VOICEVOXの起動待ちです。' : data.auto.armed ? 'ON：新しく完成したセリフを自動で読み上げます。' : 'ON：次のメッセージ送信を待っています。')
      : 'OFF：自動読み上げは停止中です。');
    const previousCatalog = JSON.stringify(voiceRegistry.catalog);
    if (data.catalog) voiceRegistry.setCatalog(data.catalog);
    const source = `${data.url}|${data.method}|${data.inferred}|${JSON.stringify(voiceRegistry.catalog)}|${JSON.stringify(data.casting)}|${JSON.stringify(data.castingSettings)}`;
    if (previousCatalog !== JSON.stringify(voiceRegistry.catalog)) currentSource = '';
    if (output.value !== data.text || source !== currentSource) {
      currentSource = source;
      output.value = data.text;
      showDialogue(data.text, data.mixed || data.inferred, data.speeches);
    }
    updateSpeakButton();
    copy.disabled = !data.text;
    status.textContent = data.text
      ? (data.mixed ? '会話領域全体を表示中。' : data.inferred ? '最後の応答ブロックを推定しました。' : '応答を取得しました。')
      : '応答本文が見つかりません。';
    meta.textContent = `検出方式：${data.method} ／ 確認：${new Date(data.capturedAt).toLocaleTimeString('ja-JP')}`;
    const playback = await background({type: 'BG_STATUS'});
    if (!force && displayPaused()) return;
    showEngine(playback.engine);
    const registeredVersion = chrome.runtime.getManifest().version;
    const needsExtensionUpdate = registeredVersion !== POPUP_BUILD || playback.workerVersion !== POPUP_BUILD;
    const needsPageReload = data.readerVersion !== POPUP_BUILD;
    staleRuntime = needsExtensionUpdate || needsPageReload;
    updatePlaybackControls(playback);
    reloadExtension.hidden = !needsExtensionUpdate;
    reloadPage.hidden = !needsPageReload;
    autoToggle.disabled = staleRuntime;
    stopButton.disabled = staleRuntime;
    updateSpeakButton();
    if (needsExtensionUpdate) status.textContent = '古い拡張機能が動いています。「拡張機能を更新」を押し、再度この画面を開いてください。';
    else if (needsPageReload) status.textContent = 'ページに古い取得処理が残っています。「ChatGPTを再読み込み」を押してください。';
    const {catalog: playbackCatalog, ...playbackInfo} = playback;
    const snapshot = JSON.stringify({...data.diagnostics,
      versions: {popup: POPUP_BUILD, registered: registeredVersion, reader: data.readerVersion || '旧版（バージョン情報なし）', worker: playback.workerVersion || '旧版', player: playback.playerVersion || '未起動または旧版'},
      auto: data.auto, previewSpeeches: speechOnly(data.text).length, playback: playbackInfo}, null, 2);
    if (diagnostics.value !== snapshot) diagnostics.value = snapshot;
    copyDiagnostics.disabled = false;
    playStatus.textContent = `${playback.engine?.online === false ? 'VOICEVOXの起動待ち' : playback.status} ／ 再生待ち：${playback.pending}件`;
  } catch (error) {
    if (!force && displayPaused()) return;
    status.textContent = error.message;
    autoToggle.disabled = true;
    stopButton.disabled = true;
    updatePlaybackControls({});
    reloadPage.hidden = !currentTabId;
    reloadExtension.hidden = chrome.runtime.getManifest().version === POPUP_BUILD;
    output.value = '';
    showDialogue('');
    copy.disabled = true;
  } finally { busy = false; }
}
document.querySelector('#refresh').addEventListener('click', () => refresh({force: true}));
copy.addEventListener('click', () => copyText(output.value, '本文', output));
showDialogue('');
refresh();
setInterval(() => refresh(), 1000);

const panelToggle = document.querySelector('#panel-toggle');
const panelStatus = document.querySelector('#panel-status');
chrome.storage.local.get('characterPanelEnabled').then(saved => {
  panelToggle.checked = saved.characterPanelEnabled !== false;
  panelToggle.disabled = false;
}).catch(error => { panelStatus.textContent = `パネル設定を取得できませんでした：${error.message}`; });
panelToggle.addEventListener('change', async () => {
  panelToggle.disabled = true;
  try {
    await chrome.storage.local.set({characterPanelEnabled: panelToggle.checked});
    panelStatus.textContent = panelToggle.checked ? 'パネル表示をONにしました。' : 'パネル表示をOFFにしました。';
  } catch (error) {
    panelToggle.checked = !panelToggle.checked;
    panelStatus.textContent = `パネル設定を保存できませんでした：${error.message}`;
  } finally { panelToggle.disabled = false; }
});
