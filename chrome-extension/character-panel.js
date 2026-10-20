(() => {
  if (globalThis.__voicevoxCharacterPanel) return;
  globalThis.__voicevoxCharacterPanel = true;
  const host = document.createElement('div');
  host.id = 'voicevox-character-panel';
  host.style.cssText = 'all:initial;position:fixed;right:0;top:120px;width:190px;z-index:2147483646;pointer-events:none;display:none';
  const root = host.attachShadow({mode: 'closed'});
  root.innerHTML = `<style>
    :host { color-scheme:dark; }
    * { box-sizing:border-box; }
    .drawer { position:relative; width:190px; padding:8px; background:#1b2530ed; color:#fff; border:1px solid #687786; border-right:0; border-radius:12px 0 0 12px; transform:translateX(100%); transition:transform .28s ease; pointer-events:auto; font:12px sans-serif; box-shadow:0 4px 20px #0005; }
    .drawer.open { transform:translateX(0); }
    button { color:#fff; background:#283846; border:1px solid #687786; border-radius:7px; cursor:pointer; padding:6px; font:19px sans-serif; }
    button:focus-visible { outline:2px solid #75d4ff; outline-offset:2px; }
    button:disabled { opacity:.4; cursor:default; }
    .handle { position:absolute; left:-23px; top:12px; width:23px; height:60px; padding:0; border-radius:10px 0 0 10px; touch-action:none; cursor:ns-resize; }
    .portrait { height:220px; display:flex; align-items:end; justify-content:center; touch-action:none; cursor:ns-resize; }
    img { width:100%; height:100%; object-fit:contain; pointer-events:none; }
    .fallback { font-size:70px; align-self:center; }
    .speaker-name { margin-top:5px; text-align:center; font-size:11px; line-height:1.4; color:#dce6ef; overflow-wrap:anywhere; }
    .timeline { display:flex; align-items:center; gap:5px; margin:7px 0; font:11px monospace; }
    progress { width:100%; height:5px; accent-color:#78d7b4; }
    time { white-space:nowrap; min-width:34px; text-align:right; }
    nav { display:flex; justify-content:center; gap:8px; }
    @media (max-height:360px) { .portrait { height:120px; } }
    @media (prefers-reduced-motion:reduce) { .drawer { transition:none; } }
  </style><div class="drawer"><button class="handle" title="引き出す／しまう・上下ドラッグで移動" aria-label="読み上げパネルを引き出す" aria-expanded="false">◀</button><div class="portrait" title="上下ドラッグで移動"><img hidden alt=""><span class="fallback">🎭</span></div><div class="speaker-name"></div><div class="timeline"><progress max="1" value="0" aria-label="セリフの再生位置"></progress><time>--:--</time></div><nav aria-label="読み上げ操作"><button class="toggle" title="再開" aria-label="再開">▶️</button><button class="skip" title="次のセリフ" aria-label="次のセリフ">⏭️</button><button class="stop" title="停止" aria-label="停止">⏹️</button></nav></div>`;
  document.documentElement.append(host);
  const $ = selector => root.querySelector(selector);
  const drawer = $('.drawer'), handle = $('.handle'), image = $('img'), fallback = $('.fallback');
  const toggle = $('.toggle'), skip = $('.skip'), stop = $('.stop');
  let state = {}, collapsed = false, manualOpen = false, stopped = false, polling = false;
  let top = 120, imageKey = '', displayedSpeaker = '', switchTimer, dragging, suppressClick = false;
  const images = new Map();
  const IMAGE_CACHE_LIMIT = 24;
  let pollTimer;
  let panelEnabled = false;
  function position() {
    top = Math.max(8, Math.min(top, Math.max(8, innerHeight - drawer.offsetHeight - 8)));
    host.style.top = `${top}px`;
  }
  function visibility() {
    const open = panelEnabled && !collapsed && (manualOpen || state.active || state.pending > 0);
    drawer.classList.toggle('open', Boolean(open));
    handle.textContent = open ? '▶' : '◀';
    handle.setAttribute('aria-expanded', String(Boolean(open)));
    handle.setAttribute('aria-label', open ? '読み上げパネルをしまう' : '読み上げパネルを引き出す');
    drawer.querySelectorAll('nav button').forEach(button => button.tabIndex = open ? 0 : -1);
    position();
  }
  async function save() {
    try { await chrome.storage.local.set({characterPanel: {top, collapsed}}); } catch { /* The old context may have been invalidated. */ }
  }
  handle.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    const open = drawer.classList.contains('open');
    collapsed = open;
    manualOpen = !open;
    visibility();
    save();
  });
  for (const area of [handle, $('.portrait')]) {
    area.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      dragging = {id: event.pointerId, y: event.clientY, top, moved: false};
      suppressClick = false;
      area.setPointerCapture(event.pointerId);
    });
    area.addEventListener('pointermove', event => {
      if (!dragging || dragging.id !== event.pointerId) return;
      if (Math.abs(event.clientY - dragging.y) > 4) dragging.moved = true;
      if (!dragging.moved) return;
      top = dragging.top + event.clientY - dragging.y;
      position();
    });
    const finish = event => {
      if (!dragging || dragging.id !== event.pointerId) return;
      suppressClick = dragging.moved;
      dragging = null;
      save();
    };
    area.addEventListener('pointerup', finish);
    area.addEventListener('pointercancel', finish);
  }
  window.addEventListener('resize', position);
  async function portrait(snapshot) {
    const key = snapshot.speaker;
    if (!snapshot.speaker || imageKey === key) return;
    imageKey = key;
    const requestKey = key;
    image.hidden = true;
    fallback.hidden = false;
    image.alt = snapshot.speaker;
    $('.speaker-name').textContent = snapshot.speaker;
    try {
      let source = images.get(key);
      if (images.has(key)) { images.delete(key); images.set(key, source); }
      if (source === undefined) {
        const result = await chrome.runtime.sendMessage({type: 'BG_CHARACTER_IMAGE', styleId: snapshot.styleId});
        if (!result?.ok) throw new Error(result?.error || '画像を取得できませんでした');
        source = result.image;
        images.set(key, source);
        while (images.size > IMAGE_CACHE_LIMIT) images.delete(images.keys().next().value);
      }
      if (requestKey !== imageKey || stopped || !panelEnabled) return;
      if (source) { image.src = source; image.hidden = false; fallback.hidden = true; }
    } catch {
      // Retry on the next speaker change rather than flooding an offline engine.
    }
  }
  image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; });
  function render(snapshot) {
    if (!panelEnabled) return;
    state = snapshot;
    host.title = state.outputWarning || '';
    $('.portrait').title = state.outputWarning || '上下ドラッグで移動';
    if (state.active) manualOpen = false;
    const available = Boolean(state.active || state.pending > 0);
    toggle.disabled = skip.disabled = stop.disabled = !available;
    toggle.textContent = state.paused ? '▶️' : '⏸️';
    toggle.title = state.paused ? '再開' : '一時停止';
    toggle.setAttribute('aria-label', toggle.title);
    const duration = Math.max(0, state.duration || 0), elapsed = Math.max(0, state.elapsed || 0);
    $('progress').value = duration ? Math.min(1, elapsed / duration) : 0;
    const remaining = Math.ceil(Math.max(0, duration - elapsed));
    $('time').textContent = duration ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '--:--';
    if (state.speaker && displayedSpeaker && state.speaker !== displayedSpeaker && drawer.classList.contains('open')) {
      drawer.classList.remove('open');
      clearTimeout(switchTimer);
      displayedSpeaker = state.speaker;
      const next = {...state};
      switchTimer = setTimeout(() => { switchTimer = null; portrait(next); visibility(); }, 290);
    } else if (!switchTimer) {
      if (state.speaker) { displayedSpeaker = state.speaker; portrait(state); }
      visibility();
    }
  }
  async function poll() {
    if (stopped || !panelEnabled || polling) return;
    clearTimeout(pollTimer);
    polling = true;
    try {
      chrome.runtime.getManifest();
      const result = await chrome.runtime.sendMessage({type: 'BG_PANEL_STATUS'});
      if (result?.ok) render(result);
    } catch {
      try { chrome.runtime.getManifest(); } catch { stopped = true; clearTimeout(pollTimer); clearTimeout(switchTimer); host.remove(); }
    } finally {
      polling = false;
      if (!stopped && panelEnabled) {
        const busy = !state.paused && (state.active || state.pending > 0);
        pollTimer = setTimeout(poll, busy ? 250 : 2000);
      }
    }
  }
  async function command(type) {
    try {
      const result = await chrome.runtime.sendMessage({type: `BG_${type}`});
      if (!result?.ok) throw new Error(result?.error || '再生操作に失敗しました');
      host.title = '';
      await poll();
    } catch (error) { host.title = error.message; }
  }
  toggle.addEventListener('click', () => command(state.paused ? 'RESUME' : 'PAUSE'));
  skip.addEventListener('click', () => command('SKIP'));
  stop.addEventListener('click', () => command('CANCEL'));

  function setPanelEnabled(enabled) {
    panelEnabled = enabled;
    host.style.display = enabled ? 'block' : 'none';
    clearTimeout(pollTimer);
    if (!enabled) {
      imageKey = '';
      clearTimeout(switchTimer);
      switchTimer = null;
      drawer.classList.remove('open');
    } else {
      visibility();
      poll();
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.characterPanelEnabled) setPanelEnabled(changes.characterPanelEnabled.newValue !== false);
  });
  chrome.storage.local.get(['characterPanel', 'characterPanelEnabled']).then(saved => {
    if (Number.isFinite(saved.characterPanel?.top)) top = saved.characterPanel.top;
    collapsed = Boolean(saved.characterPanel?.collapsed);
    setPanelEnabled(saved.characterPanelEnabled !== false);
  }).catch(() => { setPanelEnabled(true); });
})();
