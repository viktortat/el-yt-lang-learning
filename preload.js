const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appAPI", {
  getInfo: () => ipcRenderer.invoke("app:get-info"),
  getYoutubeMetadata: url => ipcRenderer.invoke("youtube:get-metadata", url),
  getLibrary: () => ipcRenderer.invoke("library:get"),
  saveLibrary: library => ipcRenderer.invoke("library:save", library),
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
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: payload => ipcRenderer.invoke("settings:save", payload),
  getDefaultSettings: () => ipcRenderer.invoke("settings:defaults")
});
