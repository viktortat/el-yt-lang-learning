const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appAPI", {
  getInfo: () => ipcRenderer.invoke("app:get-info"),
  getYoutubeMetadata: url => ipcRenderer.invoke("youtube:get-metadata", url),
  getLibrary: () => ipcRenderer.invoke("library:get"),
  getLibraries: () => ipcRenderer.invoke("libraries:get"),
  getLibraryPreferences: () => ipcRenderer.invoke("libraries:preferences"),
  selectLibrary: libraryId => ipcRenderer.invoke("libraries:select", libraryId),
  createLibrary: (name, preferences) => ipcRenderer.invoke("libraries:create", name, preferences),
  renameLibrary: (libraryId, name) => ipcRenderer.invoke("libraries:rename", libraryId, name),
  deleteLibrary: libraryId => ipcRenderer.invoke("libraries:delete", libraryId),
  saveLibrary: library => ipcRenderer.invoke("library:save", library),
  saveLibraryPreferences: (libraryId, preferences) => ipcRenderer.invoke("libraries:save-preferences", libraryId, preferences),
  handleEmptyLibraryDefault: shouldPopulate => ipcRenderer.invoke("library:handle-empty-default", shouldPopulate),
  exportLibrary: libraryId => ipcRenderer.invoke("library:export", libraryId),
  importLibrary: () => ipcRenderer.invoke("library:import"),
  getLibraryBackups: () => ipcRenderer.invoke("library:backups"),
  restoreLibraryBackup: name => ipcRenderer.invoke("library:restore-backup", name),
  openPlaylist: url => ipcRenderer.invoke("youtube:open-playlist", url),
  getPlaylistVideos: url => ipcRenderer.invoke("youtube:playlist-videos", url),
  openYoutube: url => ipcRenderer.invoke("youtube:open-external", url),
  openOpenRouterApiKeys: () => ipcRenderer.invoke("openrouter:open-api-keys"),
  getCaptions: (videoId, libraryId) => ipcRenderer.invoke("captions:get", videoId, libraryId),
  saveCaptions: (videoId, captions, libraryId) => ipcRenderer.invoke("captions:save", videoId, captions, libraryId),
  getCaptionTrackInfo: payload => ipcRenderer.invoke("captions:track-info", payload),
  downloadCaptionTrack: payload => ipcRenderer.invoke("captions:download-track", payload),
  selectLocalMedia: () => ipcRenderer.invoke("captions:select-local-media"),
  transcribeCaptionTrack: payload => ipcRenderer.invoke("captions:transcribe-track", payload),
  translateCaptionTrack: payload => ipcRenderer.invoke("captions:translate-track", payload),
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
