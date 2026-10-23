const checkVoices = document.querySelector('#check-voices');
const cancelVoiceCheck = document.querySelector('#cancel-voice-check');
const voiceCheckStatus = document.querySelector('#voice-check-status');
const voiceCheckResults = document.querySelector('#voice-check-results');
let voiceCheckController;
function showVoiceCheck(report) {
  if (!report?.results) {
    voiceCheckStatus.textContent = 'この接続先では未チェックです。';
    voiceCheckResults.textContent = '';
    return;
  }
  const results = Object.values(report.results);
  const usable = results.filter(result => result.available).length;
  voiceCheckStatus.textContent = `${new Date(report.checkedAt).toLocaleString()}：使用可 ${usable}／除外 ${results.length - usable} スタイル`;
  voiceCheckResults.textContent = results.map(result => `${result.available ? '○' : '×'} ${result.name}［${result.styleName}］${result.available ? '' : `：${result.stage} ${result.detail}`}`).join('\n');
}
async function loadVoiceCheck() {
  if (voiceCheckController) return;
  const {voicevoxUrl = defaultEngine} = await chrome.storage.local.get('voicevoxUrl');
  const key = voiceAvailability.endpointKey(voicevoxUrl);
  showVoiceCheck((await chrome.storage.local.get(key))[key]);
}
cancelVoiceCheck.addEventListener('click', () => voiceCheckController?.abort());
checkVoices.addEventListener('click', async () => {
  if (voiceCheckController) return;
  if (engineInput.disabled || engineSave.disabled) {
    voiceCheckStatus.textContent = '接続先の読み込み・保存が完了してからチェックしてください。';
    return;
  }
  const controller = voiceCheckController = new AbortController();
  checkVoices.disabled = true;
  cancelVoiceCheck.disabled = false;
  engineSave.disabled = engineInput.disabled = true;
  document.querySelector('#reset-engine').disabled = true;
  try {
    stopVoicePreview();
    const {voicevoxUrl = defaultEngine} = await chrome.storage.local.get('voicevoxUrl');
    const response = await fetch(`${voicevoxUrl}/speakers`, {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), cache: 'no-store'});
    if (!response.ok) throw new Error(`メンバー一覧 HTTP ${response.status}`);
    const catalog = voiceRegistry.fromSpeakers(await response.json());
    if (!catalog.length) throw new Error('読み上げ用のメンバーがありません');
    const report = await voiceAvailability.scan(voicevoxUrl, catalog, {
      signal: controller.signal,
      progress(done, total, style) {
        voiceCheckStatus.textContent = `チェック中 ${done}／${total}${style ? `：${style.member}［${style.name}］` : ''}`;
      }
    });
    const currentEndpoint = (await chrome.storage.local.get('voicevoxUrl')).voicevoxUrl || defaultEngine;
    if (currentEndpoint !== voicevoxUrl) throw new Error('接続先が変更されたため、結果を保存しませんでした');
    controller.signal.throwIfAborted();
    await chrome.storage.local.set({[voiceAvailability.endpointKey(voicevoxUrl)]: report, speakerCatalog: catalog});
    showVoiceCheck(report);
  } catch (error) {
    voiceCheckStatus.textContent = `${controller.signal.aborted ? '中止しました' : `チェックを中断しました：${error.message}`}。以前の結果は保持します。`;
  } finally {
    voiceCheckController = null;
    checkVoices.disabled = false;
    cancelVoiceCheck.disabled = true;
    engineSave.disabled = engineInput.disabled = false;
    document.querySelector('#reset-engine').disabled = false;
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.voicevoxUrl || Object.keys(changes).some(key => key.startsWith('voiceAvailability:')))) loadVoiceCheck().catch(error => {voiceCheckStatus.textContent = error.message;});
});
loadVoiceCheck().catch(error => {voiceCheckStatus.textContent = error.message;});
