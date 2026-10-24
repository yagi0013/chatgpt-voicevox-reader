(() => {
  if (globalThis.__chatgptVoicevoxReader) return;
  globalThis.__chatgptVoicevoxReader = true;
  const READER_BUILD = '0.7.6';
  let contextStopped = false;
  let extensionVersion = '';
  let observer = null;
  let timer;
  const backgroundTimers = [];
  function extensionAvailable() {
    if (contextStopped) return false;
    try {
      extensionVersion = chrome.runtime.getManifest().version;
      return true;
    } catch {
      // Reloading/disabling the extension leaves this script in the old page.
      contextStopped = true;
      observer?.disconnect();
      clearTimeout(timer);
      for (const id of backgroundTimers) clearInterval(id);
      return false;
    }
  }
  let casting = new VoiceCasting();
  let draftKey = `casting:draft:${crypto.randomUUID()}`;
  let castingKey = '';
  let savedCasting = '';
  let savingCasting = Promise.resolve();
  let loadingCasting;
  const ownCastingWrites = new Set();
  function conversationKey() {
    const match = /\/c\/([^/?#]+)/.exec(location.href);
    return match ? `casting:conversation:${match[1]}` : draftKey;
  }
  function loadCasting() {
    if (!extensionAvailable()) return Promise.resolve();
    if (!loadingCasting) loadingCasting = loadCastingState().finally(() => { loadingCasting = null; });
    return loadingCasting;
  }
  async function loadCastingState() {
    if (castingKey.startsWith('casting:conversation:') && !/\/c\/[^/?#]+/.test(location.href)) draftKey = `casting:draft:${crypto.randomUUID()}`;
    const key = conversationKey();
    if (key === castingKey) return;
    await savingCasting;
    const saved = await chrome.storage.local.get(['castingSettings', key]);
    const draft = castingKey === draftKey && key !== draftKey ? casting.snapshot() : null;
    if (draft) {
      const oldDictionary = castingKey.replace('casting:', 'pronunciation:');
      const newDictionary = key.replace('casting:', 'pronunciation:');
      const dictionaries = await chrome.storage.local.get([oldDictionary, newDictionary]);
      if (dictionaries[newDictionary] === undefined && dictionaries[oldDictionary] !== undefined) await chrome.storage.local.set({[newDictionary]: dictionaries[oldDictionary]});
    }
    casting.configure(saved.castingSettings, saved[key] || draft || {});
    castingKey = key;
    savedCasting = JSON.stringify(saved[key] || {});
    await persistCasting();
  }
  function persistCasting() {
    if (!extensionAvailable()) return Promise.resolve();
    const state = casting.snapshot();
    const serialized = JSON.stringify(state);
    if (!castingKey || serialized === savedCasting) return savingCasting;
    const key = castingKey;
    savedCasting = serialized;
    ownCastingWrites.add(`${key}\n${serialized}`);
    if (ownCastingWrites.size > 100) ownCastingWrites.delete(ownCastingWrites.values().next().value);
    savingCasting = savingCasting.catch(() => {}).then(() => chrome.storage.local.set({[key]: state})).catch(error => {
      savedCasting = ''; autoError = `配役を保存できませんでした：${error.message}`;
      throw error;
    });
    return savingCasting;
  }
  function castItems(text, narration = true) {
    if (!castingKey || conversationKey() !== castingKey) return speechOnly(text);
    const items = casting.parse(text, {narration: narration && casting.settings.narration});
    persistCasting().catch(() => {});
    return items.map(item => ({...item, castingContext: castingKey}));
  }

  function findMessages() {
    const strategies = [
      ['selection-message-id', 'main [data-chatgpt-selection-message-id]'],
      ['dil-message-id', 'main [data-dil-message-id]'],
      ['author-role', '[data-message-author-role="assistant"]'],
      ['turn-role', '[data-turn="assistant"]'],
      ['assistant-test-id', '[data-testid="assistant-message"]'],
      ['turn-markdown', 'main [data-testid^="conversation-turn-"] .markdown, main article .markdown']
    ];
    for (const [method, selector] of strategies) {
      const nodes = [...document.querySelectorAll(selector)].filter(node => {
        // Never interpret an explicitly marked user turn as an answer.
        return !node.closest('[data-message-author-role="user"], [data-turn="user"], [data-user-message-bubble], [class~="group/user-message"]');
      });
      if (nodes.length) return {nodes, method};
    }
    // The assistant toolbar survives some UI versions that omit message attributes.
    const mainScope = document.querySelector('main');
    const isReadButton = node => /^(読み上げ|Read aloud|音声で読み上げ)/i.test(
      [node.getAttribute('aria-label'), node.getAttribute('title'), node.innerText].filter(Boolean).join(' ').trim());
    const readButtons = [...(mainScope?.querySelectorAll('button') || [])].filter(isReadButton);
    const candidates = [];
    for (const button of readButtons) {
      for (let parent = button.parentElement; parent && parent !== mainScope; parent = parent.parentElement) {
        if (parent.querySelector('[data-message-author-role="user"], [data-turn="user"], textarea, [contenteditable="true"]')) break;
        const text = parent.innerText || '';
        if (speechOnly(text).length) {
          const contained = [...parent.querySelectorAll('button')].filter(isReadButton);
          if (contained.length === 1) candidates.push(parent);
          break;
        }
      }
    }
    if (candidates.length) return {nodes: candidates, method: '読み上げボタンの会話ブロック（推定）', inferred: true};
    // Compatibility fallback: expose the rendered conversation for inspection.
    // This is intentionally marked as mixed content, not an assistant message.
    const main = document.querySelector('main');
    if (main?.innerText?.trim()) return {nodes: [main], method: '会話領域全体（暫定取得）', mixed: true};
    return {nodes: [], method: '未検出', mixed: false};
  }
  let autoEnabled = false;
  let autoToken = crypto.randomUUID();
  let autoError = '';
  let engine = {online: null, version: ''};
  let pollingEngine = false;
  function updateCatalog(catalog) {
    if (!catalog || JSON.stringify(catalog) === JSON.stringify(voiceRegistry.catalog)) return;
    if (!voiceRegistry.setCatalog(catalog)) return;
    const armed = tracker.armed;
    tracker.seed(autoItems());
    seedMessages();
    tracker.armed = armed;
    dirty = true;
  }
  function updateEngine(next) {
    if (!next) return;
    // Advance the baseline before resuming; offline speech is never replayed.
    if (engine.online !== true || next.online !== true) { tracker.update(autoItems()); seedMessages(); }
    engine = next;
  }
  let autoUrl = location.href;
  let dirty = true;
  let submittingAt = 0;
  let lastEditorText = '';
  let enqueuedSpeeches = 0;
  let lastTrigger = '';
  let previousGenerating = false;
  function isGenerating() {
    if (document.querySelector('[data-testid="stop-button"], [data-testid="stop-completion-button"]')) return true;
    return [...document.querySelectorAll('button[aria-label], button[title]')].some(button =>
      /^(?:stop generating|stop streaming|生成を停止|回答の生成を停止|応答の生成を停止)/i.test(
        button.getAttribute('aria-label') || button.getAttribute('title') || ''));
  }
  let sending = Promise.resolve();
  const tracker = new SpeechTracker();
  const messageTracker = new MessageSpeechTracker();
  const messageIds = new WeakMap();
  function extractItems(node) {
    if (!node) return [];
    const clone = node.cloneNode(true);
    clone.querySelectorAll('[data-message-author-role="user"], [data-turn="user"], [data-user-message-bubble], [class~="group/user-message"], script, style, template, pre, code, blockquote, table, nav, aside, button, textarea, input, [contenteditable="true"], [role="textbox"], [hidden], [aria-hidden="true"]').forEach(node => node.remove());
    clone.querySelectorAll('p, div, section, article, li, h1, h2, h3, h4, br').forEach(node => {
      node.before(document.createTextNode('\n'));
      node.after(document.createTextNode('\n'));
    });
    return castItems(clone.textContent || '', node !== document.querySelector('main'));
  }
  function autoItems() { return extractItems(document.querySelector('main')); }
  function messageSource() {
    for (const attribute of ['data-chatgpt-selection-message-id', 'data-dil-message-id']) {
      const nodes = [...document.querySelectorAll(`main [${attribute}]`)].filter(node =>
        !node.closest('[data-message-author-role="user"], [data-turn="user"], [data-user-message-bubble], [class~="group/user-message"]'));
      const unique = new Map();
      for (const node of nodes) {
        const id = node.getAttribute(attribute);
        if (!id) continue;
        const body = node.querySelector('[data-markdown-text-style], .markdown, .prose') || node;
        unique.set(id, {id, node, items: extractItems(body)});
      }
      const messages = [...unique.values()];
      if (!messages.length) continue;
      const latest = messages.at(-1);
      const user = [...document.querySelectorAll('main [data-user-message-bubble], main [data-message-author-role="user"], main [data-turn="user"], main [class~="group/user-message"]')].at(-1);
      const afterUser = !user || Boolean(user.compareDocumentPosition(latest.node) & 4);
      return {messages, latest, afterUser, method: attribute};
    }
    const found = findMessages();
    if (!found.mixed && !found.inferred && found.nodes.length) {
      const messages = found.nodes.map(node => {
        let id = node.getAttribute('data-message-id') || node.closest('[data-testid^="conversation-turn-"]')?.getAttribute('data-testid') || messageIds.get(node);
        if (!id) { id = crypto.randomUUID(); messageIds.set(node, id); }
        return {id, node, items: extractItems(node.querySelector('[data-markdown-text-style], .markdown, .prose') || node)};
      });
      const latest = messages.at(-1);
      const user = [...document.querySelectorAll('main [data-message-author-role="user"], main [data-turn="user"], main [data-user-message-bubble]')].at(-1);
      return {messages, latest, afterUser: !user || Boolean(user.compareDocumentPosition(latest.node) & 4), method: found.method};
    }
    return null;
  }
  function seedMessages(reset = false) {
    if (reset) messageTracker.clear();
    const source = messageSource();
    if (source) messageTracker.seed(source.messages);
  }
  async function configure(enabled, persist = false) {
    if (!extensionAvailable()) throw new Error('ChatGPTを再読み込みしてください。');
    await loadCasting();
    autoEnabled = Boolean(enabled);
    autoToken = crypto.randomUUID();
    tracker.seed(autoItems());
    seedMessages(true);
    previousGenerating = isGenerating();
    autoUrl = location.href;
    autoError = '';
    const result = await chrome.runtime.sendMessage({type: 'BG_CONFIG', enabled: autoEnabled, token: autoToken, persist});
    if (!result?.ok) {
      autoEnabled = false;
      throw new Error(result?.error || '設定できませんでした。');
    }
    updateCatalog(result.catalog);
    updateEngine(result.engine);
    return {enabled: autoEnabled};
  }
  async function initialize() {
    await loadCasting();
    const result = await chrome.runtime.sendMessage({type: 'BG_INIT', token: autoToken});
    if (!result?.ok) throw new Error(result?.error || '保存設定を取得できませんでした。');
    autoEnabled = result.enabled;
    previousGenerating = isGenerating();
    tracker.seed(autoItems());
    seedMessages(true);
    updateCatalog(result.catalog);
    updateEngine(result.engine);
  }
  let ready = initialize().catch(error => { autoError = error.message; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!extensionAvailable() || area !== 'local') return;
    ready = ready.then(async () => {
      if ((changes.castingSettings && JSON.stringify(changes.castingSettings.newValue) !== JSON.stringify(casting.settings)) || (changes[castingKey] && JSON.stringify(changes[castingKey].newValue) !== savedCasting && !ownCastingWrites.has(`${castingKey}\n${JSON.stringify(changes[castingKey].newValue)}`))) {
        const saved = await chrome.storage.local.get(['castingSettings', castingKey]);
        casting.configure(saved.castingSettings, saved[castingKey]);
        savedCasting = JSON.stringify(casting.snapshot());
        const armed = tracker.armed;
        tracker.seed(autoItems()); seedMessages(true); tracker.armed = armed; dirty = true;
      }
      if (changes.speakerCatalog) updateCatalog(changes.speakerCatalog.newValue);
      if (changes.autoEnabled) {
        const enabled = Boolean(changes.autoEnabled.newValue);
        if (enabled !== autoEnabled) return configure(enabled);
      }
    }).catch(error => { autoError = error.message; });
  });
  async function pollEngine() {
    if (!extensionAvailable() || pollingEngine) return;
    pollingEngine = true;
    try {
      const result = await chrome.runtime.sendMessage({type: 'BG_HEALTH'});
      if (result?.ok) { updateCatalog(result.catalog); updateEngine(result.engine); }
    } catch (error) { autoError = error.message; }
    finally { pollingEngine = false; }
  }
  backgroundTimers.push(setInterval(pollEngine, 3000));
  function findEditor(event) {
    const selector = '#prompt-textarea, [contenteditable="true"], textarea, [role="textbox"]';
    const target = event?.target?.closest?.(selector);
    if (target) return target;
    const focused = document.activeElement?.closest?.(selector);
    if (focused) return focused;
    return document.querySelector('#prompt-textarea') ||
      [...document.querySelectorAll(selector)].filter(node => node.getClientRects().length).at(-1);
  }
  function editorText(editor) { return editor?.value || editor?.innerText || ''; }
  document.addEventListener('input', event => {
    if (!extensionAvailable()) return;
    const editor = event.target.closest?.('#prompt-textarea, [contenteditable="true"], textarea, [role="textbox"]');
    if (editor) lastEditorText = editorText(editor);
  }, true);
  async function submitted(event) {
    if (!extensionAvailable() || !autoEnabled || Date.now() - submittingAt < 200) return;
    const editor = findEditor(event);
    const text = editorText(editor) || lastEditorText;
    if (!text.trim()) return;
    if (location.href !== autoUrl) {
      // A submission immediately after switching chats belongs to the new URL.
      try { await configure(true); } catch (error) { autoError = error.message; return; }
    }
    submittingAt = Date.now();
    lastTrigger = '送信操作';
    tracker.seed(autoItems());
    seedMessages();
    tracker.user(text, castItems(text, false));
    lastEditorText = '';
    dirty = true;
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing &&
        event.target.closest?.('#prompt-textarea, [contenteditable="true"], textarea, [role="textbox"]')) submitted(event);
  }, true);
  document.addEventListener('submit', submitted, true);
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button || button.disabled) return;
    const label = [button.getAttribute('data-testid'), button.getAttribute('aria-label'), button.getAttribute('title')].filter(Boolean).join(' ');
    if (/send-button|composer-submit-button|(?:^|\s)send(?:\s|$)|send message|send prompt|メッセージを送信|プロンプトを送信|送信する|送信/i.test(label)) submitted(event);
  }, true);
  async function scanAuto() {
    if (!extensionAvailable() || !autoEnabled) return;
    await ready;
    if (!extensionAvailable()) return;
    await loadCasting();
    if (location.href !== autoUrl) {
      // A new conversation is a new baseline; never carry old speech over.
      const isFirstConversation = !/^\/c\//.test(new URL(autoUrl).pathname) && /^\/c\//.test(location.pathname);
      if (isFirstConversation && tracker.armed && Date.now() - submittingAt < 15000) {
        // Sending on a new-chat page creates /c/<id>; it is still the same response.
        autoUrl = location.href;
      } else {
        await configure(true);
        return;
      }
    }
    const generating = isGenerating();
    if (generating && !previousGenerating && !tracker.armed) {
      tracker.user(lastEditorText, castItems(lastEditorText, false));
      lastEditorText = '';
      submittingAt = Date.now();
      lastTrigger = '応答生成の開始';
    }
    previousGenerating = generating;
    if (casting.settings.narration && generating) return;
    if (!dirty) return;
    dirty = false;
    const source = messageSource();
    const items = source
      ? messageTracker.update(source.latest, tracker.armed && source.afterUser)
      : tracker.update(autoItems());
    if (!items.length || engine.online !== true) return;
    const token = autoToken;
    const batchId = crypto.randomUUID();
    sending = sending.catch(() => {}).then(async () => {
      if (!extensionAvailable() || !autoEnabled || token !== autoToken) return;
      const result = await chrome.runtime.sendMessage({type: 'BG_QUEUE', items, token, batchId});
      updateEngine(result?.engine);
      if (result?.ok && !result.skipped) {
        enqueuedSpeeches += result.accepted ?? items.length;
        autoError = '';
      }
      if (!result?.ok) autoError = result?.error || '音声を送信できませんでした。';
    }).catch(error => { autoError = error.message; });
  }
  backgroundTimers.push(setInterval(() => { scanAuto().catch(error => { autoError = error.message; }); }, 500));
  let snapshot;
  let revision = 0;
  let lastText = '';
  let lastUrl = '';
  let changedAt = null;

  function read() {
    if (!extensionAvailable()) return snapshot;
    const {nodes: messages, method, mixed = false, inferred = false} = findMessages();
    const latest = messages.at(-1);
    // Prefer the rendered answer body to avoid copying surrounding controls.
    const body = mixed ? latest : (latest?.querySelector('[data-markdown-text-style], .markdown, .prose') || latest);
    const text = body?.innerText?.trim() || '';
    if (text !== lastText || location.href !== lastUrl) {
      changedAt = new Date().toISOString();
      lastText = text;
      lastUrl = location.href;
      revision++;
    }
    const stop = document.querySelector('[data-testid="stop-button"], [data-testid="stop-completion-button"]');
    const transcript = document.querySelector('main [data-chatgpt-conversation-selection-target], main [data-thread-find-target]') || document.querySelector('main');
    const source = messageSource();
    snapshot = {
      readerVersion: READER_BUILD,
      text, count: mixed ? 0 : messages.length, revision, changedAt, method, mixed, inferred,
      auto: {enabled: autoEnabled, armed: tracker.armed, error: autoError},
      engine, catalog: voiceRegistry.catalog,
      speeches: body ? extractItems(body) : [], casting: casting.snapshot(), castingSettings: casting.settings,
      diagnostics: {
        extensionVersion, readerVersion: READER_BUILD,
        autoEnabled, armed: tracker.armed, engineOnline: engine.online,
        eligibleSpeeches: source ? source.latest.items.length : autoItems().length,
        trackedSpeeches: source ? (messageTracker.consumed.get(source.latest.id) || 0) : tracker.previous.length,
        trackingMode: source?.method || 'conversation-prefix-fallback',
        activeMessageId: source?.latest.id || null,
        afterLatestUserMessage: source?.afterUser ?? null,
        enqueuedSpeeches, lastTrigger, lastSubmissionAt: submittingAt ? new Date(submittingAt).toISOString() : null,
        autoError,
        main: document.querySelectorAll('main').length,
        mainTextLength: document.querySelector('main')?.innerText?.length || 0,
        rawMainSpeeches: speechOnly(document.querySelector('main')?.innerText || '').length,
        structure: [...(transcript?.querySelectorAll('*') || [])].slice(0, 100).map(node => ({
          tag: node.tagName.toLowerCase(),
          class: typeof node.className === 'string' ? node.className.slice(0, 180) : '',
          role: node.getAttribute('role'),
          testid: node.getAttribute('data-testid'),
          dataKeys: Object.keys(node.dataset)
        })),
        articles: document.querySelectorAll('article').length,
        turns: document.querySelectorAll('[data-testid^="conversation-turn-"]').length,
        markdown: document.querySelectorAll('.markdown').length,
        roles: [...new Set([...document.querySelectorAll('[data-message-author-role]')].map(node => node.getAttribute('data-message-author-role')))]
      },
      generating: Boolean(stop),
      url: location.href,
      capturedAt: new Date().toISOString()
    };
    return snapshot;
  }

  observer = new MutationObserver(() => {
    if (!extensionAvailable()) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(read, 200);
  });
  observer.observe(document.documentElement, {childList: true, subtree: true, characterData: true});
  read();
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!extensionAvailable()) return;
    if (message.type === 'VOICEVOX_RECAST') {
      ready = ready.then(async () => {
        await loadCasting();
        const endpoint = (await chrome.storage.local.get('voicevoxUrl')).voicevoxUrl || 'http://127.0.0.1:50021';
        const entry = casting.find(message.item?.castingLabel || '');
        if (!message.item?.automatic || !entry || entry.manual || message.item.castingContext !== castingKey || message.endpoint !== endpoint) return {ok: false};
        const unavailable = message.unavailable || [];
        if (entry.name === message.item.name || unavailable.includes(entry.name)) casting.reroll(entry.label, unavailable);
        const header = entry.label + (message.item.requestedStyle ? `[${message.item.requestedStyle}]` : '');
        const resolved = casting.resolve(entry.label === '@narration' ? '' : header, entry.label === '@narration');
        await persistCasting();
        return {ok: Boolean(resolved.speaker), speaker: resolved.speaker};
      });
      ready.then(sendResponse, error => sendResponse({ok: false, error: error.message}));
      ready = ready.catch(() => {});
      return true;
    }
    if (message.type === 'VOICEVOX_READ_RESPONSE') {
      ready.then(loadCasting).then(() => sendResponse(read()), error => sendResponse({error: error.message}));
      return true;
    }
    if (message.type === 'VOICEVOX_DICTIONARY_CONTEXT') {
      ready.then(loadCasting).then(() => sendResponse({ok: true, dictionaryKey: castingKey.replace('casting:', 'pronunciation:')}), error => sendResponse({ok: false, error: error.message}));
      return true;
    }
    if (message.type === 'VOICEVOX_CASTING') {
      ready = ready.then(async () => {
        await loadCasting();
        const {action, label} = message;
        if (action === 'assign') casting.assign(label, message.name, message.styleId, message.aliases || []);
        else if (action === 'reroll') casting.reroll(label);
        else if (action === 'reset') casting.reset();
        else if (action === 'import') {
          const imported = new VoiceCasting(casting.settings, message.state);
          for (const entry of imported.entries.values()) {
            const member = voiceRegistry.resolve(entry.name);
            if (!member?.styles.some(style => style.id === entry.styleId)) throw new Error(`使えない声が含まれています：${entry.name}`);
          }
          casting = imported;
        } else if (action === 'settings') {
          casting.configure(message.settings, casting.snapshot());
          await chrome.storage.local.set({castingSettings: casting.settings});
        } else if (action !== 'get') throw new Error('未対応の配役操作です。');
        await persistCasting();
        // Changing casting never replays already visible history.
        if (action !== 'get') {
          const armed = tracker.armed;
          tracker.seed(autoItems()); seedMessages(true); tracker.armed = armed;
          dirty = true;
        }
        return {ok: true, state: casting.snapshot(), settings: casting.settings, catalog: voiceRegistry.catalog, dictionaryKey: castingKey.replace('casting:', 'pronunciation:'), url: location.href};
      });
      ready.then(sendResponse, error => sendResponse({ok: false, error: error.message}));
      ready = ready.catch(() => {});
      return true;
    }
    if (message.type === 'VOICEVOX_SET_AUTO') {
      ready = ready.then(() => configure(message.enabled, true));
      ready.then(result => sendResponse({ok: true, ...result}), error => sendResponse({ok: false, error: error.message}));
      // Keep the next toggle usable after a failed request.
      ready = ready.catch(() => {});
      return true;
    }
  });
})();
