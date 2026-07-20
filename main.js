const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const http = require("http");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { appendFile, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } = require("fs/promises");
const { downloadVideoArgs, transcriberArgs, captionsFromTranscript, hasVtt, chooseEnglishVtt, createProgressParser } = require("./transcription-plan");
const { normalizeCaptionSegments } = require("./caption-parser");
const { translationsFromModel } = require("./translation-response");

const APP_NAME = "YT Lang Learning";
const APP_VERSION = app.getVersion();
const APP_TITLE = `${APP_NAME} v${APP_VERSION}`;

let mainWindow;
let library;
let settings;
let rendererServer;
const captionJobs = new Map();

app.setPath(
  "userData",
  path.join(process.env.LOCALAPPDATA || app.getPath("appData"), APP_NAME)
);

function dataDirectory() {
  return app.isPackaged ? path.dirname(process.execPath) : __dirname;
}

function libraryPath() { return path.join(dataDirectory(), "library.json"); }
function defaultLibraryPath() { return path.join(__dirname, "default.ytll-library.json"); }
function settingsPath() { return path.join(dataDirectory(), "settings.json"); }
function captionsPath(videoId) { return path.join(dataDirectory(), "captions", `${videoId}.json`); }
function backupsDirectory() { return path.join(dataDirectory(), "library-backups"); }
function diagnosticPath() { return path.join(app.getPath("userData"), "renderer-debug.log"); }
function logDiagnostic(message) { appendFile(diagnosticPath(), `${new Date().toISOString()} ${message}\n`).catch(() => {}); }

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
    },
    onboarding: {
      defaultLibraryOfferEnabled: true
    }
  };
}

function normalizeLibrary(value) {
  if (!value || !value.root || value.root.type !== "folder") return defaultLibrary();
  return { version: 1, root: value.root };
}

function normalizeYoutubePlaylistUrl(value) {
  const url = new URL(String(value || "").trim());
  const hostname = url.hostname.toLowerCase();
  const isYoutube = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(hostname);
  if (url.protocol !== "https:" || !isYoutube || !url.searchParams.get("list")) {
    throw new Error("Укажите ссылку на плейлист YouTube");
  }
  return url.toString();
}

function normalizeYoutubeUrl(value) {
  const url = new URL(String(value || "").trim());
  const hostname = url.hostname.toLowerCase();
  const isYoutube = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"].includes(hostname);
  if (url.protocol !== "https:" || !isYoutube) throw new Error("Укажите ссылку на YouTube");
  return url.toString();
}

function normalizeSettings(value) {
  const defaults = defaultSettings();
  const onboarding = value?.onboarding || {};
  return {
    ...defaults,
    ...value,
    translation: { ...defaults.translation, ...(value && value.translation) },
    transcription: { ...defaults.transcription, ...(value && value.transcription) },
    onboarding: {
      ...defaults.onboarding,
      ...onboarding,
      defaultLibraryOfferEnabled: onboarding.defaultLibraryOfferEnabled ?? !onboarding.defaultLibraryOfferHandled
    }
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

function videoIds(sourceLibrary) {
  const ids = new Set();
  const visit = node => {
    if (!node || typeof node !== "object") return;
    if (node.type === "video") ids.add(node.id);
    for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
  };
  visit(sourceLibrary?.root);
  return ids;
}

function validateLibraryTree(node) {
  if (!node || typeof node !== "object" || !["folder", "video"].includes(node.type) || typeof node.name !== "string" || !/^[A-Za-z0-9_-]+$/.test(node.id)) return false;
  return node.type !== "folder" || (Array.isArray(node.children) && node.children.every(validateLibraryTree));
}

async function libraryBundle(sourceLibrary = library) {
  const captions = {};
  for (const videoId of videoIds(sourceLibrary)) captions[videoId] = await loadCaptions(videoId);
  return { format: "yt-lang-learning-library", version: 1, library: sourceLibrary, captions };
}

function normalizeLibraryBundle(value) {
  if (!value || value.format !== "yt-lang-learning-library" || value.version !== 1 || !validateLibraryTree(value.library?.root)) {
    throw new Error("Выберите корректный файл экспорта библиотеки YT Lang Learning");
  }
  const nextLibrary = normalizeLibrary(value.library);
  const captions = {};
  for (const videoId of videoIds(nextLibrary)) {
    const item = value.captions?.[videoId] || defaultCaptions();
    captions[videoId] = { version: 1, english: Array.isArray(item.english) ? item.english : [], russian: Array.isArray(item.russian) ? item.russian : [], studiedIds: Array.isArray(item.studiedIds) ? item.studiedIds : [] };
  }
  return { library: nextLibrary, captions };
}

function isLibraryEmpty(sourceLibrary = library) {
  return !Array.isArray(sourceLibrary?.root?.children) || sourceLibrary.root.children.length === 0;
}

async function saveBackup() {
  await mkdir(backupsDirectory(), { recursive: true });
  const fileName = `library-${new Date().toISOString().replace(/[:.]/g, "-")}.ytll-library.json`;
  await writeJson(path.join(backupsDirectory(), fileName), await libraryBundle());
  const backups = (await readdir(backupsDirectory())).filter(name => name.endsWith(".ytll-library.json")).sort().reverse();
  for (const outdated of backups.slice(3)) await rm(path.join(backupsDirectory(), outdated));
}

async function replaceLibraryFromBundle(bundle) {
  const next = normalizeLibraryBundle(bundle);
  for (const [videoId, captions] of Object.entries(next.captions)) await saveCaptions(videoId, captions);
  const oldVideoIds = videoIds(library);
  const nextVideoIds = videoIds(next.library);
  await writeJson(libraryPath(), next.library);
  library = next.library;
  await Promise.all([...oldVideoIds].filter(videoId => !nextVideoIds.has(videoId)).map(videoId => rm(captionsPath(videoId), { force: true })));
  return library;
}

function run(command, args, cwd, onOutput = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" }
    });
    let stderr = "";
    child.stdout.on("data", chunk => onOutput(chunk.toString()));
    child.stderr.on("data", chunk => { const output = chunk.toString(); stderr += output; onOutput(output); });
    child.on("error", error => reject(error));
    child.on("close", code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `${command} завершился с кодом ${code}`)));
  });
}

async function runYtDlp(args, cwd, onOutput = () => {}) {
  try {
    await run(settings.transcription.ytDlpPath, args, cwd, onOutput);
  } catch (error) {
    if (error.code !== "ENOENT" || settings.transcription.ytDlpPath !== "yt-dlp") throw error;
    await run("python", ["-m", "yt_dlp", ...args], cwd, onOutput);
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

async function transcribeEnglishCaptions({ videoId, url }, onProgress = () => {}) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ytll-whisper-"));
  try {
    const sourceTemplate = path.join(temporaryDirectory, "source.%(ext)s");
    const parseDownloadProgress = createProgressParser("download");
    await runYtDlp(downloadVideoArgs(sourceTemplate, url), temporaryDirectory, output => {
      for (const percent of parseDownloadProgress(output)) onProgress({ videoId, stage: "download", percent });
    });
    const downloadedFiles = await readdir(temporaryDirectory);
    const sourceFile = downloadedFiles.find(file => /\.(mp4|mkv|webm|mov|m4v)$/i.test(file));
    if (!sourceFile) throw new Error("Не удалось скачать временное видео для локального распознавания.");

    const inputPath = path.join(temporaryDirectory, sourceFile);
    const outputDirectory = path.join(temporaryDirectory, "results");
    const parseTranscriptionProgress = createProgressParser("transcription");
    onProgress({ videoId, stage: "transcription-start", percent: 0 });
    await run(
      settings.transcription.uvPath,
      transcriberArgs(settings.transcription, inputPath, outputDirectory),
      temporaryDirectory,
      output => {
        for (const percent of parseTranscriptionProgress(output)) onProgress({ videoId, stage: "transcription", percent });
      }
    );

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

async function translateCaptions(videoId, onProgress = () => {}) {
  if (!settings.translation.encryptedApiKey) throw new Error("В настройках не указан ключ OpenRouter.");
  const apiKey = safeStorage.decryptString(Buffer.from(settings.translation.encryptedApiKey, "base64"));
  const captions = await loadCaptions(videoId);
  if (!captions.english.length) throw new Error("Сначала загрузите английские субтитры.");
  captions.english = normalizeCaptionSegments(captions.english);
  const russian = [];
  for (let offset = 0; offset < captions.english.length; offset += 25) {
    const batch = captions.english.slice(offset, offset + 25);
    const translatedById = new Map();
    let missing = batch;
    for (let attempt = 0; attempt < 3 && missing.length; attempt += 1) {
      const requested = missing;
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(90000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": APP_NAME },
        body: JSON.stringify({ model: settings.translation.model, temperature: 0.2, max_tokens: 8192,
          plugins: [{ id: "response-healing" }],
          response_format: { type: "json_schema", json_schema: { name: "caption_translations", strict: true, schema: {
            type: "object", additionalProperties: false, required: ["translations"], properties: {
              translations: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "text"], properties: {
                id: { type: "string" }, text: { type: "string" }
              } } }
            }
          } } },
          messages: [
            { role: "system", content: "Переводи английские субтитры на естественный русский. Верни JSON-объект с полем translations — массивом объектов {id,text}; верни перевод для каждой переданной реплики и сохрани все id." },
            { role: "user", content: JSON.stringify(requested.map(item => ({ id: item.id, text: item.text }))) }
          ]
        })
      });
      if (!response.ok) throw new Error(`OpenRouter ответил с кодом ${response.status}.`);
      const payload = await response.json();
      let translated;
      try {
        translated = translationsFromModel(payload.choices?.[0]?.message?.content);
      } catch (error) {
        if (attempt < 2) continue;
        const reason = payload.choices?.[0]?.finish_reason;
        throw new Error(`${error.message}${reason ? ` Причина завершения: ${reason}.` : ""}`);
      }
      const requestedIds = new Set(requested.map(item => item.id));
      for (const item of translated) {
        const text = String(item?.text || "").trim();
        if (requestedIds.has(item?.id) && text) translatedById.set(item.id, text);
      }
      missing = batch.filter(item => !translatedById.has(item.id));
    }
    if (missing.length) throw new Error(`OpenRouter не перевёл реплики: ${missing.map(item => item.id).join(", ")}.`);
    for (const item of batch) {
      russian.push({ ...item, text: translatedById.get(item.id) });
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

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return { ".css": "text/css", ".html": "text/html", ".ico": "image/x-icon", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" }[extension] || "application/octet-stream";
}

async function startRendererServer() {
  if (rendererServer) return rendererServer.url;
  const root = path.resolve(__dirname);
  rendererServer = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const filePath = path.resolve(root, relativePath);
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) throw new Error("Недопустимый путь");
      response.writeHead(200, { "Content-Type": contentType(filePath), "Cache-Control": "no-store" });
      response.end(await readFile(filePath));
    } catch (error) {
      logDiagnostic(`HTTP ${request.url}: ${error.message}`);
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Не найдено");
    }
  });
  await new Promise((resolve, reject) => {
    rendererServer.once("error", reject);
    rendererServer.listen(0, "127.0.0.1", resolve);
  });
  const address = rendererServer.address();
  rendererServer.url = `http://127.0.0.1:${address.port}/index.html`;
  return rendererServer.url;
}

async function createWindow() {
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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const protocol = new URL(url).protocol;
      if (protocol === "https:" || protocol === "http:") shell.openExternal(url);
    } catch {}
    return { action: "deny" };
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => logDiagnostic(`console[${level}] ${sourceId}:${line} ${message}`));
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => logDiagnostic(`load failed ${errorCode} ${errorDescription}: ${validatedURL}`));
  mainWindow.webContents.on("did-finish-load", () => logDiagnostic(`loaded ${mainWindow.webContents.getURL()}`));
  await mainWindow.webContents.session.clearCache().catch(() => {});
  await mainWindow.loadURL(await startRendererServer());
}

if (require("electron-squirrel-startup")) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    await loadData();
    logDiagnostic(`start ${APP_VERSION}`);

    ipcMain.handle("app:get-info", () => ({ version: APP_VERSION, dataDirectory: dataDirectory() }));
    ipcMain.handle("youtube:get-metadata", async (_event, url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`YouTube ответил с кодом ${response.status}`);
        const metadata = await response.json();
        return { title: metadata.title || "Новый урок" };
      } catch (error) {
        return { title: "Новый урок", warning: error.message };
      }
    });
    ipcMain.handle("youtube:open-playlist", async (_event, url) => {
      const playlistUrl = normalizeYoutubePlaylistUrl(url);
      await shell.openExternal(playlistUrl);
      return { url: playlistUrl };
    });
    ipcMain.handle("youtube:open-external", async (_event, url) => {
      const youtubeUrl = normalizeYoutubeUrl(url);
      await shell.openExternal(youtubeUrl);
      return { url: youtubeUrl };
    });
    ipcMain.handle("openrouter:open-api-keys", async () => {
      const url = "https://openrouter.ai/workspaces/default/keys";
      await shell.openExternal(url);
      return { url };
    });
    ipcMain.handle("library:get", () => library);
    ipcMain.handle("library:save", async (_event, nextLibrary) => {
      library = normalizeLibrary(nextLibrary);
      await writeJson(libraryPath(), library);
      return library;
    });
    ipcMain.handle("library:handle-empty-default", async (_event, shouldPopulate) => {
      if (!isLibraryEmpty() || !settings.onboarding.defaultLibraryOfferEnabled) return { handled: false, library };
      settings.onboarding.defaultLibraryOfferEnabled = false;
      await writeJson(settingsPath(), settings);
      if (!shouldPopulate) return { handled: true, library };
      const bundle = JSON.parse(await readFile(defaultLibraryPath(), "utf8"));
      return { handled: true, library: await replaceLibraryFromBundle(bundle) };
    });
    ipcMain.handle("library:export", async () => {
      const result = await dialog.showSaveDialog(mainWindow, { title: "Экспорт библиотеки", defaultPath: "Моя библиотека.ytll-library.json", filters: [{ name: "Библиотека YT Lang Learning", extensions: ["json"] }] });
      if (result.canceled || !result.filePath) return { canceled: true };
      await writeJson(result.filePath, await libraryBundle());
      return { filePath: result.filePath };
    });
    ipcMain.handle("library:import", async () => {
      const result = await dialog.showOpenDialog(mainWindow, { title: "Импорт библиотеки", properties: ["openFile"], filters: [{ name: "Библиотека YT Lang Learning", extensions: ["json"] }] });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      const imported = JSON.parse(await readFile(result.filePaths[0], "utf8"));
      normalizeLibraryBundle(imported);
      await saveBackup();
      return { library: await replaceLibraryFromBundle(imported) };
    });
    ipcMain.handle("library:restore-latest-backup", async () => {
      let backups;
      try { backups = (await readdir(backupsDirectory())).filter(name => name.endsWith(".ytll-library.json")).sort().reverse(); }
      catch (error) { if (error.code === "ENOENT") backups = []; else throw error; }
      if (!backups.length) return { restored: false };
      const backup = JSON.parse(await readFile(path.join(backupsDirectory(), backups[0]), "utf8"));
      return { restored: true, library: await replaceLibraryFromBundle(backup) };
    });
    ipcMain.handle("captions:get", (_event, videoId) => loadCaptions(videoId));
    ipcMain.handle("captions:save", (_event, videoId, captions) => saveCaptions(videoId, {
      version: 1,
      english: Array.isArray(captions?.english) ? captions.english : [],
      russian: Array.isArray(captions?.russian) ? captions.russian : [],
      studiedIds: Array.isArray(captions?.studiedIds) ? captions.studiedIds : [],
    }));
    ipcMain.handle("captions:download-english", (_event, payload) => oncePerCaptionJob(`youtube:${payload.videoId}`, () => downloadEnglishCaptions(payload)));
    ipcMain.handle("captions:transcribe-english", (event, payload) => oncePerCaptionJob(
      `whisper:${payload.videoId}`,
      () => transcribeEnglishCaptions(payload, progress => event.sender.send("captions:transcription-progress", progress))
    ));
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

    await createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("will-quit", () => { rendererServer?.close(); });
}
