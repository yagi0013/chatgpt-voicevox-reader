// Speech-only transformations. Displayed dialogue is never modified.
(function(root) {
  function dictionaryEntries(text) {
    const entries = [];
    for (const [index, line] of String(text || '').split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      const parts = line.split('=');
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) throw new Error(`辞書の${index + 1}行目を「単語=読み方」で入力してください。`);
      entries.push([parts[0].trim(), parts[1].trim()]);
    }
    return entries;
  }
  function spokenText(text, common, local) {
    const entries = [...new Map([...dictionaryEntries(common), ...dictionaryEntries(local)])].sort((a,b) => b[0].length - a[0].length);
    if (!entries.length) return text;
    const readings = new Map(entries);
    const pattern = entries.map(([word]) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return text.replace(new RegExp(pattern, 'gu'), word => readings.get(word));
  }
  function express(query, item) {
    if (item.requestedStyle || item.expressive === false) return;
    const text = item.text;
    if (/[!！]{2,}/u.test(text)) {
      query.speedScale *= 1.04;
      query.intonationScale = Math.min(2, (query.intonationScale ?? 1) * 1.08);
      query.pitchScale = Math.min(0.5, (query.pitchScale ?? 0) + 0.015);
    } else if (/…{2,}|・{3,}|\.{3,}/u.test(text)) {
      query.speedScale *= 0.94;
      query.intonationScale = (query.intonationScale ?? 1) * 0.94;
    } else if (/[?？]/u.test(text)) {
      query.intonationScale = Math.min(2, (query.intonationScale ?? 1) * 1.04);
    }
  }
  root.speechTools = {dictionaryEntries, spokenText, express};
})(globalThis);
