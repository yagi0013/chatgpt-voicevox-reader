const castStatus = document.querySelector('#casting-status');
const castControls = document.querySelector('#casting-controls');
let castTabId = Number(new URLSearchParams(location.search).get('tabId')) || null;
let castData;
let castBusy = false;
let pendingCastRender = false;
castControls.addEventListener('focusout', () => {
  setTimeout(() => { if (pendingCastRender) renderCast(); }, 0);
});
async function castRequest(message = {}) {
  if (!castTabId) throw new Error('ChatGPTの会話のポップアップから「設定」を開いてください。');
  const result = await chrome.tabs.sendMessage(castTabId, {type: 'VOICEVOX_CASTING', action: 'get', ...message});
  if (!result?.ok) throw new Error(result?.error || '配役を取得できませんでした。ChatGPTを再読み込みしてください。');
  castData = result;
  return result;
}
function memberSelect(value) {
  const select = document.createElement('select');
  for (const member of castData.catalog) select.add(new Option(member.name, member.name));
  if (value && !castData.catalog.some(member => member.name === value)) select.add(new Option(`${value}（現在利用不可）`, value));
  select.value = value;
  select.setAttribute('aria-label', '担当するメンバー');
  return select;
}
function filterCast() {
  const query = document.querySelector('#casting-search').value.trim().toLocaleLowerCase('ja');
  const rows = [...document.querySelectorAll('#casting-entries .member')];
  let count = 0;
  for (const row of rows) {
    row.hidden = Boolean(query && !row.dataset.search.includes(query));
    if (!row.hidden) count++;
  }
  document.querySelector('#casting-count').textContent = `${count} / ${rows.length}件`;
}
document.querySelector('#casting-search').addEventListener('input', filterCast);
function renderCast() {
  if (castControls.contains(document.activeElement) && /^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
    pendingCastRender = true;
    return;
  }
  pendingCastRender = false;
  castControls.hidden = false;
  document.querySelector('#casting-conversation').textContent = `対象の会話：${castData.url}`;
  document.querySelector('#cast-unknown').checked = castData.settings.unknown;
  document.querySelector('#cast-narration').checked = castData.settings.narration;
  const candidates = document.querySelector('#casting-candidates');
  candidates.replaceChildren();
  for (const member of castData.catalog) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox'; box.value = member.name;
    box.checked = castData.settings.candidates.includes(member.name);
    label.append(box, document.createTextNode(member.name)); candidates.append(label);
  }
  const container = document.querySelector('#casting-entries');
  container.replaceChildren();
  const entries = [...castData.state.entries];
  if (!entries.some(entry => entry.label === '@narration')) entries.unshift({label: '@narration', name: castData.catalog[0]?.name, aliases: [], manual: false});
  for (const entry of entries) {
    const row = document.createElement('div'); row.className = 'member';
    row.dataset.search = `${entry.label === '@narration' ? 'ナレーション' : entry.label} ${entry.name} ${(entry.aliases || []).join(' ')}`.toLocaleLowerCase('ja');
    const heading = document.createElement('h3');
    heading.textContent = `${entry.label === '@narration' ? 'ナレーション' : entry.label}（${entry.manual ? '手動固定' : entry.styleId === undefined ? '未抽選' : '自動配役'}）`;
    const member = memberSelect(entry.name);
    const style = document.createElement('select'); style.setAttribute('aria-label', 'スタイル');
    function styles(id) {
      style.replaceChildren();
      const selected = castData.catalog.find(item => item.name === member.value);
      for (const item of selected?.styles || []) style.add(new Option(item.name, String(item.id)));
      style.value = String(id ?? selected?.styleId);
    }
    styles(entry.styleId);
    member.addEventListener('change', () => styles());
    const aliases = document.createElement('input'); aliases.type = 'text';
    aliases.placeholder = '別名（カンマ区切り）：例 田中さん,田中先生';
    aliases.setAttribute('aria-label', '同じ登場人物として扱う別名');
    aliases.value = (entry.aliases || []).join(', ');
    const save = document.createElement('button'); save.type = 'button'; save.className = 'primary'; save.textContent = 'この配役を固定';
    save.addEventListener('click', () => castAction({action: 'assign', label: entry.label, name: member.value, styleId: Number(style.value), aliases: aliases.value.split(/[,、]/).map(value => value.trim()).filter(Boolean)}));
    const reroll = document.createElement('button'); reroll.type = 'button'; reroll.textContent = '再抽選';
    reroll.addEventListener('click', () => castAction({action: 'reroll', label: entry.label}));
    const voiceFields = document.createElement('div'); voiceFields.className = 'cast-voice-fields';
    for (const [caption, select] of [['メンバー', member], ['スタイル', style]]) {
      const label = document.createElement('label'); label.append(document.createTextNode(caption), select); voiceFields.append(label);
    }
    const preview = document.createElement('button'); preview.type = 'button'; preview.textContent = '試聴';
    preview.setAttribute('aria-pressed', 'false');
    preview.addEventListener('click', () => previewVoice(member.value, Number(style.value), preview));
    const actions = document.createElement('div'); actions.className = 'actions'; actions.append(preview, save, reroll);
    row.append(heading, voiceFields, actions);
    if (entry.label !== '@narration') {
      const details = document.createElement('details'); const summary = document.createElement('summary');
      summary.textContent = '別名を設定'; details.append(summary, aliases); row.append(details);
    }
    container.append(row);
  }
  filterCast();
}
async function castAction(message, success = '保存しました。') {
  if (castBusy) return;
  castBusy = true;
  for (const button of castControls.querySelectorAll('button')) button.disabled = true;
  try { await castRequest(message); renderCast(); castStatus.textContent = success; }
  catch (error) { castStatus.textContent = error.message; }
  finally { castBusy = false; for (const button of castControls.querySelectorAll('button')) button.disabled = false; }
}
document.querySelector('#save-casting-settings').addEventListener('click', () => castAction({action: 'settings', settings: {
  unknown: document.querySelector('#cast-unknown').checked,
  narration: document.querySelector('#cast-narration').checked,
  candidates: [...document.querySelectorAll('#casting-candidates input:checked')].map(box => box.value)
}}));
document.querySelector('#reroll-casting').addEventListener('click', () => castAction({action: 'reset'}));
document.querySelector('#refresh-casting').addEventListener('click', () => castAction({action: 'get'}, '配役を更新しました。'));
document.querySelector('#export-casting').addEventListener('click', async () => {
  try { await castRequest(); document.querySelector('#casting-json').value = JSON.stringify({version: 1, ...castData.state}, null, 2); castStatus.textContent = '配役を書き出しました。下欄をコピーして保存できます。'; }
  catch (error) { castStatus.textContent = error.message; }
});
document.querySelector('#import-casting').addEventListener('click', () => {
  try {
    const state = JSON.parse(document.querySelector('#casting-json').value);
    if (state.version !== 1 || !Array.isArray(state.entries) || state.entries.some(entry => typeof entry?.label !== 'string' || typeof entry.name !== 'string' || !Number.isInteger(entry.styleId))) throw new Error('対応した配役JSONを入力してください。');
    castAction({action: 'import', state});
  } catch (error) { castStatus.textContent = error.message; }
});
(async () => {
  try {
    if (!castTabId) {
      const tabs = await chrome.tabs.query({url: 'https://chatgpt.com/*', currentWindow: true});
      if (tabs.length === 1) castTabId = tabs[0].id;
    }
    await castRequest(); renderCast();
  } catch (error) { castStatus.textContent = error.message; }
})();
