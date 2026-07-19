(function exposePlayerControls(root, factory) {
  const api = typeof module === "object" && module.exports
    ? factory(require("./caption-sync"))
    : factory(root.CaptionSync);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PlayerControls = api;
})(typeof globalThis !== "undefined" ? globalThis : this, captionSync => {
  const SUPPORTED_COMMANDS = Object.freeze(["play", "back", "forward", "repeat", "rate", "seek"]);

  function execute({ player, command, value, captions = [] }) {
    if (!player) return { ok: false, message: "Плеер YouTube ещё загружается" };

    try {
      if (command === "play") {
        if (typeof player.getPlayerState !== "function" || typeof player.playVideo !== "function" || typeof player.pauseVideo !== "function") throw new Error("Плеер ещё не готов");
        if (player.getPlayerState() === 1) player.pauseVideo();
        else player.playVideo();
        return { ok: true };
      }

      if (command === "rate") {
        const rate = Number(value);
        if (!Number.isFinite(rate) || rate <= 0 || typeof player.setPlaybackRate !== "function") throw new Error("Недоступна смена скорости");
        player.setPlaybackRate(rate);
        return { ok: true, rate };
      }

      if (command === "seek") {
        const time = Number(value);
        if (!Number.isFinite(time) || typeof player.seekTo !== "function" || typeof player.playVideo !== "function") throw new Error("Недоступен переход к реплике");
        player.seekTo(Math.max(0, time), true);
        player.playVideo();
        return { ok: true, time: Math.max(0, time) };
      }

      if (typeof player.getCurrentTime !== "function" || typeof player.seekTo !== "function") throw new Error("Плеер ещё не готов");
      const currentTime = Number(player.getCurrentTime());
      if (!Number.isFinite(currentTime)) throw new Error("Плеер ещё не передаёт текущее время");

      if (command === "back" || command === "forward") {
        const time = command === "back" ? Math.max(0, currentTime - 5) : currentTime + 5;
        player.seekTo(time, true);
        return { ok: true, time };
      }

      if (command === "repeat") {
        const caption = captionSync.findCurrentCaption(captions, currentTime);
        if (!caption) return { ok: false, message: "Для повтора нужна текущая реплика с субтитрами" };
        if (typeof player.playVideo !== "function") throw new Error("Плеер ещё не готов");
        player.seekTo(Number(caption.start), true);
        player.playVideo();
        return { ok: true, caption };
      }

      return { ok: false, message: `Неизвестная команда плеера: ${command}` };
    } catch (error) {
      return { ok: false, message: error.message || "Команда плеера не выполнена" };
    }
  }

  return { SUPPORTED_COMMANDS, execute };
});
