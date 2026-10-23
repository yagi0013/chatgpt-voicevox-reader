async function testAvailability() {
  const assert = (value, message) => {if (!value) throw new Error(message);};
  const originalFetch = globalThis.fetch;
  const calls = [];
  const waits = [];
  const wait = async (ms, signal) => {signal.throwIfAborted(); waits.push(ms);};
  const catalog = [{name: 'テスト', styles: [{id: 1, name: '正常'}, {id: 2, name: '合成失敗'}, {id: 3, name: '問い合わせ失敗'}, {id: 4, name: '文依存'}]}];
  globalThis.fetch = async (url, options) => {
    calls.push({url, options});
    const query = new URL(url);
    const id = Number(query.searchParams.get('speaker'));
    const fails = (id === 2 && query.pathname === '/synthesis') || id === 3 || (id === 4 && query.searchParams.get('text') === 'こんにちは。');
    return {ok: !fails, status: 500, async text() {return 'unavailable';}, async json() {return {speedScale: 1};}, async blob() {return new Blob(['audio']);}};
  };
  try {
    const controller = new AbortController();
    let completed = 0;
    const report = await voiceAvailability.scan('http://test', catalog, {signal: controller.signal, wait, progress(done) {completed = done;}});
    assert(report.results[1].available && !report.results[2].available && !report.results[3].available && report.results[4].available, 'both API failures and text-dependent recovery');
    assert(report.results[2].stage === 'synthesis' && report.results[3].stage === 'audio_query' && report.results[3].status === 500, 'failure diagnostics');
    assert(completed === 4 && report.checkedAt && report.results[4].firstFailure, 'progress, timestamp and successful second text');
    assert(calls.filter(call => call.url.includes('/synthesis?speaker=2')).length === 2, 'failed synthesis retries second text');
    assert(waits.includes(1000) && waits.includes(3000) && waits.every(ms => ms >= 1000), 'pace every request and back off after failures');
    assert(voiceAvailability.normalizeResult({available: false, errorName: 'TypeError', detail: 'Failed to fetch'}).available === null, 'legacy transport failures become indeterminate');
    assert(voiceAvailability.endpointKey('http://test/') === voiceAvailability.endpointKey('http://test'), 'endpoint normalization');
    globalThis.fetch = async () => {throw new TypeError('offline');};
    const disconnected = await voiceAvailability.scan('http://test', catalog, {signal: controller.signal, wait});
    assert(Object.values(disconnected.results).length === 4 && Object.values(disconnected.results).every(result => result.available === null && result.errorName === 'TypeError'), 'network failures stay indeterminate without interrupting scan');
    const failureCatalog = [{name: '例外確認', styles: [
      {id: 10, name: 'タイムアウト'}, {id: 11, name: '通信失敗'}, {id: 12, name: '不正JSON'},
      {id: 13, name: '空音声'}, {id: 14, name: '合成タイムアウト'}, {id: 15, name: '本文取得失敗'}, {id: 16, name: '最後の正常話者'}
    ]}];
    globalThis.fetch = async url => {
      const parsed = new URL(url), id = Number(parsed.searchParams.get('speaker'));
      if (id === 10 || (id === 14 && parsed.pathname === '/synthesis')) throw new DOMException('timeout', 'TimeoutError');
      if (id === 11) throw new TypeError('Failed to fetch');
      if (id === 15) return {ok: false, status: 500, async text() {throw new Error('body failed');}};
      return {ok: true, async json() {if (id === 12) throw new SyntaxError('Invalid JSON'); return {};}, async blob() {return new Blob(id === 13 ? [] : ['audio']);}};
    };
    const failures = await voiceAvailability.scan('http://test', failureCatalog, {signal: controller.signal, wait});
    assert(Object.keys(failures.results).length === 7 && failures.results[16].available, 'exceptions must not prevent checking later healthy voice');
    for (let id = 10; id < 16; id++) assert(!failures.results[id].available && failures.results[id].firstFailure, 'each failing style retries another text and records failure: ' + id);
    assert(failures.results[12].stage === 'audio_query' && failures.results[13].stage === 'synthesis' && failures.results[14].errorName === 'TimeoutError', 'non-HTTP errors keep failing stage and diagnostic');
    assert(failures.results[15].status === 500, 'HTTP status survives response body failure');
    for (let id = 10; id < 15; id++) assert(failures.results[id].available === null, 'non-HTTP errors do not exclude voices: ' + id);
    globalThis.fetch = async () => ({ok: false, status: 429, headers: {get(name) {return name === 'Retry-After' ? '5' : null;}}, async text() {return 'rate limited';}});
    const limited = await voiceAvailability.scan('http://test', catalog, {signal: controller.signal, wait});
    assert(Object.values(limited.results).every(result => result.available === null), 'rate limiting cannot mark voices unavailable');
    assert(waits.includes(5000), 'server Retry-After controls backoff when longer than default');
    const waitingController = new AbortController();
    let requestsBeforeCancel = 0;
    globalThis.fetch = async () => {requestsBeforeCancel++; return {ok: true, async json() {return {};}, async blob() {return new Blob(['audio']);}};};
    const waitingScan = voiceAvailability.scan('http://test', catalog, {signal: waitingController.signal});
    setTimeout(() => waitingController.abort(), 0);
    let waitCancelled = false;
    try {await waitingScan;} catch {waitCancelled = true;}
    assert(waitCancelled && requestsBeforeCancel === 1, 'cancel interrupts pacing wait before next request');
    controller.abort();
    let cancelled = false;
    try {await voiceAvailability.scan('http://test', catalog, {signal: controller.signal, wait});} catch {cancelled = true;}
    assert(cancelled, 'cancel stops scan');
  } finally {globalThis.fetch = originalFetch;}
}
