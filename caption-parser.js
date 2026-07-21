(function exposeCaptionParser(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CaptionParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const words = value => clean(value).split(" ").filter(Boolean);

  function overlapWordCount(previousText, currentText) {
    const previous = words(previousText);
    const current = words(currentText);
    const limit = Math.min(previous.length, current.length);
    for (let size = limit; size > 0; size -= 1) {
      const suffix = previous.slice(-size).join(" ").toLocaleLowerCase();
      const prefix = current.slice(0, size).join(" ").toLocaleLowerCase();
      if (suffix === prefix) return size;
    }
    return 0;
  }

  function looksRolling(segments) {
    if (segments.length < 4) return false;
    let signals = 0;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const current = segments[index];
      const next = segments[index + 1];
      if (current.end - current.start < 0.12 && clean(next.text).toLocaleLowerCase().startsWith(clean(current.text).toLocaleLowerCase())) signals += 1;
      else if (overlapWordCount(current.text, next.text) >= 2) signals += 1;
    }
    return signals / (segments.length - 1) >= 0.2;
  }

  function normalizeCaptionSegments(input, idPrefix = "en") {
    const segments = (input || []).map(segment => ({ ...segment, text: clean(segment.text) })).filter(segment => segment.text);
    if (!looksRolling(segments)) return segments.map((segment, index) => ({ ...segment, id: `${idPrefix}-${index + 1}` }));

    const filtered = segments.filter((segment, index) => {
      const next = segments[index + 1];
      return !(next && segment.end - segment.start < 0.12 && clean(next.text).toLocaleLowerCase().startsWith(segment.text.toLocaleLowerCase()));
    });
    const result = [];
    let buffer = null;
    let previousText = "";
    const flush = () => {
      if (!buffer?.text) return;
      result.push({ id: `${idPrefix}-${result.length + 1}`, start: buffer.start, end: buffer.end, text: clean(buffer.text) });
      buffer = null;
    };

    for (const segment of filtered) {
      const currentWords = words(segment.text);
      const overlap = overlapWordCount(previousText, segment.text);
      const novel = currentWords.slice(overlap).join(" ");
      previousText = segment.text;
      if (!novel) continue;
      if (!buffer) buffer = { start: segment.start, end: segment.end, text: novel };
      else { buffer.end = segment.end; buffer.text = `${buffer.text} ${novel}`; }
      if (/[.!?…][\]"')]*$/.test(novel) || buffer.end - buffer.start >= 8 || buffer.text.length >= 180) flush();
    }
    flush();
    return result;
  }

  return { normalizeCaptionSegments, overlapWordCount, looksRolling };
});
