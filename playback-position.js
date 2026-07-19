(function exposePlaybackPosition(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PlaybackPosition = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const STORAGE_KEY = "ytll-playback-positions";

  function createStore(storage, throttleMs = 1000) {
    let positions = {};
    let lastSavedAt = 0;
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) positions = parsed;
    } catch {}

    function get(videoId) {
      const time = Number(positions[videoId]);
      return Number.isFinite(time) && time >= 0 ? time : 0;
    }

    function save(videoId, time, { force = false, now = Date.now() } = {}) {
      const normalizedTime = Number(time);
      if (!videoId || !Number.isFinite(normalizedTime) || normalizedTime < 0) return false;
      if (!force && now - lastSavedAt < throttleMs) return false;
      positions[videoId] = Math.round(normalizedTime * 1000) / 1000;
      storage.setItem(STORAGE_KEY, JSON.stringify(positions));
      lastSavedAt = now;
      return true;
    }

    return { get, save };
  }

  return { STORAGE_KEY, createStore };
});
