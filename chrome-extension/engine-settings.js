const engineInput = document.querySelector('#voicevox-url');
const engineSave = document.querySelector('#save-engine');
const engineStatus = document.querySelector('#engine-settings-status');
const defaultEngine = 'http://127.0.0.1:50021';
function normalizeEngineUrl(value) {
  const url = new URL(value.trim() || defaultEngine);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('認証情報・クエリ・フラグメントを含まない http または https のURLを指定してください。');
  }
  return url.href.replace(/\/+$/, '');
}
chrome.storage.local.get('voicevoxUrl').then(saved => {
  engineInput.value = saved.voicevoxUrl || defaultEngine;
  engineInput.disabled = false;
  engineSave.disabled = false;
}).catch(error => { engineStatus.textContent = `設定を取得できませんでした：${error.message}`; });
document.querySelector('#reset-engine').addEventListener('click', () => {
  engineInput.value = defaultEngine;
  engineStatus.textContent = 'ローカルを選択しました。「接続先を保存・接続確認」で保存してください。';
});
engineSave.addEventListener('click', async () => {
  let saved = false;
  try {
    const endpoint = normalizeEngineUrl(engineInput.value);
    // Request access directly from the click, before awaiting storage or network.
    const granted = await chrome.permissions.request({origins: [`${new URL(endpoint).origin}/*`]});
    if (!granted) throw new Error('接続先へのアクセスが許可されませんでした。');
    engineSave.disabled = true;
    stopVoicePreview();
    await chrome.storage.local.set({voicevoxUrl: endpoint});
    saved = true;
    engineInput.value = endpoint;
    engineStatus.textContent = '保存しました。接続を確認中…';
    const response = await fetch(`${endpoint}/version`, {signal: AbortSignal.timeout(5000), cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const version = await response.json();
    if (typeof version !== 'string' || !version) throw new Error('VOICEVOXの応答ではありません。');
    engineStatus.textContent = `保存しました。VOICEVOX ${version} に接続しました。次のセリフから反映されます。`;
    const roster = await fetch(`${endpoint}/speakers`, {signal: AbortSignal.timeout(5000), cache: 'no-store'});
    if (!roster.ok) throw new Error(`メンバー一覧 HTTP ${roster.status}`);
    const catalog = voiceRegistry.fromSpeakers(await roster.json());
    if (!catalog.length) throw new Error('読み上げ用のメンバーがありません。');
    await chrome.storage.local.set({speakerCatalog: catalog});
  } catch (error) {
    engineStatus.textContent = `${saved ? '接続先は保存済みですが、接続確認またはメンバー一覧の取得に失敗しました' : '保存できませんでした'}：${error.message}`;
  } finally { engineSave.disabled = engineInput.disabled; }
});
document.querySelector('#copy-instructions').addEventListener('click', async () => {
  const field = document.querySelector('#custom-instructions');
  const status = document.querySelector('#instructions-status');
  try {
    await navigator.clipboard.writeText(field.value);
    status.textContent = 'プロンプトをコピーしました。';
  } catch {
    field.focus(); field.select();
    status.textContent = '自動コピーできませんでした。選択中の文章を Ctrl+C（Macは⌘C）でコピーしてください。';
  }
});
