"""Exercise the actual content script in isolated, headless Chrome with a real DOM."""
from pathlib import Path
import subprocess
import tempfile
from html.parser import HTMLParser

root = Path(__file__).resolve().parents[1]

class Result(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.value = ''
    def handle_starttag(self, tag, attrs):
        if tag == 'pre' and dict(attrs).get('id') == 'test-result':
            self.active = True
    def handle_endtag(self, tag):
        if tag == 'pre':
            self.active = False
    def handle_data(self, data):
        if self.active:
            self.value += data

mock = '''
const realTimeout = window.setTimeout.bind(window);
const intervals = [];
window.setInterval = (fn, ms) => { intervals.push({fn, ms}); return intervals.length; };
let listener;
const sent = [];
const contentData = {};
window.chrome = {storage: {local: {async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, contentData[key]])); }, async set(values) { Object.assign(contentData, values); }}, onChanged: {addListener() {}}}, runtime: {
  getManifest() { return {version: 'browser-test'}; },
  async sendMessage(message) {
    if (message.type === 'BG_QUEUE') sent.push(message);
    return {ok: true, enabled: message.type === 'BG_INIT' ? true : message.enabled, engine: {online: true, version: 'test'}};
  },
  onMessage: {addListener(fn) { listener = fn; }}
}};
'''
test = '''
(async () => {
  const delay = () => new Promise(resolve => realTimeout(resolve, 0));
  const scan = async () => { await delay(); intervals.find(item => item.ms === 500).fn(); await delay(); };
  try {
    await delay();
    const editor = document.querySelector('#alternative-composer');
    editor.innerText = 'こんにちは';
    editor.dispatchEvent(new Event('input', {bubbles: true}));
    if (['keyboard', 'message-id', 'virtualized'].includes(MODE)) {
      editor.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    } else if (MODE === 'click') {
      // Simulate a framework clearing the editor before a click handler runs.
      editor.innerText = '';
      document.querySelector('#send').dispatchEvent(new MouseEvent('click', {bubbles: true}));
    }
    if (MODE === 'generation') {
      editor.innerText = '';
      const stop = document.createElement('button');
      stop.setAttribute('aria-label', 'Stop streaming');
      document.body.append(stop);
    }
    let reply = document.createElement('p');
    reply.innerHTML = '<strong>🟢ずんだもん[あまあま]</strong>「生成中';
    let root = reply;
    if (['message-id', 'virtualized'].includes(MODE)) {
      const user = document.createElement('div');
      user.setAttribute('data-user-message-bubble', '');
      user.setAttribute('data-chatgpt-selection-message-id', 'user-example');
      user.textContent = 'ずんだもん「これはユーザーの例文」';
      document.querySelector('#conversation').append(user);
      root = document.createElement('div');
      root.setAttribute('data-chatgpt-selection-message-id', 'new-response');
      const body = document.createElement('div');
      body.setAttribute('data-markdown-text-style', 'standard');
      body.append(reply); root.append(body);
    }
    document.querySelector('#conversation').append(root);
    await scan();
    if (sent.length) throw new Error('incomplete dialogue was queued');
    if (MODE === 'virtualized') {
      document.querySelector('#old-turn').remove();
      const history = document.createElement('div');
      history.setAttribute('data-chatgpt-selection-message-id', 'older-history');
      history.innerHTML = '<p>きりたん「追加読み込みされた以前の発言」</p>';
      document.querySelector('#conversation').prepend(history);
    }
    reply.append('なのだ。」');
    await scan();
    if (sent.length !== 1 || sent[0].items[0].styleId !== 1 || sent[0].items[0].text !== '生成中なのだ。') {
      throw new Error('automatic speech not queued: ' + JSON.stringify(await new Promise(resolve => listener({type: 'VOICEVOX_READ_RESPONSE'}, {}, resolve))));
    }
    await scan();
    if (sent.length !== 1) throw new Error('duplicate playback');
    let expected = 1;
    if (['message-id', 'virtualized'].includes(MODE)) {
      const rerender = root.cloneNode(true);
      root.replaceWith(rerender); root = rerender; reply = root.querySelector('p');
      await scan();
      if (sent.length !== 1) throw new Error('rerender replayed active speech');
      root.remove(); await scan();
      if (sent.length !== 1) throw new Error('old message read while current message unmounted');
      document.querySelector('#conversation').append(root); await scan();
      if (sent.length !== 1) throw new Error('remount replayed speech');
      root.querySelector('[data-markdown-text-style]').insertAdjacentHTML('beforeend', '<p>めたん[ツンツン]「次のセリフ」</p>');
      await scan(); expected = 2;
      if (sent.length !== 2 || sent[1].items[0].styleId !== 6) throw new Error('new speech after virtualization lost');
    }
    await new Promise(resolve => listener({type: 'VOICEVOX_SET_AUTO', enabled: false}, {}, resolve));
    reply.insertAdjacentHTML('afterend', '<p>めたん[ツンツン]「停止中」</p>');
    await scan();
    if (sent.length !== expected) throw new Error('OFF queued speech');
    document.querySelector('#test-result').textContent = 'PASS: real Chrome DOM, composer outside main, ' + MODE + ', styled speech, streaming, form wrapper and OFF';
  } catch (error) { document.querySelector('#test-result').textContent = 'FAIL: ' + error.message; }
})();
'''
for mode in ('keyboard', 'click', 'generation', 'message-id', 'virtualized'):
    with tempfile.TemporaryDirectory(prefix='voicevox-browser-') as directory:
        folder = Path(directory)
        scripts = mock + '\n' + '\n'.join((root / 'chrome-extension' / file).read_text() for file in ('speakers.js','parser.js','auto-core.js','casting.js','content.js'))
        scripts += '\nconst MODE = ' + repr(mode) + ';\n' + test
        page = folder / 'test.html'
        markup = '<!doctype html><meta charset="utf-8"><main><form><div id="conversation"><div id="old-turn"><div data-user-message-bubble>以前の質問</div><div data-chatgpt-selection-message-id="old-response"><p>めたん「過去の発言」</p></div></div></div></form></main><div id="alternative-composer" contenteditable="true" role="textbox"></div><button id="send" aria-label="メッセージを送信">送信</button><pre id="test-result">PENDING</pre><script>' + scripts.replace('</script', '<\\/script') + '</script>'
        if mode not in ('message-id', 'virtualized'):
            markup = markup.replace('data-chatgpt-selection-message-id="old-response"', '')
        page.write_text(markup)
        result = subprocess.run(['google-chrome', '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + str(folder / 'profile'), '--virtual-time-budget=3000', '--dump-dom', page.as_uri()], capture_output=True, text=True, timeout=30)
        parser = Result()
        parser.feed(result.stdout)
        if result.returncode or not parser.value.startswith('PASS:'):
            raise SystemExit(parser.value + '\n' + result.stderr[-2000:])
        print(parser.value, flush=True)

popup_mock = '''
const realTimeout = window.setTimeout.bind(window);
const intervals = [];
window.setInterval = (fn, ms) => { intervals.push({fn, ms}); return intervals.length; };
const copied = [];
Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {async writeText(value) { copied.push(value); }}});
const fixture = {
  readerVersion: '0.7.3',
  text: 'あなたの発言：\\nちょいてすとなー\\nChatGPT の発言：\\n🟢ずんだもん「了解なのだ！」\\n🔴めたん[あまあま]「こちらも音声テストですわ。」\\n🟣きりたん「通常発言です。」\\n🟡つむぎ[ハイテンション]「元気いっぱいでいくよー！」\\n🟢ずんだもん「最後までちゃんと喋れるかな？」',
  auto: {enabled: true, armed: true}, engine: {online: true, version: 'test'},
  url: 'https://chatgpt.com/c/test', method: 'fixture', capturedAt: new Date().toISOString(),
  diagnostics: {eligibleSpeeches: 5, enqueuedSpeeches: 0, autoError: ''}
};
let registeredBuild = '0.7.3';
let workerBuild = '0.7.3';
const playbackFixture = {active: true, paused: false, pending: 2, status: '再生中'};
const playbackCommands = [];
let blockNext = false;
let release;
const panelSaved = {};
window.chrome = {
  storage: {local: {async get() {return panelSaved;}, async set(values) {Object.assign(panelSaved, values);}}},
  tabs: {async query() { return [{id: 7, url: 'https://chatgpt.com/c/test'}]; },
    async sendMessage() { if (blockNext) { blockNext = false; await new Promise(resolve => { release = resolve; }); } return structuredClone(fixture); }},
  runtime: {getManifest() { return {version: registeredBuild}; }, async sendMessage(message) {
    if (['BG_PAUSE', 'BG_RESUME', 'BG_SKIP', 'BG_CANCEL'].includes(message.type)) {
      playbackCommands.push(message.type);
      if (message.type === 'BG_PAUSE') { playbackFixture.paused = true; playbackFixture.status = '一時停止中'; }
      if (message.type === 'BG_RESUME') { playbackFixture.paused = false; playbackFixture.status = '再生中'; }
      if (message.type === 'BG_SKIP') playbackFixture.pending--;
      if (message.type === 'BG_CANCEL') { playbackFixture.active = false; playbackFixture.paused = false; playbackFixture.pending = 0; playbackFixture.status = '停止しました'; }
    }
    return {ok: true, workerVersion: workerBuild, engine: fixture.engine, ...playbackFixture};
  }}
};
'''
popup_test = '''
(async () => {
  const delay = () => new Promise(resolve => realTimeout(resolve, 0));
  const tick = intervals.find(item => item.ms === 1000).fn;
  const result = document.createElement('pre'); result.id = 'test-result'; document.body.append(result);
  try {
    await delay();
    const panelToggle = document.querySelector('#panel-toggle');
    if (!panelToggle.checked || panelToggle.disabled) throw new Error('panel defaults to ON');
    panelToggle.click(); await delay();
    if (panelSaved.characterPanelEnabled !== false) throw new Error('panel OFF saved');
    panelToggle.click(); await delay();
    if (panelSaved.characterPanelEnabled !== true) throw new Error('panel ON saved');
    const playbackPause = document.querySelector('#pause-playback');
    const playbackSkip = document.querySelector('#skip-playback');
    const playbackCancel = document.querySelector('#cancel-playback');
    if (playbackPause.disabled || playbackPause.textContent !== '一時停止' || playbackSkip.disabled || playbackCancel.disabled || playbackPause.closest('details')) throw new Error('main playback controls availability');
    playbackPause.click(); await delay();
    if (playbackPause.disabled || playbackPause.textContent !== '再開' || !document.querySelector('#play-status').textContent.includes('一時停止中')) throw new Error('pause controls and status');
    tick(); await delay();
    if (playbackPause.disabled || playbackPause.textContent !== '再開') throw new Error('paused state must survive refresh');
    playbackPause.click(); await delay();
    if (playbackPause.disabled || playbackPause.textContent !== '一時停止') throw new Error('resume controls');
    playbackSkip.click(); await delay();
    if (playbackFixture.pending !== 1) throw new Error('skip command');
    playbackCancel.click(); await delay();
    if (!playbackPause.disabled || playbackPause.textContent !== '一時停止' || !playbackSkip.disabled || !playbackCancel.disabled || !fixture.auto.enabled) throw new Error('cancel controls must preserve automatic setting');
    if (document.querySelector('#resume-playback') || document.querySelectorAll('.playback-controls button').length !== 3) throw new Error('pause and resume must share one button');
    const commandsAfterCancel = playbackCommands.length;
    playbackPause.click(); playbackSkip.click(); playbackCancel.click(); await delay();
    if (playbackCommands.length !== commandsAfterCancel) throw new Error('idle controls must not send commands');
    if (playbackCommands.join(',') !== 'BG_PAUSE,BG_RESUME,BG_SKIP,BG_CANCEL') throw new Error('playback button routing');
    const area = document.querySelector('#diagnostics');
    if (document.querySelector('#dialogue-details').open) throw new Error('dialogue should start collapsed');
    if (document.querySelector('#dialogue-count').textContent !== '5件') throw new Error('speech count missing');
    const replay = document.querySelector('#replay-latest');
    if (replay.closest('details') || replay.disabled) throw new Error('replay must be available at top while auto ON');
    if (!document.querySelector('#copy').closest('details')) throw new Error('body actions should be folded');
    if (document.querySelectorAll('#dialogue input').length !== 5) throw new Error('user sample must parse as five speeches');
    if (!document.querySelector('#warnings').textContent.includes('ハイテンション')) throw new Error('fallback warning');
    for (let parent = area.parentElement; parent; parent = parent.parentElement) { if (parent.tagName === 'DETAILS') parent.open = true; }
    const initial = area.value;
    area.focus(); area.setSelectionRange(0, 12);
    fixture.diagnostics.enqueuedSpeeches = 99;
    tick(); await delay();
    if (area.value !== initial || area.selectionEnd !== 12) throw new Error('selection overwritten by refresh');
    area.blur(); area.setSelectionRange(0, 0);
    const pause = document.querySelector('#pause-updates'); pause.checked = true;
    tick(); await delay();
    if (area.value !== initial) throw new Error('explicit pause ignored');
    pause.checked = false; pause.dispatchEvent(new Event('change')); await delay();
    if (!area.value.includes('99')) throw new Error('updates did not resume');
    document.querySelector('#copy-diagnostics').click(); await delay();
    if (copied.length !== 1 || !copied[0].includes('"enqueuedSpeeches": 99')) throw new Error('diagnostic snapshot copy');
    const snapshot = area.value;
    blockNext = true; tick(); await delay();
    area.focus(); area.setSelectionRange(0, 15);
    fixture.diagnostics.enqueuedSpeeches = 123;
    release(); await delay();
    if (area.value !== snapshot || area.selectionEnd !== 15) throw new Error('inflight request overwrote selection');
    fixture.readerVersion = '0.6.0';
    document.querySelector('#refresh').click(); await delay();
    if (document.querySelector('#reload-page').hidden || !document.querySelector('#status').textContent.includes('古い取得処理')) throw new Error('stale content script detection');
    fixture.readerVersion = '0.7.3'; workerBuild = '0.6.0';
    document.querySelector('#refresh').click(); await delay();
    if (document.querySelector('#reload-extension').hidden || !document.querySelector('#status').textContent.includes('古い拡張機能')) throw new Error('stale background detection');
    result.textContent = 'PASS: real Chrome popup selection, pause/resume, diagnostic copy, inflight update, stale versions and user dialogue sample';
  } catch (error) { result.textContent = 'FAIL: ' + error.message; }
})();
'''
with tempfile.TemporaryDirectory(prefix='voicevox-popup-') as directory:
    folder = Path(directory)
    page = folder / 'popup-test.html'
    html = (root / 'chrome-extension/popup.html').read_text()
    html = html.replace('  <script src="speakers.js"></script>', '<script>' + popup_mock + '</script>\n  <script src="speakers.js"></script>')
    for file in ('speakers.js', 'parser.js', 'auto-core.js', 'popup.js'):
        html = html.replace('<script src="' + file + '"></script>', '<script>' + (root / 'chrome-extension' / file).read_text().replace('</script', '<\\/script') + '</script>')
    html = html.replace('</body>', '<script>' + popup_test + '</script></body>')
    page.write_text(html)
    result = subprocess.run(['google-chrome', '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + str(folder / 'profile'), '--virtual-time-budget=3000', '--dump-dom', page.as_uri()], capture_output=True, text=True, timeout=30)
    parser = Result(); parser.feed(result.stdout)
    if result.returncode or not parser.value.startswith('PASS:'):
        raise SystemExit(parser.value + '\n' + result.stderr[-2000:])
    print(parser.value, flush=True)

story_test = r'''
(async () => {
  const delay = () => new Promise(resolve => realTimeout(resolve, 0));
  const scan = async () => { await delay(); intervals.find(item => item.ms === 500).fn(); await delay(); };
  const command = value => new Promise(resolve => listener({type: 'VOICEVOX_CASTING', ...value}, {}, resolve));
  try {
    await delay();
    await command({action: 'settings', settings: {unknown: true, narration: true, candidates: ['ずんだもん', '四国めたん', '春日部つむぎ']}});
    const editor = document.querySelector('#alternative-composer');
    editor.innerText = '冒険の続きをお願い';
    editor.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    editor.innerText = '';
    const user = document.createElement('div'); user.dataset.userMessageBubble = ''; user.textContent = 'ユーザー「これは読まない」';
    document.querySelector('#conversation').append(user);
    const reply = document.createElement('div'); reply.dataset.chatgptSelectionMessageId = 'story-response';
    reply.innerHTML = '<div class="markdown"><p>夜になった。</p><p>旅人「こんばんは」</p></div>';
    document.querySelector('#conversation').append(reply);
    const stop = document.createElement('button'); stop.dataset.testid = 'stop-button'; document.body.append(stop);
    await scan();
    if (sent.length) throw new Error('narration must wait for completed generation');
    reply.firstChild.insertAdjacentHTML('beforeend', '<p>ずんだもん「ようこそ」</p><p>遠くで鐘が鳴った。</p><pre><code>秘密「コードの例」</code></pre><blockquote>引用は読まない。</blockquote><table><tbody><tr><td>表も読まない</td></tr></tbody></table>');
    stop.remove(); await scan();
    if (sent.length !== 1 || sent[0].items.length !== 4) throw new Error('completed story must produce exactly four segments: ' + JSON.stringify(sent));
    const items = sent[0].items;
    if (!items[0].narration || items[1].label !== '旅人' || items[2].name !== 'ずんだもん' || !items[3].narration) throw new Error('story order');
    if (items[0].name === items[1].name) throw new Error('narrator and assigned character must have distinct voices');
    await scan(); if (sent.length !== 1) throw new Error('story replayed on mutation');
    const assigned = await command({action: 'assign', label: '旅人', name: '四国めたん', styleId: 6, aliases: ['旅人さん']});
    if (!assigned.ok) throw new Error(assigned.error);
    await scan(); if (sent.length !== 1) throw new Error('casting change replayed history');
    const preview = await new Promise(resolve => listener({type: 'VOICEVOX_READ_RESPONSE'}, {}, resolve));
    if (preview.speeches.length !== 4 || preview.speeches[1].styleId !== 6) throw new Error('preview must reflect manual voice and exclude code/quotes/tables');
    document.querySelector('#test-result').textContent = 'PASS: real Chrome story, generation completion, narration order, unknown speakers, distinct voices, manual change and excluded content';
  } catch (error) { document.querySelector('#test-result').textContent = 'FAIL: ' + error.message; }
})();
'''

def check_page(markup, prefix):
    with tempfile.TemporaryDirectory(prefix=prefix) as directory:
        folder = Path(directory)
        page = folder / 'test.html'
        page.write_text(markup)
        result = subprocess.run(['google-chrome', '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + str(folder / 'profile'), '--virtual-time-budget=3000', '--dump-dom', page.as_uri()], capture_output=True, text=True, timeout=30)
        parser = Result(); parser.feed(result.stdout)
        if result.returncode or not parser.value.startswith('PASS:'):
            raise SystemExit(parser.value + '\n' + result.stderr[-2000:])
        print(parser.value, flush=True)

story_mock = mock.replace('const contentData = {};', 'const contentData = {}; let storageEvent;').replace('async set(values) { Object.assign(contentData, values); }', 'async set(values) { Object.assign(contentData, values); realTimeout(() => storageEvent?.(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, {newValue}])), "local"), 0); }').replace('onChanged: {addListener() {}}', 'onChanged: {addListener(fn) { storageEvent = fn; }}')
scripts = story_mock + '\n' + '\n'.join((root / 'chrome-extension' / file).read_text() for file in ('speakers.js', 'parser.js', 'auto-core.js', 'casting.js', 'content.js')) + '\n' + story_test
check_page('<!doctype html><meta charset="utf-8"><main><div id="conversation"><div data-chatgpt-selection-message-id="old-response"><p>めたん「過去の発言」</p></div></div></main><div id="alternative-composer" contenteditable="true"></div><pre id="test-result">PENDING</pre><script>' + scripts.replace('</script', '<\\/script') + '</script>', 'voicevox-story-')

settings_mock = r'''
let lastCommand;
let castFixture = {ok: true, url: 'https://chatgpt.com/c/test', settings: {unknown: true, narration: false, candidates: []}, state: {entries: [{label: '旅人', name: 'ずんだもん', styleId: 3, manual: false, aliases: []}], used: []}, catalog: [{name: 'ずんだもん', styleId: 3, styles: [{name: 'ノーマル', id: 3}]}, {name: '四国めたん', styleId: 2, styles: [{name: 'ノーマル', id: 2}, {name: 'ツンツン', id: 6}]}]};
window.chrome = {tabs: {async query() { return [{id: 1}]; }, async sendMessage(id, message) {
  lastCommand = message;
  if (message.action === 'settings') castFixture.settings = message.settings;
  if (message.action === 'assign') castFixture.state.entries = [{label: message.label, name: message.name, styleId: message.styleId, manual: true, aliases: message.aliases}];
  if (message.action === 'import') castFixture.state = message.state;
  return structuredClone(castFixture);
}}};
'''
settings_test = r'''
(async () => {
  const delay = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    await delay();
    if (document.querySelector('#casting-controls').hidden) throw new Error('settings did not load');
    const tabs = [...document.querySelectorAll('[role=tab]')];
    if (tabs.length !== 5 || document.querySelectorAll('[role=tabpanel]:not([hidden])').length !== 1) throw new Error('settings must show exactly one of five tabs');
    document.querySelector('#casting-search').value = '旅人';
    document.querySelector('#casting-search').dispatchEvent(new Event('input'));
    if (document.querySelectorAll('#casting-entries .member:not([hidden])').length !== 1) throw new Error('casting search');
    const row = [...document.querySelectorAll('#casting-entries .member')].find(row => row.querySelector('h3').textContent.includes('旅人'));
    row.querySelector('select').value = '四国めたん'; row.querySelector('select').dispatchEvent(new Event('change'));
    row.querySelectorAll('select')[1].value = '6'; row.querySelector('input').value = '旅人さん';
    document.querySelector('#tab-output').click();
    if (document.querySelector('#panel-casting').hidden !== true || document.querySelector('#panel-output').hidden) throw new Error('tab panels must switch');
    document.querySelector('#tab-casting').click();
    if (!row.isConnected || row.querySelectorAll('select')[1].value !== '6') throw new Error('switching tabs must preserve unsaved dropdown edits');
    row.querySelector('button.primary').click(); await delay();
    if (lastCommand.action !== 'assign' || lastCommand.styleId !== 6 || lastCommand.aliases[0] !== '旅人さん') throw new Error('manual dropdown assignment');
    document.querySelector('#tab-reading').click();
    document.querySelector('#cast-narration').checked = true;
    document.querySelector('#save-casting-settings').click(); await delay();
    if (!lastCommand.settings.narration) throw new Error('narration toggle');
    document.querySelector('#tab-casting').click();
    document.querySelector('#export-casting').click(); await delay();
    const value = JSON.parse(document.querySelector('#casting-json').value);
    if (value.entries[0].styleId !== 6 || value.version !== 1) throw new Error('export');
    document.querySelector('#import-casting').click(); await delay();
    if (lastCommand.action !== 'import') throw new Error('import');
    document.querySelector('#test-result').textContent = 'PASS: real Chrome settings tabs, search, unsaved edits preserved, speaker/style dropdowns, aliases, toggles and JSON export/import';
  } catch (error) { document.querySelector('#test-result').textContent = 'FAIL: ' + error.message; }
})();
'''
html = (root / 'chrome-extension/audio-settings.html').read_text().replace('<script src="settings-tabs.js"></script>', '<script>' + (root / 'chrome-extension/settings-tabs.js').read_text() + '</script>')
html = html.replace('<script src="audio-settings.js"></script>', '')
html = html.replace('<script src="casting-settings.js"></script>', '<script>' + settings_mock + '\n' + (root / 'chrome-extension/casting-settings.js').read_text() + '\n' + settings_test + '</script>')
html = html.replace('<script src="speakers.js"></script>', '').replace('</body>', '<pre id="test-result">PENDING</pre></body>')
check_page(html, 'voicevox-cast-settings-')

output_mock = r'''
let devices = [{kind: 'audiooutput', deviceId: 'default', label: '既定 - Test Headphones'}, {kind: 'audiooutput', deviceId: 'communications', label: '通信 - Test Headphones'}, {kind: 'audiooutput', deviceId: 'speaker-a', label: 'Speaker A'}];
let deviceChange;
Object.defineProperty(navigator, 'mediaDevices', {configurable: true, value: {
  async enumerateDevices() { return devices; },
  addEventListener(name, fn) { if (name === 'devicechange') deviceChange = fn; }
}});
HTMLMediaElement.prototype.setSinkId = async function () {};
const outputSaved = {}, outputSent = [];
window.chrome = {runtime: {async sendMessage(message) { outputSent.push(message); return {ok:true}; }}, storage: {local: {async get() { return {}; }, async set(value) { Object.assign(outputSaved, value); }}, onChanged: {addListener() {}}}};
'''
output_test = r'''
(async () => {
  const delay = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    await delay();
    document.querySelector('#tab-output').click();
    const select = document.querySelector('#audio-output');
    if ([...select.options].some(option => ['default', 'communications'].includes(option.value))) throw new Error('system aliases must not appear as physical outputs');
    const original = select.options[1];
    await loadOutputs();
    if (select.options[1] !== original) throw new Error('unchanged device list rebuilt options');
    select.value = 'speaker-a'; select.focus();
    devices = [...devices, {kind: 'audiooutput', deviceId: 'speaker-b', label: 'Speaker B'}];
    deviceChange(); await delay();
    if (document.activeElement !== select || select.options[1] !== original || select.options.length !== 2) throw new Error('device notification replaced options during selection');
    select.blur(); await delay();
    if (select.options.length !== 3 || select.value !== 'speaker-a') throw new Error('deferred device update lost selection');
    document.querySelector('#save-output').click(); await delay(); await delay();
    if (outputSaved.audioOutputId !== 'speaker-a' || outputSent.at(-1)?.type !== 'BG_APPLY_OUTPUT' || !document.querySelector('#audio-status').textContent.includes('反映しました')) throw new Error('save must persist and apply live output');
    document.querySelector('#test-result').textContent = 'PASS: output dropdown preserves options during focus, skips unchanged lists and applies device changes after blur';
  } catch (error) { document.querySelector('#test-result').textContent = 'FAIL: ' + error.message; }
})();
'''
html = (root / 'chrome-extension/audio-settings.html').read_text().replace('<script src="settings-tabs.js"></script>', '<script>' + (root / 'chrome-extension/settings-tabs.js').read_text() + '</script>').replace('<script src="casting-settings.js"></script>', '')
html = html.replace('<script src="speakers.js"></script>', '<script>' + (root / 'chrome-extension/speakers.js').read_text() + '</script>')
html = html.replace('<script src="audio-settings.js"></script>', '<script>' + output_mock + '\n' + (root / 'chrome-extension/audio-settings.js').read_text() + '\n' + output_test + '</script>')
html = html.replace('</body>', '<pre id="test-result">PENDING</pre></body>')
check_page(html, 'voicevox-output-select-')

speech_mock = settings_mock + r'''
const speechSaved = {pronunciationCommon: '春雨=はるさめ'};
chrome.storage = {local: {async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, speechSaved[key]])); }, async set(values) { Object.assign(speechSaved, values); }}};
const originalSend = chrome.tabs.sendMessage;
chrome.tabs.sendMessage = async (id, message) => message.type === 'VOICEVOX_DICTIONARY_CONTEXT' ? {ok: true, dictionaryKey: 'pronunciation:conversation:test'} : originalSend(id, message);
const previewCalls = [];
let previewPlays = 0;
let previewPauses = 0;
window.fetch = async (url, options) => {
 if (url.endsWith('/speakers')) return {ok:true, async json() {return voiceRegistry.catalog.map(member => ({speaker_uuid:member.name, styles:member.styles}));}};
 if (url.includes('/speaker_info?')) return {ok:true, async json() {return {portrait:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='};}};
 previewCalls.push(url); return {ok: true, async json() { return {speedScale: 1}; }, async blob() { return new Blob(['test']); }}; };
window.Audio = class { async setSinkId(id) {} async play() { previewPlays++; } pause() { previewPauses++; } removeAttribute() {} load() {} };
'''
speech_test = r'''
(async () => {
  const delay = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    for (let i = 0; i < 5; i++) await delay();
    const row = [...document.querySelectorAll('#casting-entries .member')].find(row => row.querySelector('h3').textContent.includes('旅人'));
    row.querySelector('select').value = '四国めたん'; row.querySelector('select').dispatchEvent(new Event('change'));
    row.querySelectorAll('select')[1].value = '6';
    row.querySelector('button').click();
    for (let i = 0; i < 5; i++) await delay();
    if (previewPlays !== 1 || !previewCalls[0].includes('speaker=6') || !previewCalls[1].includes('speaker=6')) throw new Error('preview must use selected unsaved style');
    if (castFixture.state.entries[0].manual) throw new Error('preview must not save casting');
    row.querySelector('button').click();
    if (previewPauses !== 1 || previewActive) throw new Error('preview stop cleanup');
    if (document.querySelector('#dictionary-common').value !== '春雨=はるさめ') throw new Error('dictionary load');
    document.querySelector('#dictionary-local').value = '春雨=しゅんう';
    document.querySelector('#save-dictionary').click(); await delay();
    if (speechSaved['pronunciation:conversation:test'] !== '春雨=しゅんう') throw new Error('dictionary save isolation');
    document.querySelector('#dictionary-local').value = '不正な行';
    document.querySelector('#save-dictionary').click(); await delay();
    if (speechSaved['pronunciation:conversation:test'] !== '春雨=しゅんう' || !document.querySelector('#speech-settings-status').textContent.includes('1行目')) throw new Error('invalid dictionary must preserve saved values');
    document.querySelector('#emotion-enabled').checked = false;
    document.querySelector('#save-emotion').click(); await delay();
    if (speechSaved.emotionEnabled !== false) throw new Error('emotion setting save');
    document.querySelector('#test-result').textContent = 'PASS: real Chrome voice preview, selected style, stop cleanup, dictionary load/save/validation and emotion toggle';
  } catch (error) { document.querySelector('#test-result').textContent = 'FAIL: ' + error.message; }
})();
'''
html = (root / 'chrome-extension/audio-settings.html').read_text()
for file in ('settings-tabs.js', 'speakers.js', 'speech-tools.js', 'casting-settings.js', 'speech-settings.js'):
    source = (root / 'chrome-extension' / file).read_text()
    if file == 'casting-settings.js':
        source = speech_mock + '\n' + source
    html = html.replace('<script src="' + file + '"></script>', '<script>' + source.replace('</script', '<\\/script') + '</script>')
html = html.replace('<script src="audio-settings.js"></script>', '').replace('</body>', '<pre id="test-result">PENDING</pre><script>' + speech_test + '</script></body>')
check_page(html, 'voicevox-speech-settings-')

invalidation_test = r'''
(async () => {
  const errors = [];
  window.addEventListener('error', event => errors.push(event.message));
  window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
  try {
    await new Promise(resolve => realTimeout(resolve, 0));
    const commandsBefore = sent.length;
    chrome.runtime.getManifest = () => { throw new Error('Extension context invalidated.'); };
    document.querySelector('main').append(document.createTextNode('更新後の変更'));
    await new Promise(resolve => realTimeout(resolve, 250));
    for (const interval of intervals) interval.fn();
    document.querySelector('main').append(document.createTextNode('再変更'));
    await new Promise(resolve => realTimeout(resolve, 250));
    if (errors.length || sent.length !== commandsBefore) throw new Error('stale script error: ' + errors.join(', '));
    document.querySelector('#test-result').textContent = 'PASS: real Chrome invalidated extension context, DOM mutations and scheduled polling produce no uncaught errors';
  } catch (error) { document.querySelector('#test-result').textContent = 'FAIL: ' + error.message; }
})();
'''
scripts = mock.replace('return intervals.length;', 'return 10000 + intervals.length;') + '\n' + '\n'.join((root / 'chrome-extension' / file).read_text() for file in ('speakers.js', 'parser.js', 'auto-core.js', 'casting.js', 'content.js')) + '\n' + invalidation_test
check_page('<!doctype html><meta charset="utf-8"><main><p>ずんだもん「確認」</p></main><pre id="test-result">PENDING</pre><script>' + scripts.replace('</script', '<\\/script') + '</script>', 'voicevox-invalidation-')

member_test = r'''
(async () => {
  const delay = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    for (let i = 0; i < 5; i++) await delay();
    document.querySelector('#tab-members').click();
    for (const observer of memberObservers) observer.callback(observer.targets.map(target => ({target, isIntersecting:true})));
    await new Promise(resolve => setTimeout(resolve,100));
    const rows = [...document.querySelectorAll('#members .member')];
    if (!rows.length || rows.some(row => !row.querySelector('select') || row.querySelectorAll('button').length !== 1)) throw new Error('every member must have style/preview/stop');
    if (rows.some(row => !row.querySelector('.member-portrait img') || !row.querySelector('.member-details select'))) throw new Error('portrait and details columns');
    const visiblePortrait = rows.find(row => !row.querySelector('img').hidden);
    if (!visiblePortrait) throw new Error('visible member portrait must load');
    const portraitBox = visiblePortrait.querySelector('.member-portrait').getBoundingClientRect();
    const detailsBox = visiblePortrait.querySelector('.member-details').getBoundingClientRect();
    if (detailsBox.left < portraitBox.right || Math.abs(detailsBox.top - portraitBox.top) > 1) throw new Error('portrait must be left of aligned details');
    const row = rows.find(row => row.querySelector('strong').textContent === '四国めたん');
    row.querySelector('select').value = '6';
    row.querySelector('button').click();
    for (let i = 0; i < 5; i++) await delay();
    if (previewPlays !== 1 || !previewCalls[0].includes('speaker=6') || !previewCalls[1].includes('speaker=6')) throw new Error('member preview selected style');
    row.querySelector('button').click();
    if (previewActive || previewPauses !== 1) throw new Error('member preview stop');
    document.querySelector('#member-search').value = '四国めたん';
    document.querySelector('#member-search').dispatchEvent(new Event('input'));
    if (document.querySelectorAll('#members .member').length !== 1 || !document.querySelector('#members button')) throw new Error('search preserves preview controls');
    document.querySelector('#test-result').textContent = 'PASS: real Chrome member list preview controls, style selection, playback, stop and search';
  } catch (error) { document.querySelector('#test-result').textContent = 'FAIL: ' + error.message; }
})();
'''
html = (root / 'chrome-extension/audio-settings.html').read_text()
member_observer_mock = r'''
const memberObservers = [];
window.IntersectionObserver = class {
 constructor(callback) {this.callback = callback; this.targets = []; memberObservers.push(this);}
 observe(target) {this.targets.push(target);}
 unobserve() {}
 disconnect() {this.targets = [];}
};
'''
html = html.replace('</head>', '<script>' + speech_mock + member_observer_mock + '\nchrome.storage.onChanged = {addListener() {}};</script></head>')
html = html.replace('<link rel="stylesheet" href="popup.css">', '<style>' + (root / 'chrome-extension/popup.css').read_text() + '</style>')
for file in ('settings-tabs.js', 'speakers.js', 'audio-settings.js', 'speech-tools.js', 'casting-settings.js', 'speech-settings.js'):
    html = html.replace('<script src="' + file + '"></script>', '<script>' + (root / 'chrome-extension' / file).read_text().replace('</script', '<\\/script') + '</script>')
html = html.replace('</body>', '<pre id="test-result">PENDING</pre><script>' + member_test + '</script></body>')
check_page(html, 'voicevox-member-preview-')
