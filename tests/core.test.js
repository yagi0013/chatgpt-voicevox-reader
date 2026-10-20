function assert(value, message) { if (!value) throw new Error(message); }
function items(text) { return speechOnly(text); }
const sample = '🟢ずんだもん「みなさん、今日は何してたのだ？」\n\n🔴めたん「質問ばかりですわよ？」\n🟣きりたん「雑談ですね。」\n🟡つむぎ「あーしは楽しからいいよ！」';
assert(items(sample).map(x => x.styleId).join(',') === '3,2,108,8', 'four speaker mapping');
assert(items('説明です。\n知らない人「対象外」\nずんだもん「未完').length === 0, 'prose, unknown and incomplete excluded');
assert(items('ずんだもん「対象外」という例です。').length === 0, 'trailing commentary excluded');
assert(items('```text\nずんだもん「コード例」\n```\n> めたん「引用」\n- つむぎ「箇条書き」\nめたん「本文」').length === 1, 'code, blockquote, bullet excluded');
assert(items('めたん「引用「こんにちは」です。\n次の行」')[0].text === '引用「こんにちは」です。\n次の行', 'nested multiline');
const tracker = new SpeechTracker();
tracker.seed(items('ずんだもん「古い会話」'));
assert(tracker.update(items('ずんだもん「古い会話」')).length === 0, 'old history skipped');
tracker.user('こんにちは');
assert(tracker.update(items('ずんだもん「古い会話」\nめたん「途中')).length === 0, 'partial waits');
const response = 'ずんだもん「古い会話」\nめたん「完成」';
assert(tracker.update(items(response)).length === 1, 'new complete speech');
assert(tracker.update(items(response)).length === 0, 'DOM rerender dedup');
assert(tracker.update(items(response + '\nめたん「完成」')).length === 1, 'intentional repeated speech');
tracker.seed(items(response));
tracker.user('つむぎ「ユーザーが貼った例」');
const withUser = response + '\nつむぎ「ユーザーが貼った例」';
assert(tracker.update(items(withUser)).length === 0, 'user pasted dialogue skipped');
assert(tracker.update(items(withUser + '\nきりたん「本当の応答」')).length === 1, 'assistant after user example');
assert(tracker.update(items('ずんだもん「読み込まれた過去」\n' + withUser)).length === 0, 'prepend history rebase');
tracker.seed(items(sample));
assert(tracker.update(items(sample + '\nめたん「新しい会話の既存応答」')).length === 0, 'navigation/off baseline disarmed');
print('PASS: strict dialogue parsing, streaming, dedup, repeats, user examples, history and reset');

const originalCatalog = voiceRegistry.catalog;
for (const member of originalCatalog) {
  const speech = speechOnly(`🔵${member.name}「全メンバー確認」`);
  assert(speech.length === 1 && speech[0].styleId === member.styleId, 'registered character: ' + member.name);
}
for (const [name, id] of [['はう',10], ['ひまり',14], ['ずん子',107], ['イタコ',109], ['アル',55], ['ビィ',58], ['小夜',46], ['タイプT',47], ['紅桜',51], ['雪さん',23]]) {
  assert(speechOnly(`${name}「略称テスト」`)[0]?.styleId === id, 'alias: ' + name);
}
assert(speechOnly('👩‍💻青山龍星「追加の絵文字」')[0]?.styleId === 13, 'emoji prefix');
assert(speechOnly('今日は青山龍星「紹介文」').length === 0, 'prose prefix must not match');
assert(speechOnly('†聖騎士 紅桜†「空白付き正式名」')[0]?.styleId === 51, 'spaced official name');
assert(speechOnly('whitecul「大文字小文字」')[0]?.styleId === 23, 'Latin case matching');
const discovered = voiceRegistry.fromSpeakers([{name: '新しい話者', styles: [{name: '歌', id: 999, type: 'sing'}, {name: '通常', id: 888, type: 'talk'}]}]);
voiceRegistry.setCatalog(discovered);
assert(speechOnly('新しい話者「自動登録」')[0]?.styleId === 888, 'new engine character');
assert(speechOnly('めたん「未インストール」').length === 0, 'unavailable character excluded');
assert(!voiceRegistry.setCatalog([]), 'empty catalog cannot erase fallback');
voiceRegistry.setCatalog(originalCatalog);
print(`PASS: all ${originalCatalog.length} bundled members, aliases, emoji, normalization, dynamic discovery and missing members`);

let checkedStyles = 0;
for (const member of voiceRegistry.catalog) {
  for (const style of member.styles) {
    const speech = speechOnly(`🟢${member.name}[${style.name}]「スタイル確認」`);
    assert(speech.length === 1 && speech[0].styleId === style.id && speech[0].styleName === style.name, 'style selection: ' + member.name + '/' + style.name);
    assert(speech[0].text === 'スタイル確認' && !speech[0].styleFallback, 'header excluded from speech');
    checkedStyles++;
  }
}
assert(speechOnly('ずんだもん[あまあま]「お疲れさまなのだ。」')[0]?.styleId === 1, 'zundamon sweet');
assert(speechOnly('めたん[ツンツン]「べ、別に。」')[0]?.styleId === 6, 'metan alias style');
assert(speechOnly('ずんだもん［ あまあま ］「全角指定」')[0]?.styleId === 1, 'fullwidth brackets and spacing');
const invalidStyle = speechOnly('きりたん[あまあま]「標準で読む」')[0];
assert(invalidStyle?.styleId === 108 && invalidStyle.styleFallback && invalidStyle.requestedStyle === 'あまあま', 'style unavailable on this speaker falls back');
assert(parseDialogue('きりたん[あまあま]「標準」').warnings.length === 1, 'fallback diagnostic');
assert(speechOnly('誰か[ノーマル]「対象外」').length === 0, 'unknown speaker stays excluded');
assert(speechOnly('ずんだもん[あまあま]「未完').length === 0, 'styled streaming incomplete');
assert(speechOnly('ずんだもん[あまあま]「引用「はい」です」')[0]?.text === '引用「はい」です', 'styled nested speech');
assert(speechOnly('```\nずんだもん[あまあま]「例」\n```').length === 0, 'styled code example excluded');
const styledTracker = new SpeechTracker();
styledTracker.seed([]); styledTracker.user('こんにちは');
assert(styledTracker.update(speechOnly('めたん[ツンツン]「はい」')).length === 1, 'styled auto first');
assert(styledTracker.update(speechOnly('めたん[ツンツン]「はい」')).length === 0, 'styled auto dedup');
assert(styledTracker.update(speechOnly('めたん[ツンツン]「はい」\nめたん[あまあま]「はい」'))[0]?.styleId === 0, 'same body different style in new speech');
const legacyCatalog = voiceRegistry.catalog;
voiceRegistry.setCatalog([{name: '旧保存メンバー', styleName: '通常', styleId: 700}]);
assert(speechOnly('旧保存メンバー[喜び]「古い保存形式」')[0]?.styleId === 700, 'legacy cached catalog migrates');
voiceRegistry.setCatalog(legacyCatalog);
print(`PASS: all ${checkedStyles} speech styles, aliases, fallback, streaming, dedup and legacy catalogs`);

const messages = new MessageSpeechTracker();
messages.seed([{id: 'old-response', items: speechOnly('めたん「以前の発言」')}]);
const newlyGenerated = {id: 'new-response', items: speechOnly('ずんだもん[あまあま]「新しい発言」')};
assert(messages.update(newlyGenerated, true).length === 1, 'new response independent of history');
messages.seed([{id: 'loaded-history', items: speechOnly('きりたん「読み込まれた過去」')}]);
assert(messages.update(newlyGenerated, true).length === 0, 'old-history insertion does not replay active message');
messages.update({id: 'new-response', items: []}, true);
assert(messages.update(newlyGenerated, true).length === 0, 'temporary empty/rerender preserves consumed position');
newlyGenerated.items.push(...speechOnly('めたん[ツンツン]「続き」'));
assert(messages.update(newlyGenerated, true)[0]?.styleId === 6, 'next completed speech after history churn');
assert(messages.update({id: 'offline-response', items: speechOnly('つむぎ「停止中」')}, false).length === 0, 'offline speech consumed without queue');
assert(messages.update({id: 'offline-response', items: speechOnly('つむぎ「停止中」')}, true).length === 0, 'offline speech not replayed after reconnect');
print('PASS: stable message tracking survives history reordering, temporary disappearance and offline recovery');
