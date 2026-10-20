// Shared by the popup and the standalone verification script.
(function (root) {
  function parseDialogue(input) {
    const utterances = [];
    const warnings = [];
    // A speech starts on its own line. Emoji are optional; unknown names
    // are kept visible instead of silently assigning an unrelated voice.
    const start = /^[ \t]*([^\n「」]+?)[ \t]*「/gmu;
    let consumed = 0;
    let match;
    while ((match = start.exec(input))) {
      if (input.slice(consumed, match.index).trim()) {
        warnings.push('会話形式以外の文章があります。読み上げ対象には含めません。');
      }
      const bodyStart = start.lastIndex;
      let depth = 1;
      let end = bodyStart;
      for (; end < input.length; end++) {
        if (input[end] === '「') depth++;
        if (input[end] === '」' && --depth === 0) break;
      }
      if (depth !== 0) {
        warnings.push(`${match[1]}：閉じる「」が未到着のため保留しています。`);
        consumed = input.length;
        break;
      }
      const {label, speaker, requestedStyle, styleFallback} = root.voiceRegistry.resolveHeader(match[1]);
      const text = input.slice(bodyStart, end).trim();
      if (!speaker) warnings.push(`未登録のキャラクター：${label}`);
      if (styleFallback) warnings.push(`${label}：スタイル「${requestedStyle}」がないため「${speaker.styleName}」を使います。`);
      if (text) utterances.push({label, requestedStyle, styleFallback, name: speaker?.name || null, styleName: speaker?.styleName || null, styleId: speaker?.styleId ?? null, text});
      consumed = end + 1;
      start.lastIndex = consumed;
    }
    if (input.slice(consumed).trim()) warnings.push('会話形式以外の文章があります。読み上げ対象には含めません。');
    return {utterances, warnings: [...new Set(warnings)]};
  }
  root.parseDialogue = parseDialogue;
})(globalThis);
