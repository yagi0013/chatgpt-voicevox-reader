(function (root) {
  const endpointKey = endpoint => `voiceAvailability:${endpoint.replace(/\/+$/, '')}`;
  async function probe(endpoint, styleId, text, signal) {
    let stage = 'audio_query';
    const request = async (path, params, body) => {
      const response = await fetch(`${endpoint}/${path}?${new URLSearchParams(params)}`, {
        method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        headers: body ? {'Content-Type': 'application/json'} : {},
        body: body ? JSON.stringify(body) : undefined
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw Object.assign(new Error(`HTTP ${response.status}: ${detail}`), {httpStatus: response.status});
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
      // Connection failures stop the scan; they do not prove that a voice is unusable.
      if (!error.httpStatus) throw error;
      return {available: false, stage, status: error.httpStatus, detail: error.message};
    }
  }
  async function scan(endpoint, catalog, {signal, progress = () => {}}) {
    const styles = catalog.flatMap(member => member.styles.map(style => ({...style, member: member.name})));
    const results = {};
    for (const style of styles) {
      signal.throwIfAborted();
      progress(Object.keys(results).length, styles.length, style);
      let result = await probe(endpoint, style.id, 'こんにちは。', signal);
      if (!result.available) {
        const firstFailure = result;
        result = await probe(endpoint, style.id, 'おはようございます。', signal);
        result = {...result, firstFailure};
      }
      results[style.id] = {...result, name: style.member, styleName: style.name};
    }
    signal.throwIfAborted();
    progress(styles.length, styles.length);
    return {checkedAt: Date.now(), results};
  }
  root.voiceAvailability = {endpointKey, probe, scan};
})(globalThis);
