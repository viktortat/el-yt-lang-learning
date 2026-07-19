(function exposeCaptionSync(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CaptionSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function findCurrentCaption(items, time) {
    if (!Array.isArray(items) || !items.length || !Number.isFinite(time) || time < items[0].start) return null;
    let low = 0;
    let high = items.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (items[middle].start <= time) low = middle + 1;
      else high = middle - 1;
    }
    return items[Math.max(0, high)] || null;
  }

  function centeredScrollTop({ scrollTop, viewportTop, viewportHeight, rowTop, rowHeight, scrollHeight }) {
    const target = scrollTop + rowTop - viewportTop - ((viewportHeight - rowHeight) / 2);
    const maximum = Math.max(0, scrollHeight - viewportHeight);
    return Math.max(0, Math.min(maximum, target));
  }

  function createTimeTracker({ getPlayer, onTime, intervalMs = 200, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
    let timer = null;

    const tick = () => {
      try {
        const player = getPlayer();
        if (!player || typeof player.getCurrentTime !== "function") return;
        const time = Number(player.getCurrentTime());
        if (Number.isFinite(time)) onTime(time);
      } catch {
        // The YouTube wrapper exists slightly before its iframe API is ready.
        // The next tick retries against the current player instance.
      }
    };

    const stop = () => {
      if (timer !== null) clearIntervalFn(timer);
      timer = null;
    };

    const start = () => {
      stop();
      tick();
      timer = setIntervalFn(tick, intervalMs);
    };

    return { start, stop, tick };
  }

  return { findCurrentCaption, centeredScrollTop, createTimeTracker };
});
