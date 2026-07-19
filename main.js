const { app, BrowserWindow, ipcMain, safeStorage, session } = require("electron");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } = require("fs/promises");
const { downloadVideoArgs, transcriberArgs, captionsFromTranscript, hasVtt, chooseEnglishVtt } = require("./transcription-plan");
const { normalizeCaptionSegments } = require("./caption-parser");

const APP_NAME = "YT Lang Learning";
const APP_VERSION = app.getVersion();
const APP_TITLE = `${APP_NAME} v${APP_VERSION}`;

let mainWindow;
let library;
let settings;
const captionJobs = new Map();

app.setPath(
  "userData",
  path.join(process.env.LOCALAPPDATA || app.getPath("appData"), APP_NAME)
);

function dataDirectory() {
  return app.isPackaged ? path.dirname(process.execPath) : __dirname;
}

function libraryPath() { return path.join(dataDirectory(), "library.json"); }
function settingsPath() { return path.join(dataDirectory(), "settings.json"); }
function captionsPath(videoId) { return path.join(dataDirectory(), "captions", `${videoId}.json`); }

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultLibrary() {
  return {
    version: 1,
    root: { id: "root", type: "folder", name: "Моя библиотека", children: [] }
  };
}

function defaultSettings() {
  return {
    version: 1,
    theme: "dark",
    translation: {
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
      encryptedApiKey: ""
    },
    transcription: {
      modelRoot: "C:\\Users\\viktor\\.cache\\ai-models\\faster-whisper",
      model: "large-v3-turbo",
      uvPath: "uv",
      ytDlpPath: "yt-dlp",
      pythonPath: "C:\\Python314\\python.exe",
      scriptPath: "C:\\Users\\viktor\\.codex\\skills\\transcribe-local-video\\scripts\\transcribe.py"
    }
  };
}

function normalizeLibrary(value) {
  if (!value || !value.root || value.root.type !== "folder") return defaultLibrary();
  return { version: 1, root: value.root };
}

function normalizeSettings(value) {
  const defaults = defaultSettings();
  return {
    ...defaults,
    ...value,
    translation: { ...defaults.translation, ...(value && value.translation) },
    transcription: { ...defaults.transcription, ...(value && value.transcription) }
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return fallback();
    throw error;
  }
}

async function loadData() {
  library = normalizeLibrary(await readJson(libraryPath(), defaultLibrary));
  settings = normalizeSettings(await readJson(settingsPath(), defaultSettings));
}

function defaultCaptions() { return { version: 1, english: [], russian: [], studiedIds: [] }; }
async function loadCaptions(videoId) {
  const captions = await readJson(captionsPath(videoId), defaultCaptions);
  if (captions.english?.length && !captions.russian?.length) {
    const normalized = normalizeCaptionSegments(captions.english);
    if (normalized.length !== captions.english.length) {
      captions.english = normalized;
      await writeJson(captionsPath(videoId), captions);
    }
  }
  return captions;
}
async function saveCaptions(videoId, captions) { await writeJson(captionsPath(videoId), captions); return captions; }

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => reject(error));
    child.on("close", code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `${command} завершился с кодом ${code}`)));
  });
}

async function runYtDlp(args, cwd) {
  try {
    await run(settings.transcription.ytDlpPath, args, cwd);
  } catch (error) {
    if (error.code !== "ENOENT" || settings.transcription.ytDlpPath !== "yt-dlp") throw error;
    await run("python", ["-m", "yt_dlp", ...args], cwd);
  }
}

function seconds(value) {
  const [hours, minutes, rest] = value.trim().replace(",", ".").split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(rest);
}

function parseVtt(content) {
  const lines = content.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const segments = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\d{2}:\d{2}:\d{2}[.,]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[.,]\d{3})/);
    if (!match) continue;
    const text = [];
    while (++index < lines.length && lines[index].trim()) text.push(lines[index]);
    const value = text.join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (value && !segments.some(segment => segment.text === value && Math.abs(segment.start - seconds(match[1])) < .1)) {
      segments.push({ id: `en-${segments.length + 1}`, start: seconds(match[1]), end: seconds(match[2]), text: value });
    }
  }
  return normalizeCaptionSegments(segments);
}

async function downloadEnglishCaptions({ videoId, url }) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ytll-captions-"));
  try {
    const output = path.join(temporaryDirectory, "caption.%(ext)s");
    try {
      // Авторские дорожки надёжнее и реже получают rate limit от YouTube.
      await runYtDlp([
        "--skip-download", "--write-subs", "--sub-langs", "en,en-GB,en-US,en-CA,en-AU", "--sub-format", "vtt", "--convert-subs", "vtt",
        "-o", output, url
      ], temporaryDirectory);
    } catch {}
    let files = await readdir(temporaryDirectory);
    if (!hasVtt(files)) {
      // yt-dlp возвращает код 0 даже когда ручной дорожки нет, поэтому
      // fallback определяется по фактически созданному VTT-файлу.
      await runYtDlp([
        "--skip-download", "--write-auto-subs", "--sub-langs", "en-orig,en", "--sub-format", "vtt", "--convert-subs", "vtt",
        "-o", output, url
      ], temporaryDirectory);
      files = await readdir(temporaryDirectory);
    }
    const vtt = chooseEnglishVtt(files);
    if (!vtt) return { status: "missing-track" };
    const english = parseVtt(await readFile(path.join(temporaryDirectory, vtt), "utf8"));
    if (!english.length) throw new Error("В найденной дорожке нет реплик.");
    const captions = await loadCaptions(videoId);
    captions.english = english;
    captions.russian = [];
    captions.studiedIds ||= [];
    return { status: "ok", captions: await saveCaptions(videoId, captions) };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function transcribeEnglishCaptions({ videoId, url }) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ytll-whisper-"));
  try {
    const sourceTemplate = path.join(temporaryDirectory, "source.%(ext)s");
    await runYtDlp(downloadVideoArgs(sourceTemplate, url), temporaryDirectory);
    const downloadedFiles = await readdir(temporaryDirectory);
    const sourceFile = downloadedFiles.find(file => /\.(mp4|mkv|webm|mov|m4v)$/i.test(file));
    if (!sourceFile) throw new Error("Не удалось скачать временное видео для локального распознавания.");

    const inputPath = path.join(temporaryDirectory, sourceFile);
    const outputDirectory = path.join(temporaryDirectory, "results");
    await run(settings.transcription.uvPath, transcriberArgs(settings.transcription, inputPath, outputDirectory), temporaryDirectory);

    const transcriptDirectory = path.join(outputDirectory, `${path.parse(sourceFile).name}_transcript`);
    const transcriptPath = path.join(transcriptDirectory, `${path.parse(sourceFile).name}.json`);
    const payload = JSON.parse(await readFile(transcriptPath, "utf8"));
    const english = captionsFromTranscript(payload);
    if (!english.length) throw new Error("faster-whisper не распознал английскую речь в видео.");
    const captions = await loadCaptions(videoId);
    captions.english = english;
    captions.russian = [];
    captions.studiedIds ||= [];
    return saveCaptions(videoId, captions);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function oncePerCaptionJob(key, factory) {
  if (captionJobs.has(key)) return captionJobs.get(key);
  const job = Promise.resolve().then(factory).finally(() => captionJobs.delete(key));
  captionJobs.set(key, job);
  return job;
}

function jsonFromModel(value) {
  const candidate = value.match(/\[[\s\S]*\]/)?.[0];
  if (!candidate) throw new Error("Модель не вернула JSON-перевод.");
  return JSON.parse(candidate);
}

async function translateCaptions(videoId, onProgress = () => {}) {
  if (!settings.translation.encryptedApiKey) throw new Error("В настройках не указан ключ OpenRouter.");
  const apiKey = safeStorage.decryptString(Buffer.from(settings.translation.encryptedApiKey, "base64"));
  const captions = await loadCaptions(videoId);
  if (!captions.english.length) throw new Error("Сначала загрузите английские субтитры.");
  captions.english = normalizeCaptionSegments(captions.english);
  const russian = [];
  for (let offset = 0; offset < captions.english.length; offset += 50) {
    const batch = captions.english.slice(offset, offset + 50);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(90000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": APP_NAME },
      body: JSON.stringify({ model: settings.translation.model, temperature: 0.2, messages: [
        { role: "system", content: "Переводи английские субтитры на естественный русский. Верни только JSON-массив объектов {id,text}; сохрани все id и не добавляй пояснений." },
        { role: "user", content: JSON.stringify(batch.map(item => ({ id: item.id, text: item.text }))) }
      ] })
    });
    if (!response.ok) throw new Error(`OpenRouter ответил с кодом ${response.status}.`);
    const payload = await response.json();
    const translated = jsonFromModel(payload.choices?.[0]?.message?.content || "");
    const byId = new Map(translated.map(item => [item.id, item.text]));
    for (const item of batch) {
      const text = String(byId.get(item.id) || "").trim();
      if (!text) throw new Error(`OpenRouter не перевёл реплику ${item.id}.`);
      russian.push({ ...item, text });
    }
    captions.russian = [...russian];
    await saveCaptions(videoId, captions);
    onProgress({ videoId, completed: russian.length, total: captions.english.length });
  }
  return captions;
}

function publicSettings() {
  const copy = JSON.parse(JSON.stringify(settings));
  copy.translation.hasApiKey = Boolean(copy.translation.encryptedApiKey);
  delete copy.translation.encryptedApiKey;
  return copy;
}

function storeSettings(next, submittedApiKey) {
  const normalized = normalizeSettings(next);
  normalized.translation.encryptedApiKey = settings.translation.encryptedApiKey;
  if (submittedApiKey !== undefined) {
    if (!submittedApiKey) normalized.translation.encryptedApiKey = "";
    else if (safeStorage.isEncryptionAvailable()) {
      normalized.translation.encryptedApiKey = safeStorage.encryptString(submittedApiKey).toString("base64");
    } else {
      throw new Error("Шифрование ключа недоступно в этой Windows-среде.");
    }
  }
  return normalized;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    title: APP_TITLE,
    icon: path.join(__dirname, "assets", "yt-lang-learning.ico"),
    backgroundColor: "#10151c",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });
  mainWindow.removeMenu();
  mainWindow.on("page-title-updated", event => {
    event.preventDefault();
    mainWindow.setTitle(APP_TITLE);
  });
  mainWindow.setTitle(APP_TITLE);
  // Локальные file:// URL сохраняют кэш между сборками. Очищаем его перед
  // загрузкой renderer, чтобы после обновления не выполнялся старый app.js.
  mainWindow.webContents.session.clearCache()
    .catch(() => {})
    .finally(() => { mainWindow.loadFile("index.html"); });
}

if (require("electron-squirrel-startup")) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    await loadData();

    // Electron renders our UI from file://, so Chromium does not attach a
    // Referer to iframe requests. YouTube rejects such embeds with Error 153.
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ["https://*.youtube.com/*", "https://youtube.com/*", "https://*.youtube-nocookie.com/*"] },
      (details, callback) => {
        details.requestHeaders.Referer = "https://yt-lang-learning.local/";
        callback({ requestHeaders: details.requestHeaders });
      }
    );

    ipcMain.handle("app:get-info", () => ({ version: APP_VERSION, dataDirectory: dataDirectory() }));
    ipcMain.handle("youtube:get-metadata", async (_event, url) => {
      try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (!response.ok) throw new Error(`YouTube ответил с кодом ${response.status}`);
        const metadata = await response.json();
        return { title: metadata.title || "Новый урок" };
      } catch (error) {
        return { title: "Новый урок", warning: error.message };
      }
    });
    ipcMain.handle("library:get", () => library);
    ipcMain.handle("library:save", async (_event, nextLibrary) => {
      library = normalizeLibrary(nextLibrary);
      await writeJson(libraryPath(), library);
      return library;
    });
    ipcMain.handle("captions:get", (_event, videoId) => loadCaptions(videoId));
    ipcMain.handle("captions:save", (_event, videoId, captions) => saveCaptions(videoId, {
      version: 1,
      english: Array.isArray(captions?.english) ? captions.english : [],
      russian: Array.isArray(captions?.russian) ? captions.russian : [],
      studiedIds: Array.isArray(captions?.studiedIds) ? captions.studiedIds : [],
    }));
    ipcMain.handle("captions:download-english", (_event, payload) => oncePerCaptionJob(`youtube:${payload.videoId}`, () => downloadEnglishCaptions(payload)));
    ipcMain.handle("captions:transcribe-english", (_event, payload) => oncePerCaptionJob(`whisper:${payload.videoId}`, () => transcribeEnglishCaptions(payload)));
    ipcMain.handle("captions:translate", (event, videoId) => oncePerCaptionJob(`translate:${videoId}`, () => translateCaptions(videoId, progress => event.sender.send("captions:translation-progress", progress))));
    ipcMain.handle("settings:get", () => publicSettings());
    ipcMain.handle("settings:save", async (_event, payload) => {
      settings = storeSettings(payload.settings, payload.apiKey);
      await writeJson(settingsPath(), settings);
      return publicSettings();
    });
    ipcMain.handle("settings:defaults", () => {
      const result = defaultSettings();
      delete result.translation.encryptedApiKey;
      result.translation.hasApiKey = false;
      return result;
    });

    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
