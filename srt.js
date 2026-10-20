(() => {
  "use strict";
  function timestamp(value) {
    const m = value.trim().match(/^(\d{1,}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
    if (!m || +m[2] > 59 || +m[3] > 59) return NaN;
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + +(m[4].padEnd(3, "0")) / 1000;
  }
  function parse(text) {
    const blocks = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim().split(/\n[ \t]*\n+/);
    const cues = [];
    let skipped = 0;
    for (const block of blocks) {
      const lines = block.split("\n");
      const timing = lines.findIndex(line => line.includes("-->"));
      if (timing < 0) { if (block.trim()) skipped++; continue; }
      const m = lines[timing].match(/^\s*(\S+)\s*-->\s*(\S+)(?:\s+.*)?$/);
      const start = m ? timestamp(m[1]) : NaN;
      const end = m ? timestamp(m[2]) : NaN;
      // Keep text as plain text. Never interpret imported markup as HTML.
      const body = lines.slice(timing + 1).join("\n").replace(/<[^>]*>/g, "").replace(/\{\\[^}]*\}/g, "").trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !body) { skipped++; continue; }
      cues.push({start, end, text: body});
    }
    cues.sort((a, b) => a.start - b.start || a.end - b.end);
    return {cues, skipped};
  }
  function shifted(cues, offset) {
    return cues.filter(c => c.end + offset > 0).map(c => ({...c, start: Math.max(0, c.start + offset), end: c.end + offset}));
  }
  globalThis.NTUSrt = {parse, shifted};
})();
