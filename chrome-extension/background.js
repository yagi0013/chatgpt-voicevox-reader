importScripts('speakers.js', 'speech-tools.js');
const WORKER_BUILD = '0.7.6';
let creating;
const operations = new Map();
let engineState = {online: null, version: '', checkedAt: 0};
let checkingEngine;
let catalogReady;
let catalogCheckedAt = 0;
async function engineUrl() {
  return (await chrome.storage.local.get('voicevoxUrl')).voicevoxUrl || 'http://127.0.0.1:50021';
}
async function loadCatalog() {
  if (!catalogReady) catalogReady = chrome.storage.local.get('speakerCatalog').then(saved => {
    voiceRegistry.setCatalog(saved.speakerCatalog);
  }).catch(() => {});
  await catalogReady;
}
async function refreshCatalog() {
  try {
    const response = await fetch(`${await engineUrl()}/speakers`, {signal: AbortSignal.timeout(2500), cache: 'no-store'});
    if (!response.ok) throw new Error('メンバー一覧を取得できませんでした');
    const catalog = voiceRegistry.fromSpeakers(await response.json());
    if (!catalog.length) throw new Error('読み上げ用のメンバーがありません');
    if (JSON.stringify(catalog) !== JSON.stringify(voiceRegistry.catalog) && voiceRegistry.setCatalog(catalog)) {
      await chrome.storage.local.set({speakerCatalog: voiceRegistry.catalog});
    }
    catalogCheckedAt = Date.now();
    return '';
  } catch { return 'メンバー一覧を更新できませんでした。保存済みの一覧を使用します。'; }
}
async function engineHealth() {
  await loadCatalog();
  const endpoint = await engineUrl();
  if (engineState.endpoint !== endpoint) engineState.checkedAt = 0;
  if (Date.now() - engineState.checkedAt < 2000) return engineState;
  if (!checkingEngine) {
    checkingEngine = (async () => {
      try {
        const response = await fetch(`${endpoint}/version`, {signal: AbortSignal.timeout(1500), cache: 'no-store'});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const version = await response.json();
        if (typeof version !== 'string' || !version) throw new Error('VOICEVOXの応答ではありません');
        const rosterError = engineState.endpoint !== endpoint || !engineState.online || Date.now() - catalogCheckedAt > 60000 ? await refreshCatalog() : '';
        engineState = {online: true, version, checkedAt: Date.now(), rosterError, members: voiceRegistry.catalog.length, endpoint};
      } catch {
        engineState = {online: false, version: '', checkedAt: Date.now(), endpoint};
      }
      return engineState;
    })().finally(() => { checkingEngine = null; });
  }
  return checkingEngine;
}
async function hasPlayer() {
  return (await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL('player.html')]})).length > 0;
}
async function player(create = false) {
  if (!await hasPlayer()) {
    if (!create) return false;
    if (!creating) {
      creating = chrome.offscreen.createDocument({
        // Blob URLs must remain valid through long synthesis and queue gaps.
        url: 'player.html', reasons: ['BLOBS'],
        justification: 'ChatGPTのキャラクターのセリフを、ポップアップを閉じた状態でも順番に再生するため'
      }).finally(() => { creating = null; });
    }
    await creating;
  }
  return true;
}
async function route(message, sender) {
  if (message.type === 'BG_RECAST') {
    if (sender.url !== chrome.runtime.getURL('player.html')) throw new Error('送信元が対応していません。');
    return chrome.tabs.sendMessage(message.tabId, {type: 'VOICEVOX_RECAST', item: message.item, unavailable: message.unavailable, endpoint: message.endpoint});
  }
  if (message.type === 'BG_AUDIO_OUTPUT') {
    if (sender.url !== chrome.runtime.getURL('player.html')) throw new Error('送信元が対応していません。');
    const {audioOutputId = ''} = await chrome.storage.local.get('audioOutputId');
    return {ok: true, audioOutputId, voicevoxUrl: await engineUrl()};
  }
  if (message.type === 'BG_APPLY_OUTPUT') {
    if ((sender.url || '').split(/[?#]/, 1)[0] !== chrome.runtime.getURL('audio-settings.html')) throw new Error('送信元が対応していません。');
    if (!await player()) return {ok: true};
    const {audioOutputId = ''} = await chrome.storage.local.get('audioOutputId');
    return chrome.runtime.sendMessage({target: 'player', type: 'OUTPUT_CHANGED', audioOutputId});
  }
  const fromPage = sender.tab && /^https:\/\/chatgpt\.com\//.test(sender.tab.url || '');
  const fromPopup = sender.url === chrome.runtime.getURL('popup.html');
  if (!fromPage && !fromPopup) throw new Error('送信元が対応していません。');
  const tabId = fromPage ? sender.tab.id : message.tabId;
  if (!Number.isInteger(tabId)) throw new Error('対象タブがありません。');
  const storageKey = `auto:${tabId}`;
  const state = (await chrome.storage.session.get(storageKey))[storageKey];
  if ((message.type === 'BG_CONFIG' || message.type === 'BG_INIT') && fromPage) {
    const enabled = message.type === 'BG_INIT'
      ? Boolean((await chrome.storage.local.get('autoEnabled')).autoEnabled)
      : Boolean(message.enabled);
    if (message.type === 'BG_CONFIG' && message.persist) await chrome.storage.local.set({autoEnabled: enabled});
    await chrome.storage.session.set({[storageKey]: {enabled, token: message.token}});
    if (await player()) await chrome.runtime.sendMessage({target: 'player', type: 'STOP', tabId});
    await chrome.action.setBadgeText({tabId, text: enabled ? 'ON' : ''});
    await chrome.action.setBadgeBackgroundColor({tabId, color: '#217346'});
    const engine = await engineHealth();
    return {ok: true, enabled, engine, catalog: voiceRegistry.catalog};
  }
  if (['BG_PAUSE', 'BG_RESUME', 'BG_SKIP', 'BG_CANCEL'].includes(message.type)) {
    if (!await player()) return {ok: true};
    return chrome.runtime.sendMessage({target: 'player', type: message.type === 'BG_CANCEL' ? 'STOP' : message.type.slice(3), tabId});
  }
  if (message.type === 'BG_QUEUE') {
    if (fromPage && (!state?.enabled || state.token !== message.token)) return {ok: false, error: '自動読み上げはOFFです。'};
    const engine = await engineHealth();
    if (!engine.online) return {ok: true, skipped: true, engine};
    const items = (message.items || []).filter(item => {
      const speaker = voiceRegistry.resolve(item?.name || '');
      return speaker?.styles.some(style => style.id === item.styleId) && typeof item.text === 'string' && item.text.trim();
    });
    if (!items.length) return {ok: false, error: '再生可能なキャラクター・スタイルが見つかりません。拡張機能とページを更新してください。'};
    const common = (await chrome.storage.local.get('pronunciationCommon')).pronunciationCommon || '';
    let dictionaryKey = '';
    // Ask the content script for its current conversation, including unsaved drafts.
    if (chrome.tabs.sendMessage) {
      const context = await chrome.tabs.sendMessage(tabId, {type: 'VOICEVOX_DICTIONARY_CONTEXT'});
      if (!context?.ok) throw new Error('会話の辞書を取得できませんでした。ChatGPTを再読み込みしてください。');
      dictionaryKey = context.dictionaryKey;
    }
    const local = dictionaryKey ? (await chrome.storage.local.get(dictionaryKey))[dictionaryKey] || '' : '';
    const {emotionEnabled = true} = await chrome.storage.local.get('emotionEnabled');
    const speechItems = items.map(item => ({...item, speechText: speechTools.spokenText(item.text, common, local), expressive: emotionEnabled}));
    await player(true);
    const result = await chrome.runtime.sendMessage({target: 'player', type: 'QUEUE', tabId, items: speechItems, batchId: message.batchId});
    return {...result, accepted: items.length};
  }
  if (message.type === 'BG_HEALTH') {
    const engine = await engineHealth();
    if (!engine.online && await player()) await chrome.runtime.sendMessage({target: 'player', type: 'STOP', tabId});
    return {ok: true, engine, catalog: voiceRegistry.catalog};
  }
  if (message.type === 'BG_CHARACTER_IMAGE') {
    const endpoint = await engineUrl();
    const rosterResponse = await fetch(`${endpoint}/speakers`, {signal: AbortSignal.timeout(15000)});
    if (!rosterResponse.ok) throw new Error('キャラクター一覧を取得できませんでした');
    const roster = await rosterResponse.json();
    const member = roster.find(speaker => speaker.styles.some(style => style.id === message.styleId));
    if (!member) return {ok: true, image: ''};
    const response = await fetch(`${endpoint}/speaker_info?speaker_uuid=${encodeURIComponent(member.speaker_uuid)}`, {signal: AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error('キャラクター画像を取得できませんでした');
    const info = await response.json();
    const portrait = info.portrait || info.style_infos?.[0]?.icon || '';
    return {ok: true, image: portrait ? `data:image/png;base64,${portrait}` : ''};
  }
  if (message.type === 'BG_PANEL_STATUS') {
    const status = await player() ? await chrome.runtime.sendMessage({target: 'player', type: 'STATUS', tabId}) : {active: false, pending: 0};
    return {ok: true, ...status};
  }
  if (message.type === 'BG_STATUS') {
    const status = await player() ? await chrome.runtime.sendMessage({target: 'player', type: 'STATUS', tabId}) : {status: '待機中', pending: 0};
    const engine = await engineHealth();
    return {ok: true, ...status, engine, catalog: voiceRegistry.catalog, workerVersion: WORKER_BUILD};
  }
  throw new Error('未対応の操作です。');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message.type?.startsWith('BG_')) return;
  const tabId = sender.tab?.id ?? message.tabId;
  // Remote portraits can be slow; image downloads must not delay playback controls.
  const operationKey = message.type === 'BG_CHARACTER_IMAGE' ? `image:${tabId}` : tabId;
  const previous = operations.get(operationKey) || Promise.resolve();
  const task = previous.catch(() => {}).then(() => route(message, sender));
  operations.set(operationKey, task);
  task.then(respond, error => respond({ok: false, error: error.message})).finally(() => {
    if (operations.get(operationKey) === task) operations.delete(operationKey);
  });
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(`auto:${tabId}`);
  player().then(exists => exists && chrome.runtime.sendMessage({target: 'player', type: 'STOP', tabId})).catch(() => {});
});
