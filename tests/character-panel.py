"""Check the floating controls in real Chrome without a VOICEVOX server."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
mock = r'''
let panelStorageChanged;
let shadow, tick, snapshot = {active:false,pending:0};
const sent = [], saved = {};
const attach = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(options) { return shadow = attach.call(this, options); };
const realTimeout = window.setTimeout.bind(window);
let pollDelay;
window.setTimeout = (fn, ms, ...args) => {
 if (fn.name === 'poll') { tick = fn; pollDelay = ms; return 99999; }
 return realTimeout(fn, ms, ...args);
};
window.chrome = {storage:{onChanged:{addListener(fn) {panelStorageChanged = fn;}},local:{async get() {return {characterPanel:{top:160,collapsed:false}};},async set(value) {Object.assign(saved,value);}}},runtime:{
getManifest() {return {};},async sendMessage(message) {
  sent.push(message);
  if (message.type === 'BG_PANEL_STATUS') return {ok:true,...snapshot};
  if (message.type === 'BG_CHARACTER_IMAGE') return {ok:true,image:''};
  if (message.type === 'BG_PAUSE') snapshot.paused = true;
  if (message.type === 'BG_RESUME') snapshot.paused = false;
  if (message.type === 'BG_CANCEL') snapshot = {active:false,pending:0};
  return {ok:true};
}}};
'''
test = r'''
(async () => {
 const delay = () => new Promise(resolve => setTimeout(resolve,0));
 const check = (value,message) => {if (!value) throw new Error(message);};
 const $ = selector => shadow.querySelector(selector);
 try {
  await delay(); await delay();
  check(!$('.drawer').classList.contains('open'),'initially hidden');
  check(pollDelay === 2000, 'idle poll interval');
  check(document.querySelector('#voicevox-character-panel').style.top === '160px','restore position');
  snapshot = {active:true,pending:1,speaker:'ずんだもん',styleId:3,duration:100,elapsed:25};
  await tick();
  check($('.drawer').classList.contains('open'),'automatic entrance');
  check(pollDelay === 250, 'active poll interval');
  panelStorageChanged({characterPanelEnabled:{newValue:false}}, 'local');
  check(document.querySelector('#voicevox-character-panel').style.display === 'none', 'OFF hides panel and handle');
  const offCount = sent.length;
  await tick();
  check(sent.length === offCount, 'OFF stops status requests');
  panelStorageChanged({characterPanelEnabled:{newValue:true}}, 'local');
  await delay();
  check(document.querySelector('#voicevox-character-panel').style.display === 'block' && $('.drawer').classList.contains('open'), 'ON restores active panel');
  const beforeStyle = sent.filter(m => m.type === 'BG_CHARACTER_IMAGE').length;
  snapshot.styleId = 1; await tick();
  check(sent.filter(m => m.type === 'BG_CHARACTER_IMAGE').length === beforeStyle, 'styles share speaker image');
  check($('time').textContent === '1:15' && $('progress').value === .25,'remaining time/progress');
  $('.toggle').click(); await delay(); await delay();
  check($('.toggle').textContent === '▶️','pause switches to play');
  check(pollDelay === 2000, 'paused poll interval');
  $('.toggle').click(); await delay(); await delay();
  check($('.toggle').textContent === '⏸️','resume switches to pause');
  $('.skip').click(); await delay();
  check(sent.some(m => m.type === 'BG_SKIP'),'skip routed');
  $('.handle').click();
  check(!$('.drawer').classList.contains('open') && saved.characterPanel.collapsed,'collapse saved');
  await tick(); check(!$('.drawer').classList.contains('open'),'does not reopen during speech');
  $('.handle').click();
  const portrait = $('.portrait');
  portrait.setPointerCapture = () => {};
  portrait.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientY:170,button:0}));
  portrait.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientY:210}));
  portrait.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientY:210}));
  check(saved.characterPanel.top === 200,'drag saved');
  snapshot = {active:true,speaker:'四国めたん',styleId:2,duration:10,elapsed:1};
  await tick();
  check(!$('.drawer').classList.contains('open'),'speaker exits');
  await new Promise(resolve => setTimeout(resolve,310));
  check($('.drawer').classList.contains('open') && $('img').alt === '四国めたん','next speaker entrance');
  $('.stop').click(); await delay(); await delay();
  check(!$('.drawer').classList.contains('open'),'automatic exit after stop');
  snapshot = {active:false,pending:0}; await tick();
  check($('.stop').disabled,'idle controls disabled');
  check(pollDelay === 2000,'returns to idle interval');
  // Keep the drawer collapsed so speaker changes need no animation delay.
  if ($('.drawer').classList.contains('open')) $('.handle').click();
  for (let i = 0; i < 25; i++) {
    snapshot = {active:true,speaker:'cache-speaker-'+i,styleId:100+i};
    await tick(); await delay();
    if ($('.drawer').classList.contains('open')) $('.handle').click();
  }
  const beforeRevisit = sent.filter(m => m.type === 'BG_CHARACTER_IMAGE').length;
  snapshot = {active:true,speaker:'cache-speaker-23',styleId:123}; await tick(); await delay();
  check(sent.filter(m => m.type === 'BG_CHARACTER_IMAGE').length === beforeRevisit,'recent speaker retained');
  snapshot = {active:true,speaker:'cache-speaker-0',styleId:100}; await tick(); await delay();
  check(sent.filter(m => m.type === 'BG_CHARACTER_IMAGE').length === beforeRevisit + 1,'old speaker evicted at cache limit');
  document.querySelector('pre').textContent = 'PASS: character panel controls, slide, drag, adaptive polling, speaker image sharing and bounded cache';
 } catch(error) {document.querySelector('pre').textContent = 'FAIL: '+error.stack;}
})();
'''
with tempfile.TemporaryDirectory(prefix='voicevox-panel-') as directory:
    folder = Path(directory)
    html = folder / 'index.html'
    html.write_text('<!doctype html><meta charset="utf-8"><pre>PENDING</pre><script>' + mock + (root / 'chrome-extension/character-panel.js').read_text() + test + '</script>')
    result = subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--user-data-dir='+str(folder/'profile'),'--virtual-time-budget=3000','--dump-dom',html.as_uri()],capture_output=True,text=True,timeout=30)
    if 'PASS: character panel' not in result.stdout:
        raise SystemExit(result.stdout + result.stderr)
    print('PASS: character panel controls, slide, drag, adaptive polling, speaker image sharing and bounded cache')
