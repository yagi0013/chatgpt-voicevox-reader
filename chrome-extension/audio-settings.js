const outputSelect = document.querySelector('#audio-output');
const grantButton = document.querySelector('#grant-audio');
const saveButton = document.querySelector('#save-output');
const audioStatus = document.querySelector('#audio-status');
let selectedOutput = '';
let loading = false;
let pendingOutputs = false;
let outputLoadVersion = 0;
async function loadOutputs() {
  const version = ++outputLoadVersion;
  const devices = await navigator.mediaDevices.enumerateDevices();
  if (version !== outputLoadVersion) return;
  // Native select menus close if their options are replaced while open.
  if (document.activeElement === outputSelect && !outputSelect.disabled) {
    pendingOutputs = true;
    return;
  }
  pendingOutputs = false;
  const wanted = outputSelect.disabled ? selectedOutput : outputSelect.value;
  const options = [new Option('システムの既定', '')];
  for (const device of devices.filter(device => device.kind === 'audiooutput' && device.deviceId && !['default', 'communications'].includes(device.deviceId))) {
    options.push(new Option(device.label || `スピーカー ${options.length}`, device.deviceId));
  }
  if (wanted && !options.some(option => option.value === wanted)) {
    options.push(new Option('以前の出力先（未接続または未許可）', wanted));
  }
  const unchanged = options.length === outputSelect.options.length && options.every((option, index) =>
    option.value === outputSelect.options[index].value && option.text === outputSelect.options[index].text);
  if (!unchanged) outputSelect.replaceChildren(...options);
  outputSelect.value = wanted;
  outputSelect.disabled = false;
  saveButton.disabled = false;
}
outputSelect.addEventListener('blur', () => {
  if (pendingOutputs) loadOutputs().catch(error => { audioStatus.textContent = `一覧を更新できませんでした（${error.name}）。`; });
});
grantButton.addEventListener('click', async () => {
  if (loading) return;
  loading = true;
  grantButton.disabled = true;
  saveButton.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    stream.getTracks().forEach(track => track.stop());
    await loadOutputs();
    audioStatus.textContent = '出力先を選んで保存してください。';
  } catch (error) {
    audioStatus.textContent = `一覧を取得できませんでした（${error.name}）。Chromeのマイク許可と接続機器を確認してください。`;
  } finally { loading = false; grantButton.disabled = false; saveButton.disabled = outputSelect.disabled; }
});
saveButton.addEventListener('click', async () => {
  saveButton.disabled = true;
  try {
    const value = outputSelect.value;
    const probe = new Audio();
    await probe.setSinkId(value);
    await chrome.storage.local.set({audioOutputId: value});
    selectedOutput = value;
    const result = await chrome.runtime.sendMessage({type: 'BG_APPLY_OUTPUT'});
    if (!result?.ok) throw new Error(result?.error || '再生中の出力先を変更できませんでした');
    audioStatus.textContent = result.warning || '保存しました。再生中の音声にも反映しました。';
  } catch (error) {
    audioStatus.textContent = `出力先の保存・反映に失敗しました（${error.name}：${error.message}）。一覧を取得して出力先を選び直してください。`;
  } finally { saveButton.disabled = false; }
});
async function initialize() {
  if (!navigator.mediaDevices?.enumerateDevices || !HTMLMediaElement.prototype.setSinkId) {
    grantButton.disabled = true;
    audioStatus.textContent = 'このブラウザーは音声出力先の選択に対応していません。';
    return;
  }
  try {
    const saved = await chrome.storage.local.get('audioOutputId');
    selectedOutput = saved.audioOutputId || '';
    if (['default', 'communications'].includes(selectedOutput)) {
      selectedOutput = '';
      await chrome.storage.local.set({audioOutputId: ''});
      audioStatus.textContent = '以前の設定はシステムの既定に追従する項目でした。特定の機器に固定する場合は、その機器本体の項目を選んで保存してください。';
    }
    await loadOutputs();
  } catch (error) { audioStatus.textContent = `設定を取得できませんでした（${error.name}）。`; }
}
initialize();
navigator.mediaDevices?.addEventListener('devicechange', () => {
  if (!loading) loadOutputs().catch(error => { audioStatus.textContent = `一覧を更新できませんでした（${error.name}）。`; });
});

const memberSearch = document.querySelector('#member-search');
const memberImages = new Map();
let memberImageObserver;
let memberRoster;
let memberImageVersion = 0;
let activeMemberImages = 0;
const memberImageQueue = [];
async function memberPortrait(member, version) {
  const {voicevoxUrl = 'http://127.0.0.1:50021'} = await chrome.storage.local.get('voicevoxUrl');
  if (version !== memberImageVersion) return '';
  if (!memberRoster) memberRoster = fetch(`${voicevoxUrl}/speakers`, {signal: AbortSignal.timeout(15000)}).then(response => {
    if (!response.ok) throw new Error('キャラクター一覧を取得できませんでした');
    return response.json();
  }).catch(error => { memberRoster = null; throw error; });
  const roster = await memberRoster;
  const speaker = roster.find(item => item.styles.some(style => style.id === member.styleId));
  if (!speaker) return '';
  const response = await fetch(`${voicevoxUrl}/speaker_info?speaker_uuid=${encodeURIComponent(speaker.speaker_uuid)}`, {signal: AbortSignal.timeout(60000)});
  if (!response.ok) throw new Error(`画像取得 HTTP ${response.status}`);
  const info = await response.json();
  const source = info.portrait || info.style_infos?.[0]?.icon;
  return source ? `data:image/png;base64,${source}` : '';
}
function drainMemberImages() {
  while (activeMemberImages < 1 && memberImageQueue.length) {
    const {member, image, fallback, version} = memberImageQueue.shift();
    if (!image.isConnected || version !== memberImageVersion) continue;
    activeMemberImages++;
    let source = memberImages.get(member.name);
    if (source) memberImages.delete(member.name);
    else source = memberPortrait(member, version);
    memberImages.set(member.name, source);
    while (memberImages.size > 24) memberImages.delete(memberImages.keys().next().value);
    source.then(value => {
      if (!value || !image.isConnected || version !== memberImageVersion) return;
      image.src = value; image.hidden = false; fallback.hidden = true;
    }).catch(error => {
      if (image.isConnected && version === memberImageVersion) fallback.title = `画像を取得できませんでした：${error.message}`;
      if (memberImages.get(member.name) === source) memberImages.delete(member.name);
    }).finally(() => { activeMemberImages--; drainMemberImages(); });
  }
}

function renderMembers() {
  const query = memberSearch.value.trim().toLocaleLowerCase('ja');
  const members = voiceRegistry.catalog.filter(member =>
    `${member.name} ${member.styles.map(style => style.name).join(' ')}`.toLocaleLowerCase('ja').includes(query));
  const container = document.querySelector('#members');
  memberImageObserver?.disconnect();
  memberImageQueue.length = 0;
  container.replaceChildren();
  memberImageObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      memberImageObserver.unobserve(entry.target);
      memberImageQueue.push(entry.target.portraitRequest);
    }
    drainMemberImages();
  }, {root: container, rootMargin: '100px'});
  for (const member of members) {
    const row = document.createElement('div');
    row.className = 'member';
    const name = document.createElement('strong');
    name.textContent = member.name;
    const styles = document.createElement('p');
    styles.textContent = member.styles.map(style => style.name).join(' ／ ');
    const styleSelect = document.createElement('select');
    styleSelect.setAttribute('aria-label', `${member.name}の試聴スタイル`);
    for (const style of member.styles) styleSelect.add(new Option(style.name, String(style.id)));
    styleSelect.value = String(member.styleId);
    const preview = document.createElement('button'); preview.type = 'button'; preview.textContent = '試聴';
    preview.setAttribute('aria-label', `${member.name}の試聴を再生・停止`);
    preview.setAttribute('aria-pressed', 'false');
    preview.addEventListener('click', () => previewVoice(member.name, Number(styleSelect.value), preview));
    const actions = document.createElement('div'); actions.className = 'actions'; actions.append(styleSelect, preview);
    const portrait = document.createElement('div'); portrait.className = 'member-portrait';
    const image = document.createElement('img'); image.alt = member.name; image.hidden = true;
    const fallback = document.createElement('span'); fallback.textContent = '🎭'; fallback.setAttribute('aria-hidden', 'true');
    image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; });
    portrait.append(image, fallback);
    const details = document.createElement('div'); details.className = 'member-details'; details.append(name, styles, actions);
    row.append(portrait, details);
    portrait.portraitRequest = {member, image, fallback, version: memberImageVersion};
    container.append(row);
    memberImageObserver.observe(portrait);
  }
  if (!members.length) container.textContent = '一致するキャラクター・スタイルはありません。';
}
memberSearch.addEventListener('input', renderMembers);
async function loadMembers() {
  try {
    const saved = await chrome.storage.local.get('speakerCatalog');
    voiceRegistry.setCatalog(saved.speakerCatalog);
    document.querySelector('#catalog-status').textContent = `${voiceRegistry.catalog.length}人。保存済みの一覧を表示しています。VOICEVOX起動中に会話のポップアップを開くと一覧が更新されます。`;
  } catch {
    document.querySelector('#catalog-status').textContent = '標準のキャラクター一覧を表示しています。';
  }
  renderMembers();
}
loadMembers();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.speakerCatalog || changes.voicevoxUrl) {
    memberImageVersion++;
    memberImages.clear(); memberRoster = null;
    loadMembers();
  }
});
