async function testAvailability() {
  const assert = (value, message) => {if (!value) throw new Error(message);};
  const originalFetch = globalThis.fetch;
  const calls = [];
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
    const report = await voiceAvailability.scan('http://test', catalog, {signal: controller.signal, progress(done) {completed = done;}});
    assert(report.results[1].available && !report.results[2].available && !report.results[3].available && report.results[4].available, 'both API failures and text-dependent recovery');
    assert(report.results[2].stage === 'synthesis' && report.results[3].stage === 'audio_query' && report.results[3].status === 500, 'failure diagnostics');
    assert(completed === 4 && report.checkedAt && report.results[4].firstFailure, 'progress, timestamp and successful second text');
    assert(calls.filter(call => call.url.includes('/synthesis?speaker=2')).length === 2, 'failed synthesis retries second text');
    assert(voiceAvailability.endpointKey('http://test/') === voiceAvailability.endpointKey('http://test'), 'endpoint normalization');
    globalThis.fetch = async () => {throw new TypeError('offline');};
    let disconnected = false;
    try {await voiceAvailability.scan('http://test', catalog, {signal: controller.signal});} catch {disconnected = true;}
    assert(disconnected, 'network failure must not produce unavailable report');
    controller.abort();
    let cancelled = false;
    try {await voiceAvailability.scan('http://test', catalog, {signal: controller.signal});} catch {cancelled = true;}
    assert(cancelled, 'cancel stops scan');
  } finally {globalThis.fetch = originalFetch;}
}
