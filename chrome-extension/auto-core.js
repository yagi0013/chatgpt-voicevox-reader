(function (root) {
  // Auto speech accepts only complete, standalone lines by registered speakers.
  function speechOnly(text) {
    let fenced = false;
    let fence = '';
    const lines = text.split(/\r?\n/).map(line => {
      const marker = line.trim().match(/^(`{3,}|~{3,})/);
      if (marker) {
        if (!fenced) { fenced = true; fence = marker[1][0]; }
        else if (marker[1][0] === fence) fenced = false;
        return '';
      }
      return fenced ? '' : line;
    });
    const clean = lines.join('\n');
    const result = [];
    const start = /^[ \t]*([^\n「」]+?)[ \t]*「/gmu;
    let match;
    while ((match = start.exec(clean))) {
      if (!root.voiceRegistry.resolveHeader(match[1]).speaker) continue;
      const bodyStart = start.lastIndex;
      let depth = 1;
      let end = bodyStart;
      for (; end < clean.length; end++) {
        if (clean[end] === '「') depth++;
        if (clean[end] === '」' && --depth === 0) break;
      }
      if (depth) break;
      const lineEnd = clean.indexOf('\n', end);
      const trailing = clean.slice(end + 1, lineEnd < 0 ? clean.length : lineEnd);
      if (!trailing.trim()) {
        const parsed = root.parseDialogue(clean.slice(match.index, end + 1));
        result.push(...parsed.utterances.filter(item => item.styleId !== null));
      }
      start.lastIndex = end + 1;
    }
    return result;
  }
  const key = item => `${item.styleId}\u0000${item.text}`;
  class SpeechTracker {
    constructor() { this.previous = []; this.suppressed = new Map(); this.armed = false; }
    seed(items) { this.previous = items.map(key); this.suppressed.clear(); this.armed = false; }
    user(text, items = speechOnly(text)) {
      this.armed = true;
      for (const item of items) {
        const signature = key(item);
        this.suppressed.set(signature, (this.suppressed.get(signature) || 0) + 1);
      }
    }
    update(items) {
      const keys = items.map(key);
      const isAppend = this.previous.every((value, index) => keys[index] === value);
      const added = isAppend ? items.slice(this.previous.length) : [];
      this.previous = keys;
      if (!this.armed) return [];
      return added.filter(item => {
        const signature = key(item);
        const remaining = this.suppressed.get(signature) || 0;
        if (!remaining) return true;
        if (remaining === 1) this.suppressed.delete(signature);
        else this.suppressed.set(signature, remaining - 1);
        return false;
      });
    }
  }
  // Per-message high-water marks survive reordering and virtualization of history.
  class MessageSpeechTracker {
    constructor() { this.consumed = new Map(); }
    clear() { this.consumed.clear(); }
    seed(messages) {
      for (const message of messages) this.consumed.set(message.id, Math.max(this.consumed.get(message.id) || 0, message.items.length));
    }
    update(message, enabled) {
      if (!message) return [];
      const count = this.consumed.get(message.id) || 0;
      this.consumed.set(message.id, Math.max(count, message.items.length));
      return enabled ? message.items.slice(count) : [];
    }
  }
  root.MessageSpeechTracker = MessageSpeechTracker;
  root.speechOnly = speechOnly;
  root.SpeechTracker = SpeechTracker;
})(globalThis);
