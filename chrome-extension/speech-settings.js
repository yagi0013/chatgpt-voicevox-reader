const speechSettingsStatus = document.querySelector('#speech-settings-status');
let dictionaryContextKey;
let previewActive;
function stopVoicePreview() {
  if (!previewActive) return;
  previewActive.controller.abort();
  if (previewActive.audio) {
    previewActive.audio.onended = null;
    previewActive.audio.onerror = null;
    previewActive.audio.pause();
    previewActive.audio.removeAttribute('src');
    previewActive.audio.load();
    previewActive.audio = null;
  }
  if (previewActive.url) URL.revokeObjectURL(previewActive.url);
  if (previewActive.button) {
    previewActive.button.textContent = '試聴';
    previewActive.button.setAttribute('aria-pressed', 'false');
  }
  previewActive = null;
}
async function previewVoice(name, styleId, button) {
  const stopping = button && previewActive?.button === button;
  stopVoicePreview();
  if (stopping) { castStatus.textContent = '試聴を停止しました。'; return; }
  const active = {controller: new AbortController(), button};
  previewActive = active;
  if (button) { button.textContent = '停止'; button.setAttribute('aria-pressed', 'true'); }
  castStatus.textContent = `${name}：試聴用の音声を合成中…`;
  try {
    const signal = AbortSignal.any([active.controller.signal, AbortSignal.timeout(90000)]);
    const {voicevoxUrl = 'http://127.0.0.1:50021'} = await chrome.storage.local.get('voicevoxUrl');
    signal.throwIfAborted();
    const params = new URLSearchParams({text: 'こんにちは、よろしくお願いします。', speaker: styleId});
    const response = await fetch(`${voicevoxUrl}/audio_query?${params}`, {method: 'POST', signal});
    if (!response.ok) throw new Error(`音声クエリ HTTP ${response.status}`);
    const query = await response.json();
    signal.throwIfAborted();
    const synthesis = await fetch(`${voicevoxUrl}/synthesis?speaker=${styleId}`, {method: 'POST', signal, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(query)});
    if (!synthesis.ok) throw new Error(`音声合成 HTTP ${synthesis.status}`);
    const blob = await synthesis.blob();
    active.controller.signal.throwIfAborted();
    active.url = URL.createObjectURL(blob);
    active.audio = new Audio(active.url);
    const {audioOutputId = ''} = await chrome.storage.local.get('audioOutputId');
    if (active.audio.setSinkId) {
      try { await active.audio.setSinkId(audioOutputId); }
      catch { await active.audio.setSinkId(''); }
    }
    active.controller.signal.throwIfAborted();
    active.audio.onended = () => {
      if (previewActive === active) { stopVoicePreview(); castStatus.textContent = '試聴が終わりました。'; }
    };
    active.audio.onerror = () => {
      if (previewActive === active) { stopVoicePreview(); castStatus.textContent = '試聴の再生に失敗しました。'; }
    };
    await active.audio.play();
    if (previewActive === active) castStatus.textContent = `${name}：試聴中`;
  } catch (error) {
    if (previewActive === active) {
      stopVoicePreview();
      castStatus.textContent = `試聴できませんでした：${error.message}。VOICEVOXの起動を確認してください。`;
    }
  }
}
window.addEventListener('pagehide', stopVoicePreview);
document.querySelector('#save-emotion').addEventListener('click', async () => {
  try {
    await chrome.storage.local.set({emotionEnabled: document.querySelector('#emotion-enabled').checked});
    speechSettingsStatus.textContent = '感情演出を保存しました。次に再生待ちへ追加するセリフから反映されます。';
  } catch (error) { speechSettingsStatus.textContent = error.message; }
});
document.querySelector('#save-dictionary').addEventListener('click', async () => {
  try {
    const common = document.querySelector('#dictionary-common').value;
    const local = document.querySelector('#dictionary-local').value;
    speechTools.dictionaryEntries(common); speechTools.dictionaryEntries(local);
    const context = await chrome.tabs.sendMessage(castTabId, {type: 'VOICEVOX_DICTIONARY_CONTEXT'});
    if (!context?.ok || context.dictionaryKey !== dictionaryContextKey) throw new Error('対象の会話が変わりました。設定画面を開き直してください。');
    await chrome.storage.local.set({pronunciationCommon: common, [dictionaryContextKey]: local});
    speechSettingsStatus.textContent = '辞書を保存しました。';
  } catch (error) { speechSettingsStatus.textContent = error.message; }
});
(async () => {
  try {
    const saved = await chrome.storage.local.get(['pronunciationCommon', 'emotionEnabled']);
    document.querySelector('#dictionary-common').value = saved.pronunciationCommon || '';
    document.querySelector('#emotion-enabled').checked = saved.emotionEnabled !== false;
    // The casting initializer resolves the target tab; querying here also supports options pages.
    let tabId = castTabId;
    if (!tabId) {
      const tabs = await chrome.tabs.query({url: 'https://chatgpt.com/*', currentWindow: true});
      if (tabs.length === 1) tabId = tabs[0].id;
    }
    if (!tabId) throw new Error('会話のポップアップから設定を開くと、会話限定の辞書を編集できます。');
    const context = await chrome.tabs.sendMessage(tabId, {type: 'VOICEVOX_DICTIONARY_CONTEXT'});
    if (!context?.ok) throw new Error(context?.error || '会話の辞書を取得できませんでした。');
    dictionaryContextKey = context.dictionaryKey;
    const local = await chrome.storage.local.get(dictionaryContextKey);
    document.querySelector('#dictionary-local').value = local[dictionaryContextKey] || '';
    document.querySelector('#dictionary-local').disabled = false;
    document.querySelector('#save-dictionary').disabled = false;
    document.querySelector('#dictionary-context').textContent = `対象：${dictionaryContextKey.includes(':draft:') ? '新規チャット（保存後に引き継ぎます）' : '設定を開いた会話'}`;
  } catch (error) { speechSettingsStatus.textContent = error.message; }
})();
