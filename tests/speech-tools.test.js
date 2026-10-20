function equal(actual, expected, label) { if (actual !== expected) throw new Error(label + ': ' + actual); }
equal(speechTools.spokenText('春雨と春', '春=はる\n春雨=はるさめ', ''), 'はるさめとはる', 'longest first');
equal(speechTools.spokenText('春雨', '春雨=はるさめ', '春雨=しゅんう'), 'しゅんう', 'local override');
equal(speechTools.spokenText('A B', 'A=B\nB=C', ''), 'B C', 'nonrecursive replacement');
equal(speechTools.spokenText('a+b [春] $ ^ .', 'a+b=えー\n[春]=はる\n$=ドル\n^=やま\n.=てん', ''), 'えー はる ドル やま てん', 'literal metacharacters');
equal(speechTools.spokenText('春雨', '', ''), '春雨', 'empty dictionary');
for (const invalid of ['春雨', '=はる', '春=', 'a=b=c']) {
  let rejected = false;
  try { speechTools.dictionaryEntries(invalid); } catch { rejected = true; }
  if (!rejected) throw new Error('invalid dictionary accepted');
}
for (const [text, direction] of [['やった！！', 1], ['そう……', -1]]) {
  const query = {speedScale: 1, pitchScale: 0, intonationScale: 1};
  speechTools.express(query, {text});
  if ((query.speedScale - 1) * direction <= 0) throw new Error('emotion speed');
}
for (const item of [{text: '！！……？', requestedStyle: 'ささやき'}, {text: '！！', expressive: false}, {text: '普通です。'}]) {
  const query = {speedScale: 1.3, pitchScale: 0.1, intonationScale: 1};
  speechTools.express(query, item);
  equal(JSON.stringify(query), JSON.stringify({speedScale: 1.3, pitchScale: 0.1, intonationScale: 1}), 'explicit style/disabled/plain preservation');
}
print('PASS: pronunciation precedence, literal matching, nonrecursive replacement, validation and emotion/style priority');
