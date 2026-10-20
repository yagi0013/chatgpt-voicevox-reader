async function testBackground() {
  localData.audioOutputId = 'headphones';
  const output = await route({type: 'BG_AUDIO_OUTPUT'}, {url: chrome.runtime.getURL('player.html')});
  if (!output.ok || output.audioOutputId !== 'headphones') throw new Error('offscreen output settings request');
  let rejectedOutput = false;
  try { await route({type: 'BG_AUDIO_OUTPUT'}, {tab: {id: 7, url: 'https://chatgpt.com/'}}); }
  catch { rejectedOutput = true; }
  if (!rejectedOutput) throw new Error('output settings must be limited to player');

  const sender = {tab: {id: 7, url: 'https://chatgpt.com/c/test'}};
  const init = await route({type: 'BG_INIT', token: 'first'}, sender);
  if (!init.enabled || init.engine.online || !localData.autoEnabled || lastBadge !== 'ON') throw new Error('saved ON must survive offline initialization');
  const speech = {name: 'ずんだもん', styleId: 3, text: 'テスト'};
  const offline = await route({type: 'BG_QUEUE', items: [speech], token: 'first', batchId: 'offline'}, sender);
  if (!offline.skipped || created || playerMessages.length) throw new Error('offline must not create player or enqueue');
  await route({type: 'BG_HEALTH'}, sender);
  if (healthRequests !== 1) throw new Error('health cache');
  engineRunning = true; fakeNow += 3000;
  const online = await route({type: 'BG_HEALTH'}, sender);
  if (!online.engine.online || online.engine.version !== '0.25.2') throw new Error('engine recovery');
  await route({type: 'BG_QUEUE', items: [speech], token: 'first', batchId: 'online'}, sender);
  if (created !== 1 || playerMessages.at(-1).type !== 'QUEUE') throw new Error('online enqueue');
  await route({type: 'BG_QUEUE', items: [{name: '新メンバー', styleId: 777, text: '新しいキャラクター'}], token: 'first', batchId: 'new-member'}, sender);
  if (playerMessages.at(-1).items[0].styleId !== 777) throw new Error('dynamic member rejected by backend');
  await route({type: 'BG_QUEUE', items: [{name: '四国めたん', styleName: 'ツンツン', styleId: 6, text: 'スタイル指定'}], token: 'first', batchId: 'styled'}, sender);
  if (playerMessages.at(-1).items[0].styleId !== 6) throw new Error('nondefault style rejected by backend');
  chrome.tabs.sendMessage = async () => ({ok: true, dictionaryKey: 'pronunciation:conversation:test'});
  localData.pronunciationCommon = '春雨=はるさめ';
  localData['pronunciation:conversation:test'] = '春雨=しゅんう';
  localData.emotionEnabled = false;
  const originalSpeech = {...speech, text: '春雨！！', requestedStyle: 'あまあま'};
  await route({type: 'BG_QUEUE', items: [originalSpeech], token: 'first', batchId: 'dictionary'}, sender);
  const transformed = playerMessages.at(-1).items[0];
  if (transformed.text !== '春雨！！' || transformed.speechText !== 'しゅんう！！' || transformed.expressive !== false || transformed.requestedStyle !== 'あまあま' || originalSpeech.speechText !== undefined) throw new Error('dictionary scope/display/style preservation');
  chrome.tabs.sendMessage = async () => ({ok: true, dictionaryKey: 'pronunciation:conversation:other'});
  await route({type: 'BG_QUEUE', items: [originalSpeech], token: 'first', batchId: 'other-dictionary'}, sender);
  if (playerMessages.at(-1).items[0].speechText !== 'はるさめ！！') throw new Error('local dictionary leaked across conversations');
  delete chrome.tabs.sendMessage;
  delete localData.pronunciationCommon;
  delete localData.emotionEnabled;
  for (const [command, expected] of [['BG_PAUSE', 'PAUSE'], ['BG_RESUME', 'RESUME'], ['BG_SKIP', 'SKIP'], ['BG_CANCEL', 'STOP']]) {
    const result = await route({type: command, tabId: 7}, {url: chrome.runtime.getURL('popup.html')});
    if (!result.ok || playerMessages.at(-1).type !== expected || playerMessages.at(-1).tabId !== 7 || !localData.autoEnabled) throw new Error('playback control routing must preserve automatic preference');
  }
  const beforeUnknown = playerMessages.length;
  await route({type: 'BG_QUEUE', items: [{name: '東北きりたん', styleId: 6, text: '別キャラクターのID'}], token: 'first', batchId: 'wrong-speaker'}, sender);
  if (playerMessages.length !== beforeUnknown) throw new Error('another character style cannot enter queue');
  await route({type: 'BG_QUEUE', items: [{name: '歌専用', styleId: 999, text: '対象外'}], token: 'first', batchId: 'sing'}, sender);
  if (playerMessages.length !== beforeUnknown) throw new Error('singing style must not enter speech queue');
  if (!localData.speakerCatalog?.some(item => item.styleId === 777)) throw new Error('discovered catalog persisted');
  engineRunning = false; fakeNow += 3000;
  await route({type: 'BG_HEALTH'}, sender);
  if (playerMessages.at(-1).type !== 'STOP' || !localData.autoEnabled) throw new Error('engine stop cancels audio without changing preference');
  await route({type: 'BG_CONFIG', enabled: false, token: 'off', persist: true}, sender);
  if (localData.autoEnabled || lastBadge) throw new Error('explicit OFF persisted');
  const restart = await route({type: 'BG_INIT', token: 'reload'}, sender);
  if (restart.enabled) throw new Error('OFF restored after reload');
  const rejected = await route({type: 'BG_QUEUE', items: [speech], token: 'first', batchId: 'stale'}, sender);
  if (rejected.ok) throw new Error('old token cannot enqueue');
  await route({type: 'BG_CONFIG', enabled: true, token: 'on', persist: true}, sender);
  if (!localData.autoEnabled) throw new Error('ON persisted while offline');
  const other = await route({type: 'BG_INIT', token: 'other'}, {tab: {id: 8, url: 'https://chatgpt.com/'}});
  if (!other.enabled || other.engine.online) throw new Error('new tab shares saved preference, engine stays offline');
  const applied = await route({type: 'BG_APPLY_OUTPUT'}, {url: chrome.runtime.getURL('audio-settings.html')});
  if (!applied.ok || playerMessages.at(-1).type !== 'OUTPUT_CHANGED' || playerMessages.at(-1).audioOutputId !== 'headphones') throw new Error('settings must forward saved output to live player');
  for (const suffix of ['?tabId=7', '?tabId=7#output', '#output']) {
    const result = await route({type: 'BG_APPLY_OUTPUT'}, {url: chrome.runtime.getURL('audio-settings.html') + suffix});
    if (!result.ok || playerMessages.at(-1).type !== 'OUTPUT_CHANGED') throw new Error('settings query/hash must be accepted: ' + suffix);
  }
  for (const url of ['https://example.com/audio-settings.html?tabId=7', chrome.runtime.getURL('audio-settings.html.evil?tabId=7'), chrome.runtime.getURL('popup.html?audio-settings.html')]) {
    let rejected = false;
    try { await route({type: 'BG_APPLY_OUTPUT'}, {url}); } catch { rejected = true; }
    if (!rejected) throw new Error('untrusted settings URL must be rejected: ' + url);
  }
  let rejectedApply = false;
  try { await route({type: 'BG_APPLY_OUTPUT'}, sender); } catch { rejectedApply = true; }
  if (!rejectedApply) throw new Error('only settings page may apply output');
  print('PASS: background preference restore, health cache, offline gate, recovery, stop and stale token');
}
const loop = new GLib.MainLoop(null, false);
testBackground().then(() => loop.quit(), error => { printerr(error.stack); failure = true; loop.quit(); });
loop.run();
if (failure) imports.system.exit(1);
