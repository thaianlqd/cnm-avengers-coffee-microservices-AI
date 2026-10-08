// Small, text-only Markdown subset. Escaped evidence stays literal; no HTML or links are executed.
export function inlineText(value, depth = 0) {
  const text = String(value || '');
  const nodes = [];
  let plain = '';
  const flush = () => { if (plain) { nodes.push({ type: 'text', text: plain }); plain = ''; } };
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\' && /[\\`*_{}<>#!|[\]()]/.test(text[i + 1] || '')) {
      plain += text[i + 1]; i += 2; continue;
    }
    const marker = text.startsWith('**', i) ? '**' : text[i] === '*' ? '*' : null;
    if (marker && depth < 4) {
      let end = i + marker.length;
      while (end < text.length) {
        if (text[end] === '\\') { end += 2; continue; }
        if (text.startsWith(marker, end) && (marker !== '*' || !text.startsWith('**', end))) {
          if (marker === '**' && text.startsWith('***', end)) end++;
          break;
        }
        end++;
      }
      if (end < text.length && end > i + marker.length) {
        flush(); nodes.push({ type: marker === '**' ? 'strong' : 'em', children: inlineText(text.slice(i + marker.length, end), depth + 1) });
        i = end + marker.length; continue;
      }
    }
    plain += text[i++];
  }
  flush(); return nodes;
}

export function textBlocks(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const listLine = line => /^(\s*)([-+] |(\d+)\. )(.+)$/.exec(line);
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    if (/^\s*---+\s*$/.test(lines[i])) { blocks.push({ type: 'rule' }); i++; continue; }
    const heading = /^#{1,3}\s+(.+)$/.exec(lines[i]);
    if (heading) { blocks.push({ type: 'heading', text: heading[1] }); i++; continue; }
    const first = listLine(lines[i]);
    if (first) {
      const ordered = !!first[3];
      const block = { type: ordered ? 'ordered' : 'unordered', start: ordered ? Number(first[3]) : undefined, items: [] };
      while (i < lines.length) {
        const match = listLine(lines[i]);
        if (!match || !!match[3] !== ordered) break;
        const item = [match[4]]; i++;
        while (i < lines.length && lines[i].trim() && !listLine(lines[i]) && !/^#{1,3}\s|^---+\s*$/.test(lines[i])) item.push(lines[i++]);
        block.items.push(item.join('\n'));
        // Backend answers separate numbered items with blank lines.
        let next = i;
        while (next < lines.length && !lines[next].trim()) next++;
        const following = listLine(lines[next] || '');
        if (!following || !!following[3] !== ordered) break;
        i = next;
      }
      blocks.push(block); continue;
    }
    const paragraph = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !listLine(lines[i]) && !/^#{1,3}\s|^---+\s*$/.test(lines[i])) paragraph.push(lines[i++]);
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}
