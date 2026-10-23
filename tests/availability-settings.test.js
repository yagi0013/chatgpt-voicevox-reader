const defaultEngine = 'http://test';
const fixture = document.createElement('section');
fixture.innerHTML = '<button id="check-voices"></button><button id="cancel-voice-check"></button><p id="voice-check-status"></p><pre id="voice-check-results"></pre><button id="reset-engine"></button><button id="save-engine"></button><input id="voicevox-url">';
document.body.append(fixture);
const engineInput = fixture.querySelector('#voicevox-url');
const engineSave = fixture.querySelector('#save-engine');
const stopVoicePreview = () => {};
const saved = {voicevoxUrl: defaultEngine};
const chrome = {storage: {local: {
  async get(key) {return {[key]: saved[key]};},
  async set(values) {Object.assign(saved, values);}
}, onChanged: {addListener() {}}}};
async function testAvailabilitySettings() {
  const assert = (value, message) => {if (!value) throw new Error(message);};
  const originalFetch = globalThis.fetch;
  const originalScan = voiceAvailability.scan;
  voiceAvailability.scan = (endpoint, catalog, options) => originalScan(endpoint, catalog, {...options, intervalMs: 0, retryMs: 0});
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  let fail = false;
  globalThis.fetch = async url => {
    if (url.endsWith('/speakers')) return {ok: true, async json() {return [{name: 'テスト', styles: [{id: 1, name: '正常', type: 'talk'}]}];}};
    return {ok: !fail, status: 500, async text() {return 'unavailable';}, async json() {return {};}, async blob() {return new Blob(['audio']);}};
  };
  try {
    await tick();
    checkVoices.click();
    for (let i = 0; i < 5; i++) await tick();
    const key = voiceAvailability.endpointKey(defaultEngine);
    assert(saved[key]?.results[1].available && voiceCheckResults.textContent.includes('正常'), 'check button saves and displays per-style result');
    fail = true;
    checkVoices.click();
    for (let i = 0; i < 5; i++) await tick();
    assert(saved[key].results[1].available === false && voiceCheckResults.textContent.includes('500'), 'recheck stores unavailable and displays diagnostic');
    fail = false;
    checkVoices.click();
    for (let i = 0; i < 5; i++) await tick();
    assert(saved[key].results[1].available, 'successful recheck restores previously unavailable style');
    const roster = [{name: 'テスト', styles: [{id: 1, name: '通信失敗', type: 'talk'}, {id: 2, name: '後続正常', type: 'talk'}]}];
    globalThis.fetch = async url => {
      if (url.endsWith('/speakers')) return {ok: true, async json() {return roster;}};
      if (new URL(url).searchParams.get('speaker') === '1') throw new TypeError('Failed to fetch');
      return {ok: true, async json() {return {};}, async blob() {return new Blob(['audio']);}};
    };
    checkVoices.click();
    for (let i = 0; i < 5; i++) await tick();
    assert(saved[key].results[1].available === null && saved[key].results[2].available === true, 'UI scan saves indeterminate and later healthy styles despite network errors');
    assert(voiceCheckStatus.textContent.includes('判定不能 1') && voiceCheckResults.textContent.includes('Failed to fetch') && voiceCheckResults.textContent.includes('除外しません'), 'completed scan distinguishes network failures from exclusions');
    const firstReport = saved[key];
    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/speakers')) return {ok: true, async json() {return [{name: 'テスト', styles: [{id: 1, name: '正常', type: 'talk'}]}];}};
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('cancel', 'AbortError')), {once: true}));
    };
    checkVoices.click();
    await tick();
    assert(engineInput.disabled && !cancelVoiceCheck.disabled, 'checking locks endpoint controls and enables cancel');
    cancelVoiceCheck.click();
    await tick();
    assert(saved[key] === firstReport && voiceCheckStatus.textContent.includes('中止'), 'cancel preserves previous report');
    assert(!engineInput.disabled && !checkVoices.disabled, 'cancel restores controls');
    saved.voicevoxUrl = 'http://other';
    await loadVoiceCheck();
    assert(voiceCheckStatus.textContent.includes('未チェック') && !voiceCheckResults.textContent, 'endpoint change shows its own report');
  } finally {globalThis.fetch = originalFetch; voiceAvailability.scan = originalScan; fixture.remove();}
}
