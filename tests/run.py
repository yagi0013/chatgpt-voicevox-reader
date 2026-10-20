"""Run deterministic JS checks with Ubuntu's gjs; no browser or VOICEVOX required."""
import json
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
extension = root / 'chrome-extension'

def run(source):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js') as file:
        file.write((extension / 'speakers.js').read_text() + '\n' + source)
        file.flush()
        subprocess.run(['gjs', file.name], check=True)

for path in extension.glob('*.js'):
    run('new Function(' + json.dumps(path.read_text()) + ');')
print('PASS: all JavaScript syntax', flush=True)
run((extension / 'speech-tools.js').read_text() + '\n' + (root / 'tests/speech-tools.test.js').read_text())
json.loads((extension / 'manifest.json').read_text())
run((extension / 'parser.js').read_text() + '\n' + (extension / 'auto-core.js').read_text() + '\n' + (root / 'tests/core.test.js').read_text())
run((extension / 'casting.js').read_text() + '\n' + (root / 'tests/casting.test.js').read_text())
player_mock = r'''
const GLib = imports.gi.GLib;
let failure = false;
function setTimeout(callback, ms) { return GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1, ms), () => { callback(); return GLib.SOURCE_REMOVE; }); }
class DOMException extends Error { constructor(message, name) { super(message); this.name = name; } }
class AbortController { constructor() { this.signal = {aborted: false, throwIfAborted() { if (this.aborted) throw new DOMException('stopped', 'AbortError'); }}; } abort() { this.signal.aborted = true; } }
const AbortSignal = {any(signals) { return signals[0]; }, timeout() { return {}; }};
class URL { static createObjectURL() { return 'blob:test'; } static revokeObjectURL() {} }
class URLSearchParams { constructor(params) { this.params = params; } toString() { return Object.entries(this.params).map(([k,v]) => k+'='+encodeURIComponent(v)).join('&'); } }
let listener;
let audioOutputId = '';
let failSink = false;
const sinks = [];
let deviceChange;
const navigator = {mediaDevices: {addEventListener(name, callback) { if (name === 'devicechange') deviceChange = callback; }}};
const chrome = {runtime: {async sendMessage(message) { if (message.type !== 'BG_AUDIO_OUTPUT') throw new Error('unexpected player request'); return {ok: true, audioOutputId}; }, onMessage: {addListener(fn) { listener = fn; }}}};
let played = 0;
let holdAudio = false;
let failFetch = false;
const requests = [];
const synthesisQueries = [];
async function fetch(url, options) { requests.push(url); if (url.includes('/synthesis?')) synthesisQueries.push(JSON.parse(options.body)); if (failFetch) throw new Error('connection refused'); return {ok: true, async json() { return {speedScale: 1, pitchScale: 0.15}; }, async blob() { return {}; }}; }
class Audio { async setSinkId(id) { sinks.push(id); if (failSink && id) throw new Error('missing device'); } async play() { played++; if (!holdAudio) setTimeout(() => this.onended(), 0); } pause() {} removeAttribute() {} load() {} }
'''
run((extension / 'speech-tools.js').read_text() + '\n' + player_mock + '\n' + (extension / 'player.js').read_text() + '\n' + (root / 'tests/player.test.js').read_text())

content_mock = r'''
const GLib = imports.gi.GLib;
let failure = false;
let uniqueId = 0;
let fakeNow = 100000;
Date.now = () => fakeNow;
let savedEnabled = true;
let engineInfo = {online: true, version: 'test'};
let storageChange;
const crypto = {randomUUID() { return 'id-' + (++uniqueId); }};
const location = {href: 'https://chatgpt.com/', pathname: '/'};
class URL { constructor(value) { this.pathname = value.replace('https://chatgpt.com', ''); } }
const events = {};
const intervals = [];
const editor = {innerText: ''};
const main = {text: 'ずんだもん「以前の会話」', get innerText() { return this.text; }, cloneNode() { return {textContent: this.text, querySelectorAll() { return []; }}; }, querySelectorAll() { return []; }};
const document = {
  documentElement: {},
  querySelector(selector) { if (selector === 'main') return main; if (selector.includes('#prompt-textarea')) return editor; return null; },
  querySelectorAll() { return []; },
  addEventListener(name, fn) { events[name] = fn; },
  createTextNode(text) { return {textContent: text}; }
};
let observerCallback;
let observerDisconnected = false;
class MutationObserver { constructor(fn) { observerCallback = fn; } observe() {} disconnect() { observerDisconnected = true; } }
function setInterval(fn, ms) { intervals.push({fn, ms}); }
function setTimeout() {}
function clearTimeout() {}
const clearedIntervals = [];
function clearInterval(id) { clearedIntervals.push(id); }
let pageListener;
const sent = [];
const commands = [];
const contentData = {castingSettings: {unknown: false, narration: false}};
const chrome = {storage: {local: {async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, contentData[key]])); }, async set(values) { Object.assign(contentData, values); }}, onChanged: {addListener(fn) { storageChange = fn; }}}, runtime: {
  async sendMessage(message) { commands.push(message); if (message.type === 'BG_QUEUE') sent.push(message); if (message.type === 'BG_CONFIG' && message.persist) savedEnabled = message.enabled; return {ok: true, enabled: message.type === 'BG_INIT' ? savedEnabled : message.enabled, engine: engineInfo}; },
  getManifest() { return {version: 'test'}; },
  onMessage: {addListener(fn) { pageListener = fn; }}
}};
'''
run(content_mock + '\n' + (extension / 'parser.js').read_text() + '\n' + (extension / 'auto-core.js').read_text() + '\n' + (extension / 'casting.js').read_text() + '\n' + (extension / 'content.js').read_text() + '\n' + (root / 'tests/content.test.js').read_text())

background_mock = r'''
const GLib = imports.gi.GLib;
let failure = false;
let fakeNow = 100000;
Date.now = () => fakeNow;
let engineRunning = false;
let healthRequests = 0;
let created = 0;
let contextExists = false;
let lastBadge = '';
const localData = {autoEnabled: true};
const sessionData = {};
const playerMessages = [];
const AbortSignal = {timeout() { return {}; }};
function importScripts() {}
async function fetch(url) {
  if (url.endsWith('/version')) healthRequests++;
  if (!engineRunning) throw new Error('connection refused');
  return {ok: true, async json() {
    if (url.endsWith('/speakers')) return [...voiceRegistry.catalog.map(item => ({name: item.name, styles: item.styles.map(style => ({...style, type: 'talk'}))})), {name: '新メンバー', styles: [{name: '歌', id: 999, type: 'sing'}, {name: 'ノーマル', id: 777, type: 'talk'}]}];
    return '0.25.2';
  }};
}
function storage(data) { return {async get(key) { return {[key]: data[key]}; }, async set(values) { Object.assign(data, values); }, async remove(key) { delete data[key]; }}; }
const chrome = {
  runtime: {
    getURL(path) { return 'chrome-extension://test/' + path; },
    async getContexts() { return contextExists ? [{}] : []; },
    async sendMessage(message) { playerMessages.push(message); return {ok: true, status: '待機中', pending: 0}; },
    onMessage: {addListener() {}}
  },
  offscreen: {async createDocument() { created++; contextExists = true; }},
  storage: {local: storage(localData), session: storage(sessionData)},
  action: {async setBadgeText({text}) { lastBadge = text; }, async setBadgeBackgroundColor() {}},
  tabs: {onRemoved: {addListener() {}}}
};
'''
run((extension / 'speech-tools.js').read_text() + '\n' + background_mock + '\n' + (extension / 'background.js').read_text() + '\n' + (root / 'tests/background.test.js').read_text())
