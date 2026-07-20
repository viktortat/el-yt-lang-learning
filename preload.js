const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appAPI", {
  getInfo: () => ipcRenderer.invoke("app:get-info"),
  getYoutubeMetadata: url => ipcRenderer.invoke("youtube:get-metadata", url),
  getLibrary: () => ipcRenderer.invoke("library:get"),
  saveLibrary: library => ipcRenderer.invoke("library:save", library),
  handleEmptyLibraryDefault: shouldPopulate => ipcRenderer.invoke("library:handle-empty-default", shouldPopulate),
  exportLibrary: () => ipcRenderer.invoke("library:export"),
  importLibrary: () => ipcRenderer.invoke("library:import"),
  restoreLatestLibraryBackup: () => ipcRenderer.invoke("library:restore-latest-backup"),
  openPlaylist: url => ipcRenderer.invoke("youtube:open-playlist", url),
  getPlaylistVideos: url => ipcRenderer.invoke("youtube:playlist-videos", url),
  openYoutube: url => ipcRenderer.invoke("youtube:open-external", url),
  openOpenRouterApiKeys: () => ipcRenderer.invoke("openrouter:open-api-keys"),
  getCaptions: videoId => ipcRenderer.invoke("captions:get", videoId),
  saveCaptions: (videoId, captions) => ipcRenderer.invoke("captions:save", videoId, captions),
  downloadEnglishCaptions: payload => ipcRenderer.invoke("captions:download-english", payload),
  transcribeEnglishCaptions: payload => ipcRenderer.invoke("captions:transcribe-english", payload),
  translateCaptions: videoId => ipcRenderer.invoke("captions:translate", videoId),
  onTranslationProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("captions:translation-progress", listener);
    return () => ipcRenderer.removeListener("captions:translation-progress", listener);
  },
  onTranscriptionProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("captions:transcription-progress", listener);
    return () => ipcRenderer.removeListener("captions:transcription-progress", listener);
  },
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: payload => ipcRenderer.invoke("settings:save", payload),
  getDefaultSettings: () => ipcRenderer.invoke("settings:defaults")
});
