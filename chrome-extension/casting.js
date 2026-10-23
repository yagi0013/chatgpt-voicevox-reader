// Conversation-local casting. Only names and voice preferences are persisted.
(function (root) {
  const defaults = {unknown: true, narration: false, candidates: []};
  const normalize = value => value.normalize('NFKC').replace(/[ \t]/g, '').toLowerCase();
  class VoiceCasting {
    constructor(settings = {}, state = {}) { this.configure(settings, state); }
    configure(settings = {}, state = {}) {
      this.settings = {...defaults, ...settings};
      this.settings.candidates = Array.isArray(settings.candidates) ? settings.candidates.filter(value => typeof value === 'string') : [];
      this.entries = new Map();
      for (const entry of Array.isArray(state.entries) ? state.entries : []) {
        if (typeof entry?.label !== 'string' || !entry.label.trim() || typeof entry.name !== 'string') continue;
        this.entries.set(entry.label, {label: entry.label, name: entry.name, styleId: entry.styleId,
          manual: Boolean(entry.manual), aliases: Array.isArray(entry.aliases) ? entry.aliases.filter(alias => typeof alias === 'string' && alias.trim()) : []});
      }
      this.used = new Set(Array.isArray(state.used) ? state.used.filter(value => typeof value === 'string') : []);
    }
    snapshot() { return {entries: [...this.entries.values()], used: [...this.used]}; }
    remember(text) {
      const headers = /^[ \t]*([^\n「」]+?)[ \t]*「/gmu;
      for (const match of text.matchAll(headers)) {
        const speaker = voiceRegistry.resolveHeader(match[1]).speaker;
        if (speaker) this.used.add(speaker.name);
      }
    }
    find(label) {
      const key = normalize(label);
      return [...this.entries.values()].find(entry => normalize(entry.label) === key || entry.aliases.some(alias => normalize(alias) === key));
    }
    draw(exclude = '', unavailable = []) {
      const catalog = voiceRegistry.catalog.filter(member => !unavailable.includes(member.name));
      const pool = catalog.filter(member => !this.settings.candidates.length || this.settings.candidates.includes(member.name));
      if (!pool.length) return null;
      const occupied = new Set([...this.used, ...[...this.entries.values()].map(entry => entry.name)]);
      const free = pool.filter(member => !occupied.has(member.name) && member.name !== exclude);
      // Reserve the narrator whenever there are other available voices.
      const narrator = this.entries.get('@narration')?.name;
      const shared = pool.filter(member => member.name !== narrator && member.name !== exclude);
      const choices = free.length ? free : shared.length ? shared : pool;
      return choices[Math.floor(Math.random() * choices.length)];
    }
    assign(label, name, styleId, aliases = []) {
      const member = voiceRegistry.resolve(name);
      if (!member || !member.styles.some(style => style.id === styleId)) throw new Error('有効なメンバーとスタイルを選んでください。');
      const clean = aliases.map(alias => alias.trim()).filter(Boolean);
      for (const alias of [label, ...clean]) {
        const existing = this.find(alias);
        if (existing && existing.label !== label) throw new Error(`別名「${alias}」は別の登場人物に使われています。`);
      }
      this.entries.set(label, {label, name: member.name, styleId, manual: true, aliases: clean});
    }
    reroll(label, unavailable = []) {
      const old = this.entries.get(label);
      const member = this.draw(old?.name, unavailable);
      if (!member) throw new Error('抽選候補のメンバーがありません。');
      this.entries.set(label, {label, name: member.name, styleId: member.styleId, manual: false, aliases: old?.aliases || []});
    }
    reset() {
      for (const entry of [...this.entries.values()]) if (!entry.manual) this.reroll(entry.label);
    }
    resolve(header, narration = false) {
      const parsed = voiceRegistry.resolveHeader(header);
      if (!narration && parsed.speaker) { this.used.add(parsed.speaker.name); return parsed; }
      if (!(narration ? this.settings.narration : this.settings.unknown)) return parsed;
      const label = narration ? '@narration' : parsed.label;
      let entry = this.find(label);
      if (!entry) {
        if (!this.draw()) return {...parsed, speaker: null};
        this.reroll(label); entry = this.find(label);
      }
      let member = voiceRegistry.resolve(entry.name);
      if (!member) return {...parsed, speaker: null};
      const styles = member.styles;
      const style = styles.find(style => style.id === entry.styleId) || styles.find(style => style.id === member.styleId) || styles[0];
      if (!entry.manual) entry.styleId = style.id;
      const requested = parsed.requestedStyle ? styles.find(style => normalize(style.name) === normalize(parsed.requestedStyle)) : null;
      return {...parsed, label: narration ? 'ナレーション' : parsed.label,
        castingLabel: entry.label, automatic: !entry.manual,
        styleFallback: Boolean(parsed.requestedStyle && !requested),
        speaker: {...member, styleId: requested?.id ?? style.id, styleName: requested?.name ?? style.name}};
    }
    parse(text, {narration = this.settings.narration} = {}) {
      // Exclude fenced examples. Other plain prose is deliberately opt-in.
      let fenced = false;
      let fence = '';
      text = text.split(/\r?\n/).map(line => {
        const marker = line.trim().match(/^(`{3,}|~{3,})/);
        if (marker) { if (!fenced) { fenced = true; fence = marker[1][0]; } else if (marker[1][0] === fence) fenced = false; return ''; }
        return fenced ? '' : line;
      }).join('\n');
      this.remember(text);
      if (narration && this.settings.narration) this.resolve('', true);
      const result = [];
      const add = (header, body, isNarration = false) => {
        if (!body.trim()) return;
        const resolved = this.resolve(header, isNarration);
        if (!resolved.speaker) return;
        result.push({label: resolved.label, requestedStyle: resolved.requestedStyle, styleFallback: resolved.styleFallback,
          castingLabel: resolved.castingLabel, automatic: Boolean(resolved.automatic),
          name: resolved.speaker.name, styleId: resolved.speaker.styleId, styleName: resolved.speaker.styleName, text: body.trim(), narration: isNarration});
      };
      const prose = body => {
        if (!narration || !this.settings.narration) return;
        const clean = body.split('\n').filter(line => !/^\s*(?:>|#{1,6}\s|[-*_]{3,}\s*$|\|)/u.test(line)).join('\n').trim();
        if (clean) add('', clean, true);
      };
      const start = /^[ \t]*([^\n「」]+?)[ \t]*「/gmu;
      let consumed = 0;
      let match;
      while ((match = start.exec(text))) {
        prose(text.slice(consumed, match.index));
        let depth = 1;
        let end = start.lastIndex;
        for (; end < text.length; end++) {
          if (text[end] === '「') depth++;
          if (text[end] === '」' && --depth === 0) break;
        }
        if (depth) { consumed = start.lastIndex; continue; }
        const lineEnd = text.indexOf('\n', end);
        const trailing = text.slice(end + 1, lineEnd < 0 ? text.length : lineEnd);
        if (!trailing.trim()) {
          add(match[1], text.slice(start.lastIndex, end));
          consumed = end + 1;
        } else {
          consumed = lineEnd < 0 ? text.length : lineEnd;
          prose(text.slice(match.index, consumed));
        }
        start.lastIndex = consumed;
      }
      prose(text.slice(consumed));
      return result;
    }
  }
  root.VoiceCasting = VoiceCasting;
})(globalThis);
