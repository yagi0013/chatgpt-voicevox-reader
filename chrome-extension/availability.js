(function (root) {
  const endpointKey = endpoint => `voiceAvailability:${endpoint.replace(/\/+$/, '')}`;
  const uncertainStatus = status => [408, 429, 502, 503, 504].includes(status);
  function normalizeResult(result) {
    if (!result) return result;
    // Older reports treated transport errors as unavailable voices.
    const uncertain = uncertainStatus(result.status) || (!result.status && result.errorName) || (result.firstFailure && normalizeResult(result.firstFailure).available === null);
    return uncertain && result.available === false ? {...result, available: null} : result;
  }
  function delay(ms, signal) {
    signal.throwIfAborted();
    if (!ms) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const abort = () => {clearTimeout(timer); reject(signal.reason);};
      const timer = setTimeout(() => {signal.removeEventListener('abort', abort); resolve();}, ms);
      signal.addEventListener('abort', abort, {once: true});
    });
  }
  async function probe(endpoint, styleId, text, signal, beforeRequest = async () => {}) {
    let stage = 'audio_query';
    const request = async (path, params, body) => {
      await beforeRequest();
      signal.throwIfAborted();
      const response = await fetch(`${endpoint}/${path}?${new URLSearchParams(params)}`, {
        method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        headers: body ? {'Content-Type': 'application/json'} : {},
        body: body ? JSON.stringify(body) : undefined
      });
      if (!response.ok) {
        const retryAfter = response.headers?.get('Retry-After');
        const retryAfterMs = retryAfter ? (Number.isFinite(Number(retryAfter)) ? Math.max(0, Number(retryAfter) * 1000) : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0) : 0;
        const detail = (await response.text().catch(error => `${error.name}: ${error.message}`)).slice(0, 300);
        throw Object.assign(new Error(`HTTP ${response.status}: ${detail}`), {httpStatus: response.status, retryAfterMs});
      }
      return response;
    };
    try {
      const query = await (await request(stage, {speaker: styleId, text})).json();
      stage = 'synthesis';
      const audio = await (await request(stage, {speaker: styleId}, query)).blob();
      if (!audio.size) throw new Error('空の音声が返されました');
      return {available: true};
    } catch (error) {
      signal.throwIfAborted();
      // Only the user's cancellation ends a scan. A timeout or malformed response
      // belongs to this style, just like an HTTP failure, and must not hide the rest.
      return {available: error.httpStatus && !uncertainStatus(error.httpStatus) ? false : null, stage, status: error.httpStatus,
        retryAfterMs: error.retryAfterMs, errorName: error.name || 'Error', detail: error.message || String(error)};
    }
  }
  async function scan(endpoint, catalog, {signal, progress = () => {}, intervalMs = 1000, retryMs = 3000, wait = delay}) {
    const styles = catalog.flatMap(member => member.styles.map(style => ({...style, member: member.name})));
    const results = {};
    let firstRequest = true, cooldown = 0;
    const beforeRequest = async () => {
      if (!firstRequest) await wait(Math.max(intervalMs, cooldown), signal);
      firstRequest = false;
      cooldown = 0;
      signal.throwIfAborted();
    };
    for (const style of styles) {
      signal.throwIfAborted();
      progress(Object.keys(results).length, styles.length, style);
      let result = await probe(endpoint, style.id, 'こんにちは。', signal, beforeRequest);
      if (!result.available) {
        const firstFailure = result;
        cooldown = Math.max(retryMs, result.retryAfterMs || 0);
        result = await probe(endpoint, style.id, 'おはようございます。', signal, beforeRequest);
        if (result.available !== true && (firstFailure.available === null || result.available === null)) result = {...result, available: null};
        result = {...result, firstFailure};
      }
      if (!result.available) cooldown = Math.max(retryMs, result.retryAfterMs || 0);
      results[style.id] = {...result, name: style.member, styleName: style.name};
    }
    signal.throwIfAborted();
    progress(styles.length, styles.length);
    return {checkedAt: Date.now(), results};
  }
  root.voiceAvailability = {endpointKey, probe, scan, normalizeResult};
})(globalThis);
