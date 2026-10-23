const PLAYER_BUILD = '0.7.4';
const queue = [];
const statuses = new Map();
const batches = new Set();
const pausedTabs = new Set();
let current = null;
let running = false;
// Keep the saved preference separate from the temporary playback destination.
function updateOutput(active) {
  active.outputUpdate = (active.outputUpdate || Promise.resolve()).catch(() => {}).then(async () => {
    if (current !== active || active.controller.signal.aborted) return;
    const audio = active.audio;
    if (!audio.setSinkId) {
      if (active.audioOutputId) throw new Error('このブラウザーは出力先の指定に対応していません');
      return;
    }
    try {
      await audio.setSinkId(active.audioOutputId);
      active.outputWarning = '';
    } catch (error) {
      if (!active.audioOutputId) throw error;
      await audio.setSinkId('');
      active.outputWarning = `指定の出力先を使えないため既定で再生中（${error.name || 'Error'}：${error.message}）`;
    }
  });
  return active.outputUpdate;
}
navigator.mediaDevices?.addEventListener('devicechange', () => {
  if (current?.audio && current.audioOutputId !== undefined) {
    const active = current;
    updateOutput(active).catch(error => {
      if (current === active && !active.controller.signal.aborted) {
        stop(active.tabId);
        statuses.set(active.tabId, `エラー：音声出力先を切り替えられませんでした（${error.message}）。`);
      }
    });
  }
});
function speechRate(text) {
  // Count spoken text only; spaces/newlines do not increase the rate.
  const length = Array.from(text.replace(/\s/gu, '')).length;
  if (length <= 50) return 1.0;
  if (length <= 100) return 1.15;
  if (length <= 200) return 1.30;
  if (length <= 300) return 1.45;
  return 1.60;
}
function stop(tabId) {
  pausedTabs.delete(tabId);
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].tabId === tabId) queue.splice(i, 1);
  if (current?.tabId === tabId) {
    current.controller.abort();
    current.audio?.pause();
    current.cancel?.();
  }
  statuses.set(tabId, '停止しました');
  drain();
}
function pausePlayback(tabId) {
  if (current?.tabId !== tabId && !queue.some(job => job.tabId === tabId)) return;
  pausedTabs.add(tabId);
  if (current?.tabId === tabId) {
    current.playAttempt = (current.playAttempt || 0) + 1;
    current.audio?.pause();
  }
  statuses.set(tabId, '一時停止中');
}
function resumePlayback(tabId) {
  pausedTabs.delete(tabId);
  if (current?.tabId === tabId) {
    statuses.set(tabId, current.playStatus || '合成中');
    current.play?.();
  }
  drain();
}
function skipPlayback(tabId) {
  if (current?.tabId === tabId && !current.controller.signal.aborted) {
    current.controller.abort();
    current.audio?.pause();
    current.cancel?.();
  } else {
    const index = queue.findIndex(job => job.tabId === tabId);
    if (index >= 0) queue.splice(index, 1);
  }
  if (!queue.some(job => job.tabId === tabId)) pausedTabs.delete(tabId);
  statuses.set(tabId, pausedTabs.has(tabId) ? '一時停止中' : 'スキップしました');
  drain();
}
async function request(path, params, body, signal, endpoint) {
  const response = await fetch(`${endpoint}/${path}?${new URLSearchParams(params)}`, {
    method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
    headers: body ? {'Content-Type': 'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const error = new Error(`VOICEVOX ${path}: HTTP ${response.status}`);
    error.engineResponse = true;
    throw error;
  }
  return response;
}
async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const index = queue.findIndex(job => !pausedTabs.has(job.tabId));
      if (index < 0) break;
      const [job] = queue.splice(index, 1);
      const controller = new AbortController();
      const active = {tabId: job.tabId, controller, item: job.item};
      current = active;
      let url;
      try {
        statuses.set(job.tabId, `${job.item.name}：合成中`);
        const config = await chrome.runtime.sendMessage({type: 'BG_AUDIO_OUTPUT'});
        if (!config?.ok) throw new Error(config?.error || 'VOICEVOXの設定を取得できませんでした');
        const endpoint = config.voicevoxUrl || 'http://127.0.0.1:50021';
        controller.signal.throwIfAborted();
        let query, blob;
        const unavailable = [];
        while (true) {
          try {
            query = await (await request('audio_query', {text: job.item.speechText ?? job.item.text, speaker: job.item.styleId}, null, controller.signal, endpoint)).json();
            controller.signal.throwIfAborted();
            query.speedScale = speechRate(job.item.text);
            speechTools.express(query, job.item);
            blob = await (await request('synthesis', {speaker: job.item.styleId}, query, controller.signal, endpoint)).blob();
            break;
          } catch (error) {
            controller.signal.throwIfAborted();
            error.engineResponse = true;
            if (!job.item.automatic) throw error;
            unavailable.push(job.item.name);
            const result = await chrome.runtime.sendMessage({type: 'BG_RECAST', tabId: job.tabId, endpoint, item: job.item, unavailable}).catch(() => null);
            controller.signal.throwIfAborted();
            if (!result?.ok || !result.speaker || unavailable.includes(result.speaker.name)) throw error;
            const old = job.item;
            const voice = result.speaker;
            const replace = item => ({...item, name: voice.name, styleId: voice.styleId, styleName: voice.styleName});
            for (const queued of queue) {
              if (queued.tabId === job.tabId && queued.item.automatic && queued.item.castingLabel === old.castingLabel && queued.item.castingContext === old.castingContext && queued.item.name === old.name && queued.item.requestedStyle === old.requestedStyle) queued.item = replace(queued.item);
            }
            job.item = replace(old);
            active.item = job.item;
            statuses.set(job.tabId, `${job.item.name}：再抽選して合成中`);
          }
        }
        controller.signal.throwIfAborted();
        url = URL.createObjectURL(blob);
        active.audio = new Audio(url);
        // Offscreen documents only expose chrome.runtime; storage lives in the worker.
        const output = await chrome.runtime.sendMessage({type: 'BG_AUDIO_OUTPUT'});
        if (!output?.ok) throw new Error(output?.error || '音声出力先の設定を取得できませんでした');
        active.audioOutputId = output.audioOutputId || '';
        await updateOutput(active);
        controller.signal.throwIfAborted();
        active.playStatus = `${job.item.name}：再生中（${query.speedScale.toFixed(2)}倍）`;
        await new Promise((resolve, reject) => {
          active.cancel = () => reject(new DOMException('停止', 'AbortError'));
          active.audio.onended = resolve;
          active.audio.onerror = () => reject(new Error('音声の再生に失敗しました。'));
          active.play = () => {
            if (controller.signal.aborted || pausedTabs.has(job.tabId)) return;
            statuses.set(job.tabId, active.playStatus);
            const attempt = active.playAttempt = (active.playAttempt || 0) + 1;
            active.audio.play().catch(error => {
              // pause() can reject a pending play(); resuming uses a new attempt.
              if (attempt === active.playAttempt && !pausedTabs.has(job.tabId)) reject(error);
            });
          };
          if (pausedTabs.has(job.tabId)) statuses.set(job.tabId, '一時停止中');
          else active.play();
        });
        statuses.set(job.tabId, pausedTabs.has(job.tabId) ? '一時停止中' : '待機中');
      } catch (error) {
        if (error.name !== 'AbortError') {
          if (error.engineResponse) statuses.set(job.tabId, `スキップ：${job.item.name}（${error.message}）`);
          else {
            stop(job.tabId);
            statuses.set(job.tabId, `エラー：${error.message}。VOICEVOXの起動・権限を確認してください。`);
          }
        }
      } finally {
        if (active.audio) {
          active.audio.onended = null;
          active.audio.onerror = null;
          active.audio.pause();
          active.audio.removeAttribute('src');
          // Reset the media pipeline as well as releasing the Blob URL.
          active.audio.load();
          active.audio = null;
        }
        if (url) URL.revokeObjectURL(url);
        active.play = null;
        active.cancel = null;
        active.outputUpdate = null;
        current = null;
        if (!queue.some(queued => queued.tabId === job.tabId)) pausedTabs.delete(job.tabId);
      }
    }
  } finally { running = false; }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target !== 'player') return;
  if (message.type === 'OUTPUT_CHANGED') {
    const active = current;
    if (!active?.audio || active.controller.signal.aborted) { respond({ok: true}); return; }
    active.audioOutputId = message.audioOutputId || '';
    updateOutput(active).then(() => respond({ok: true, warning: active.outputWarning || ''}), error => {
      if (current === active && !active.controller.signal.aborted) {
        stop(active.tabId);
        statuses.set(active.tabId, `エラー：音声出力先を切り替えられませんでした（${error.message}）。`);
      }
      respond({ok: false, error: error.message});
    });
    return true;
  } else if (message.type === 'QUEUE') {
    if (!batches.has(message.batchId)) {
      batches.add(message.batchId);
      // Bounded deduplication, without keeping conversation text.
      if (batches.size > 2000) batches.delete(batches.values().next().value);
      for (const item of message.items) queue.push({tabId: message.tabId, item});
      drain();
    }
    respond({ok: true});
  } else if (message.type === 'STOP') {
    stop(message.tabId);
    respond({ok: true});
  } else if (message.type === 'PAUSE' || message.type === 'RESUME' || message.type === 'SKIP') {
    if (message.type === 'PAUSE') pausePlayback(message.tabId);
    else if (message.type === 'RESUME') resumePlayback(message.tabId);
    else skipPlayback(message.tabId);
    respond({ok: true});
  } else if (message.type === 'STATUS') {
    const active = current?.tabId === message.tabId && !current.controller.signal.aborted ? current : null;
    const duration = Number.isFinite(active?.audio?.duration) ? active.audio.duration : 0;
    respond({outputWarning: active?.outputWarning || '', speaker: active?.item.name || '', styleId: active?.item.styleId, playing: Boolean(active?.audio && !active.audio.paused), duration, elapsed: active?.audio?.currentTime || 0, playerVersion: PLAYER_BUILD, paused: pausedTabs.has(message.tabId), active: current?.tabId === message.tabId && !current.controller.signal.aborted, status: (statuses.get(message.tabId) || '待機中') + (active?.outputWarning ? ` ／ ${active.outputWarning}` : ''), pending: queue.filter(job => job.tabId === message.tabId).length});
  }
});
