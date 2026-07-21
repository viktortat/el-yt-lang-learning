const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const http = require("http");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { existsSync, mkdirSync } = require("fs");
const { appendFile, copyFile, cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } = require("fs/promises");
const { downloadVideoArgs, transcriberArgs, captionsFromTranscript, createProgressParser } = require("./transcription-plan");
const { normalizeCaptionSegments } = require("./caption-parser");
const { translationsFromModel } = require("./translation-response");
const {
  normalizeLanguage, baseLanguage, sameLanguage, normalizeLanguageSettings,
  normalizeLibraryPreferences, emptyCaptionDocument, normalizeCaptionDocument,
  makeTrack, addTrack, preferredTrack
} = require("./language-model");

const APP_NAME = "YT Lang Learning";
const APP_VERSION = app.getVersion();
const APP_TITLE = `${APP_NAME} v${APP_VERSION}`;
const GITHUB_REPO = "viktortat/el-yt-lang-learning";
const GITHUB_API = "https://api.github.com";

const updateState = { available: null, downloading: false, downloadedPath: "", downloadProgress: 0 };

let mainWindow;
let library;
let libraries;
let settings;
let rendererServer;
const captionJobs = new Map();
const captionTrackInfoCache = new Map();
const userDataDirectory = path.join(process.env.LOCALAPPDATA || app.getPath("appData"), APP_NAME);

mkdirSync(userDataDirectory, { recursive: true });
app.setPath("userData", userDataDirectory);
app.commandLine.appendSwitch("disk-cache-dir", path.join(userDataDirectory, "Cache"));

const singleInstanceLock = app.requestSingleInstanceLock();

const updateDirectory = path.join(userDataDirectory, "updates");
if (!singleInstanceLock) app.quit();

function dataDirectory() {
  return app.isPackaged ? app.getPath("userData") : __dirname;
}

function librariesPath() { return path.join(dataDirectory(), "libraries.json"); }
function librariesDirectory() { return path.join(dataDirectory(), "libraries"); }
function libraryDirectory(libraryId = libraries?.activeId) { return path.join(librariesDirectory(), libraryId); }
function libraryPath(libraryId = libraries?.activeId) { return path.join(libraryDirectory(libraryId), "library.json"); }
function defaultLibraryPath() { return path.join(__dirname, "default.ytll-library.json"); }
function settingsPath() { return path.join(dataDirectory(), "settings.json"); }
function captionsPath(videoId, libraryId = libraries?.activeId) { return path.join(libraryDirectory(libraryId), "captions", `${videoId}.json`); }
function backupsDirectory(libraryId = libraries?.activeId) { return path.join(libraryDirectory(libraryId), "backups"); }
function diagnosticPath() { return path.join(app.getPath("userData"), "renderer-debug.log"); }
function logDiagnostic(message) { appendFile(diagnosticPath(), `${new Date().toISOString()} ${message}\n`).catch(() => {}); }

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultLibrary() {
  const preferences = normalizeLibraryPreferences(null, settings?.languages || normalizeLanguageSettings());
  return {
    version: 2,
    preferences,
    root: { id: "root", type: "folder", name: "Моя библиотека", children: [] }
  };
}

function defaultLibraries() {
  const id = "library-default";
  return { version: 1, activeId: id, libraries: [{ id, name: "Моя библиотека", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] };
}

function normalizeLibraries(value) {
  if (!value || !Array.isArray(value.libraries) || !value.libraries.length) return defaultLibraries();
  const items = value.libraries.filter(item => item && /^[A-Za-z0-9_-]+$/.test(item.id) && typeof item.name === "string" && item.name.trim()).map(item => ({
    id: item.id, name: item.name.trim(), createdAt: item.createdAt || new Date().toISOString(), updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
  }));
  if (!items.length) return defaultLibraries();
  return { version: 1, activeId: items.some(item => item.id === value.activeId) ? value.activeId : items[0].id, libraries: items };
}

function defaultSettings() {
  return {
    version: 2,
    theme: "dark",
    languages: normalizeLanguageSettings(),
    translation: {
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
      instruction: "",
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
  return { version: 2, preferences: normalizeLibraryPreferences(value.preferences, settings?.languages || normalizeLanguageSettings()), root: value.root };
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
    version: 2,
    languages: normalizeLanguageSettings(value?.languages),
    translation: { ...defaults.translation, ...(value && value.translation), instruction: String(value?.translation?.instruction || "").trim() },
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

async function copyIfExists(sourcePath, targetPath) {
  if (!await pathExists(sourcePath) || await pathExists(targetPath)) return false;
  await mkdir(path.dirname(targetPath), { recursive: true });
  const sourceStats = await stat(sourcePath);
  if (sourceStats.isDirectory()) {
    await cp(sourcePath, targetPath, { recursive: true, errorOnExist: true, force: false });
  } else {
    await copyFile(sourcePath, targetPath);
  }
  return true;
}

async function oldPackagedDataDirectories() {
  if (!app.isPackaged) return [];
  const currentDirectory = path.dirname(process.execPath);
  const installDirectory = path.dirname(currentDirectory);
  let entries = [];
  try { entries = await readdir(installDirectory, { withFileTypes: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; }

  const directories = [currentDirectory];
  for (const entry of entries) {
    if (entry.isDirectory() && /^app-\d+\.\d+\.\d+/.test(entry.name)) directories.push(path.join(installDirectory, entry.name));
  }
  return [...new Set(directories)].filter(directory => directory !== dataDirectory());
}

async function migratePackagedDataToUserData() {
  if (!app.isPackaged || await pathExists(librariesPath()) || await pathExists(path.join(dataDirectory(), "library.json"))) return;

  const candidates = [];
  for (const directory of await oldPackagedDataDirectories()) {
    const sourceLibraryPath = path.join(directory, "library.json");
    if (await pathExists(sourceLibraryPath)) {
      candidates.push({ directory, modifiedTime: (await stat(sourceLibraryPath)).mtimeMs });
    }
  }
  candidates.sort((left, right) => right.modifiedTime - left.modifiedTime);

  const sourceDirectory = candidates[0]?.directory;
  if (!sourceDirectory) return;

  await copyIfExists(path.join(sourceDirectory, "library.json"), path.join(dataDirectory(), "library.json"));
  await copyIfExists(path.join(sourceDirectory, "settings.json"), settingsPath());
  await copyIfExists(path.join(sourceDirectory, "captions"), path.join(dataDirectory(), "captions"));
  await copyIfExists(path.join(sourceDirectory, "library-backups"), path.join(dataDirectory(), "library-backups"));
  logDiagnostic(`migrated packaged data from ${sourceDirectory}`);
}

async function moveIfExists(source, target) {
  if (!await pathExists(source) || await pathExists(target)) return false;
  await mkdir(path.dirname(target), { recursive: true });
  await rename(source, target);
  return true;
}

async function migrateLegacyLibrary() {
  if (await pathExists(librariesPath())) return;
  const catalog = defaultLibraries();
  const targetDirectory = libraryDirectory(catalog.activeId);
  await mkdir(targetDirectory, { recursive: true });
  await moveIfExists(path.join(dataDirectory(), "library.json"), path.join(targetDirectory, "library.json"));
  await moveIfExists(path.join(dataDirectory(), "captions"), path.join(targetDirectory, "captions"));
  await moveIfExists(path.join(dataDirectory(), "library-backups"), path.join(targetDirectory, "backups"));
  await writeJson(librariesPath(), catalog);
}

async function loadData() {
  await migratePackagedDataToUserData();
  await migrateLegacyLibrary();
  libraries = normalizeLibraries(await readJson(librariesPath(), defaultLibraries));
  await writeJson(librariesPath(), libraries);
  settings = normalizeSettings(await readJson(settingsPath(), defaultSettings));
  library = normalizeLibrary(await readJson(libraryPath(), defaultLibrary));
}

function libraryPreferences(libraryId = libraries.activeId) {
  if (libraryId === libraries.activeId) return library?.preferences || normalizeLibraryPreferences(null, settings.languages);
  return normalizeLibraryPreferences(null, settings.languages);
}
function defaultCaptions(libraryId = libraries?.activeId) { return emptyCaptionDocument(libraryPreferences(libraryId)); }
async function loadCaptions(videoId, libraryId = libraries.activeId) {
  const captions = await readJson(captionsPath(videoId, libraryId), () => defaultCaptions(libraryId));
  return normalizeCaptionDocument(captions, libraryPreferences(libraryId));
}
async function saveCaptions(videoId, captions, libraryId = libraries.activeId) {
  const normalized = normalizeCaptionDocument(captions, libraryPreferences(libraryId));
  await writeJson(captionsPath(videoId, libraryId), normalized);
  return normalized;
}

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

async function libraryBundle(sourceLibrary = library, libraryId = libraries.activeId) {
  const captions = {};
  for (const videoId of videoIds(sourceLibrary)) captions[videoId] = await loadCaptions(videoId, libraryId);
  return { format: "yt-lang-learning-library", version: 2, library: sourceLibrary, captions };
}

function normalizeLibraryBundle(value) {
  if (!value || value.format !== "yt-lang-learning-library" || ![1, 2].includes(value.version) || !validateLibraryTree(value.library?.root)) {
    throw new Error("Выберите корректный файл экспорта библиотеки YT Lang Learning");
  }
  const nextLibrary = normalizeLibrary(value.library);
  const captions = {};
  for (const videoId of videoIds(nextLibrary)) {
    const item = value.captions?.[videoId] || defaultCaptions();
    captions[videoId] = normalizeCaptionDocument(item, nextLibrary.preferences);
  }
  return { library: nextLibrary, captions };
}

function isLibraryEmpty(sourceLibrary = library) {
  return !Array.isArray(sourceLibrary?.root?.children) || sourceLibrary.root.children.length === 0;
}

async function saveBackup(libraryId = libraries.activeId, sourceLibrary = library) {
  await mkdir(backupsDirectory(libraryId), { recursive: true });
  const fileName = `library-${new Date().toISOString().replace(/[:.]/g, "-")}.ytll-library.json`;
  await writeJson(path.join(backupsDirectory(libraryId), fileName), await libraryBundle(sourceLibrary, libraryId));
  const backups = (await readdir(backupsDirectory(libraryId))).filter(name => name.endsWith(".ytll-library.json")).sort().reverse();
  for (const outdated of backups.slice(3)) await rm(path.join(backupsDirectory(libraryId), outdated));
}

async function replaceLibraryFromBundle(bundle, libraryId = libraries.activeId) {
  const next = normalizeLibraryBundle(bundle);
  for (const [videoId, captions] of Object.entries(next.captions)) await saveCaptions(videoId, captions, libraryId);
  const current = libraryId === libraries.activeId ? library : normalizeLibrary(await readJson(libraryPath(libraryId), defaultLibrary));
  const oldVideoIds = videoIds(current);
  const nextVideoIds = videoIds(next.library);
  await writeJson(libraryPath(libraryId), next.library);
  if (libraryId === libraries.activeId) library = next.library;
  await Promise.all([...oldVideoIds].filter(videoId => !nextVideoIds.has(videoId)).map(videoId => rm(captionsPath(videoId, libraryId), { force: true })));
  return next.library;
}

function run(command, args, cwd, onOutput = () => {}, timeout = 0) {
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
    if (timeout > 0) {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`${command} превысил лимит времени (${timeout / 1000} с).`)); }, timeout);
      child.on("close", () => clearTimeout(timer));
    }
  });
}

async function runYtDlp(args, cwd, onOutput = () => {}, timeout = 0) {
  await run(ytDlpExecutable(), args, cwd, onOutput, timeout);
}

function runCapture(command, args, cwd, timeout = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${command} завершился с кодом ${code}`)));
    if (timeout > 0) {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`${command} превысил лимит времени (${timeout / 1000} с).`)); }, timeout);
      child.on("close", () => clearTimeout(timer));
    }
  });
}

function ytDlpExecutable() {
  const configured = String(settings?.transcription?.ytDlpPath || "").trim();
  if (configured && configured !== "yt-dlp") return configured;
  const relativePath = path.join("assets", "bin", "yt-dlp.exe");
  const executablePath = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", relativePath)
    : path.join(__dirname, relativePath);
  if (!existsSync(executablePath)) throw new Error("Встроенный yt-dlp.exe не найден. Переустановите приложение.");
  return executablePath;
}

async function runYtDlpCapture(args, cwd, timeout = 0) {
  return runCapture(ytDlpExecutable(), args, cwd, timeout);
}

async function captionTrackInfo({ url, targetLanguage }) {
  const youtubeUrl = normalizeYoutubeUrl(url);
  const target = normalizeLanguage(targetLanguage, library?.preferences?.studyLanguage || settings.languages.studyLanguage);
  const cacheKey = `${youtubeUrl}\n${target}`;
  const cached = captionTrackInfoCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.value;
  captionTrackInfoCache.delete(cacheKey);
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ytll-caption-info-"));
  try {
    let output;
    try {
      output = await runYtDlpCapture([
        "--skip-download", "--dump-single-json", "--no-warnings", "--ignore-no-formats-error", youtubeUrl
      ], temporaryDirectory, 30000);
    } catch (error) {
      if (/HTTP Error 429/i.test(error.message)) return { status: "rate-limited", sourceLanguage: null, targetLanguage: target, manualTracks: [], hasManualTrack: false, hasAutomaticTrack: false, needsTranslatedAutomaticTrack: false };
      throw error;
    }
    const metadata = JSON.parse(output);
    const manualTracks = Object.keys(metadata.subtitles || {});
    const automaticTracks = Object.keys(metadata.automatic_captions || {});
    const sourceLanguage = normalizeLanguage(metadata.language) || null;
    const hasManualTrack = manualTracks.some(language => sameLanguage(language, target));
    const hasAutomaticTrack = automaticTracks.some(language => sameLanguage(language, target));
    const findTrack = tracks => {
      const language = Object.keys(tracks).find(item => item === target)
        || Object.keys(tracks).find(item => sameLanguage(item, target));
      const formats = language ? tracks[language] : [];
      const format = formats?.find(item => item.ext === "vtt") || formats?.find(item => item.url);
      return format?.url ? { language, url: format.url } : null;
    };
    const manualTrack = findTrack(metadata.subtitles || {});
    const automaticTrack = findTrack(metadata.automatic_captions || {});
    const result = {
      sourceLanguage,
      targetLanguage: target,
      manualTracks,
      hasManualTrack,
      hasAutomaticTrack,
      needsTranslatedAutomaticTrack: !hasManualTrack && hasAutomaticTrack && !!sourceLanguage && !sameLanguage(sourceLanguage, target),
      captionTrack: manualTrack ? { ...manualTrack, source: "youtube-manual" } : automaticTrack ? { ...automaticTrack, source: "youtube-auto" } : null,
      requestHeaders: {
        "User-Agent": metadata.http_headers?.["User-Agent"] || "Mozilla/5.0",
        "Accept-Language": metadata.http_headers?.["Accept-Language"] || "en-US,en;q=0.5"
      }
    };
    captionTrackInfoCache.set(cacheKey, { value: result, expiresAt: Date.now() + 5 * 60 * 1000 });
    return result;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function playlistVideos(url) {
  const playlistUrl = normalizeYoutubePlaylistUrl(url);
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ytll-playlist-"));
  try {
    const output = await runYtDlpCapture([
      "--flat-playlist", "--dump-single-json", "--skip-download", "--no-warnings", playlistUrl
    ], temporaryDirectory, 30000);
    const entries = JSON.parse(output).entries || [];
    const seen = new Set();
    return entries.flatMap(entry => {
      const id = String(entry?.id || "");
      if (!/^[\w-]{11}$/.test(id) || seen.has(id)) return [];
      seen.add(id);
      return [{ id, name: String(entry.title || "Новый урок").trim() || "Новый урок", url: `https://www.youtube.com/watch?v=${id}` }];
    });
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Не удалось прочитать список роликов плейлиста.");
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function seconds(value) {
  const [hours, minutes, rest] = value.trim().replace(",", ".").split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(rest);
}

function parseVtt(content, language = "und") {
  const lines = content.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const segments = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\d{2}:\d{2}:\d{2}[.,]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[.,]\d{3})/);
    if (!match) continue;
    const text = [];
    while (++index < lines.length && lines[index].trim()) text.push(lines[index]);
    const value = text.join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (value && !segments.some(segment => segment.text === value && Math.abs(segment.start - seconds(match[1])) < .1)) {
      segments.push({ id: `${baseLanguage(language) || "seg"}-${segments.length + 1}`, start: seconds(match[1]), end: seconds(match[2]), text: value });
    }
  }
  return normalizeCaptionSegments(segments, baseLanguage(language) || "seg");
}

function nextTrackRevision(captions, language, source) {
  return Object.values(captions.tracks).filter(track => sameLanguage(track.language, language) && track.source === source).reduce((maximum, track) => Math.max(maximum, track.revision), 0) + 1;
}

async function downloadCaptionTrack({ videoId, url, language, libraryId = libraries.activeId, allowTranslatedAutomaticTrack = true }) {
  const targetLanguage = normalizeLanguage(language, libraryPreferences(libraryId).studyLanguage);
  const info = await captionTrackInfo({ url, targetLanguage });
  if (!info.captionTrack) return { status: "missing-track" };
  if (info.needsTranslatedAutomaticTrack && !allowTranslatedAutomaticTrack) return { status: "translated-auto-track-not-approved" };
  const response = await fetch(info.captionTrack.url, { headers: info.requestHeaders, signal: AbortSignal.timeout(30000) });
  if (response.status === 429) return { status: "rate-limited" };
  if (!response.ok) throw new Error(`YouTube не отдал субтитры: HTTP ${response.status}.`);
  const segments = parseVtt(await response.text(), targetLanguage);
  if (!segments.length) throw new Error("В найденной дорожке нет реплик.");
  const captions = await loadCaptions(videoId, libraryId);
  captions.speechLanguage = info.sourceLanguage || captions.speechLanguage || targetLanguage;
  const translated = captions.speechLanguage && !sameLanguage(captions.speechLanguage, targetLanguage);
  const source = translated ? "youtube-translation" : info.captionTrack.source;
  const sourceTrack = translated ? preferredTrack(captions, captions.speechLanguage) : null;
  addTrack(captions, makeTrack({
    language: targetLanguage,
    source,
    kind: translated ? "translation" : "source",
    sourceTrackId: sourceTrack?.id || null,
    revision: nextTrackRevision(captions, targetLanguage, source),
    segments
  }));
  captions.active.studyLanguage ||= targetLanguage;
  return { status: "ok", captions: await saveCaptions(videoId, captions, libraryId) };
}

async function transcribeCaptionTrack({ videoId, url, mediaPath, language = "", libraryId = libraries.activeId }, onProgress = () => {}) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ytll-whisper-"));
  try {
    let inputPath = mediaPath;
    if (!inputPath) {
      const sourceTemplate = path.join(temporaryDirectory, "source.%(ext)s");
      const parseDownloadProgress = createProgressParser("download");
      await runYtDlp(downloadVideoArgs(sourceTemplate, url), temporaryDirectory, output => {
        for (const percent of parseDownloadProgress(output)) onProgress({ videoId, stage: "download", percent });
      }, 120000);
      const downloadedFiles = await readdir(temporaryDirectory);
      const sourceFile = downloadedFiles.find(file => /\.(mp4|mkv|webm|mov|m4v)$/i.test(file));
      if (!sourceFile) throw new Error("Не удалось скачать временное видео для локального распознавания.");
      inputPath = path.join(temporaryDirectory, sourceFile);
    }
    if (/\.(mp3|m4a|wav|flac|ogg)$/i.test(inputPath)) {
      const videoContainer = path.join(temporaryDirectory, "local-audio.mp4");
      await run("ffmpeg", [
        "-y", "-f", "lavfi", "-i", "color=c=black:s=320x240:r=1",
        "-i", inputPath, "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", videoContainer
      ], temporaryDirectory, undefined, 60000);
      inputPath = videoContainer;
    }
    const sourceFile = path.basename(inputPath);
    const outputDirectory = path.join(temporaryDirectory, "results");
    const parseTranscriptionProgress = createProgressParser("transcription");
    onProgress({ videoId, stage: "transcription-start", percent: 0 });
    await run(
      settings.transcription.uvPath,
      transcriberArgs(settings.transcription, inputPath, outputDirectory, normalizeLanguage(language)),
      temporaryDirectory,
      output => {
        for (const percent of parseTranscriptionProgress(output)) onProgress({ videoId, stage: "transcription", percent });
      }
    );

    const transcriptDirectory = path.join(outputDirectory, `${path.parse(sourceFile).name}_transcript`);
    const transcriptPath = path.join(transcriptDirectory, `${path.parse(sourceFile).name}.json`);
    const payload = JSON.parse(await readFile(transcriptPath, "utf8"));
    const detectedLanguage = normalizeLanguage(payload?.language || payload?.info?.language || payload?.metadata?.language || language) || normalizeLanguage(language) || "und";
    const segments = captionsFromTranscript(payload, detectedLanguage);
    if (!segments.length) throw new Error("faster-whisper не распознал речь в видео.");
    const captions = await loadCaptions(videoId, libraryId);
    captions.speechLanguage = detectedLanguage;
    const source = "whisper";
    addTrack(captions, makeTrack({ language: detectedLanguage, source, revision: nextTrackRevision(captions, detectedLanguage, source), confidence: payload?.language_probability ?? payload?.info?.language_probability ?? null, segments }));
    return saveCaptions(videoId, captions, libraryId);
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

async function translateCaptionTrack({ videoId, sourceLanguage, targetLanguage, libraryId = libraries.activeId }, onProgress = () => {}) {
  if (!settings.translation.encryptedApiKey) throw new Error("В настройках не указан ключ OpenRouter.");
  const apiKey = safeStorage.decryptString(Buffer.from(settings.translation.encryptedApiKey, "base64"));
  const captions = await loadCaptions(videoId, libraryId);
  const sourceTrack = preferredTrack(captions, sourceLanguage || captions.active.studyLanguage || captions.speechLanguage);
  const target = normalizeLanguage(targetLanguage, captions.active.translationLanguage);
  if (!sourceTrack?.segments.length) throw new Error("Сначала получите исходную дорожку.");
  const translatedSegments = [];
  const instruction = settings.translation.instruction;
  for (let offset = 0; offset < sourceTrack.segments.length; offset += 25) {
    const batch = sourceTrack.segments.slice(offset, offset + 25);
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
            { role: "system", content: `Переводи субтитры с языка ${sourceTrack.language} на ${target}. Перевод должен быть естественным, без пояснений. Верни JSON-объект с полем translations — массивом объектов {id,text}; верни перевод для каждой переданной реплики и сохрани все id.${instruction ? ` Дополнительная инструкция: ${instruction}` : ""}` },
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
      translatedSegments.push({ ...item, text: translatedById.get(item.id) });
    }
    onProgress({ videoId, completed: translatedSegments.length, total: sourceTrack.segments.length });
  }
  const source = "openrouter";
  addTrack(captions, makeTrack({ language: target, source, kind: "translation", sourceTrackId: sourceTrack.id, revision: nextTrackRevision(captions, target, source), segments: translatedSegments }));
  const savedCaptions = await saveCaptions(videoId, captions, libraryId);
  onProgress({ videoId, completed: translatedSegments.length, total: sourceTrack.segments.length, stage: "completed" });
  return savedCaptions;
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

async function checkForUpdates() {
  try {
    const url = `${GITHUB_API}/repos/${GITHUB_REPO}/releases/latest`;
    const response = await fetch(url, { headers: { Accept: "application/vnd.github.v3+json", "User-Agent": APP_NAME } });
    if (!response.ok) { logDiagnostic(`update check HTTP ${response.status}`); return null; }
    const release = await response.json();
    const tag = String(release.tag_name || "").replace(/^v/, "");
    if (!tag) return null;
    const latest = tag.split(".").map(Number);
    const current = APP_VERSION.split(".").map(Number);
    const isNewer = latest.some((n, i) => n > (current[i] || 0));
    if (!isNewer) return null;
    const asset = (release.assets || []).find(a => /-setup\.exe$/i.test(a.name));
    return { version: tag, body: String(release.body || "").trim(), releaseUrl: release.html_url, asset: asset || null };
  } catch (error) { logDiagnostic(`update check error: ${error.message}`); return null; }
}

function launchInstallerAfterExit(installerPath) {
  const powershellPath = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
  );
  if (!existsSync(powershellPath)) throw new Error("Windows PowerShell не найден");

  const command = "Wait-Process -Id ([int]$env:YTLL_UPDATE_PARENT_PID) -ErrorAction SilentlyContinue; Start-Process -FilePath $env:YTLL_UPDATE_INSTALLER_PATH";
  const launcher = spawn(powershellPath, [
    "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
    "-Command", command
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      YTLL_UPDATE_PARENT_PID: String(process.pid),
      YTLL_UPDATE_INSTALLER_PATH: installerPath
    }
  });
  launcher.unref();
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
  const checkResult = await checkForUpdates();
  if (checkResult) { updateState.available = checkResult; logDiagnostic(`update available: ${checkResult.version}`); }

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
    ipcMain.handle("youtube:playlist-videos", async (_event, url) => playlistVideos(url));
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
    ipcMain.handle("libraries:get", () => libraries);
    ipcMain.handle("libraries:preferences", async () => Object.fromEntries(await Promise.all(libraries.libraries.map(async item => {
      const itemLibrary = item.id === libraries.activeId ? library : normalizeLibrary(await readJson(libraryPath(item.id), defaultLibrary));
      return [item.id, itemLibrary.preferences];
    }))));
    ipcMain.handle("libraries:select", async (_event, libraryId) => {
      if (!libraries.libraries.some(item => item.id === libraryId)) throw new Error("Библиотека не найдена");
      libraries.activeId = libraryId;
      await writeJson(librariesPath(), libraries);
      library = normalizeLibrary(await readJson(libraryPath(libraryId), defaultLibrary));
      return { libraries, library };
    });
    ipcMain.handle("libraries:create", async (_event, name, requestedPreferences) => {
      const trimmed = String(name || "").trim();
      if (!trimmed) throw new Error("Укажите название библиотеки");
      const preferences = normalizeLibraryPreferences(requestedPreferences, settings.languages);
      if (sameLanguage(preferences.studyLanguage, preferences.translationLanguage)) throw new Error("Выберите разные языки для изучения и перевода");
      const item = { id: newId("library"), name: trimmed, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      libraries.libraries.push(item);
      libraries.activeId = item.id;
      library = defaultLibrary();
      library.root.name = trimmed;
      library.preferences = preferences;
      await writeJson(libraryPath(item.id), library);
      await writeJson(librariesPath(), libraries);
      return { libraries, library };
    });
    ipcMain.handle("libraries:rename", async (_event, libraryId, name) => {
      const item = libraries.libraries.find(entry => entry.id === libraryId);
      const trimmed = String(name || "").trim();
      if (!item || !trimmed) throw new Error("Укажите название библиотеки");
      item.name = trimmed;
      item.updatedAt = new Date().toISOString();
      if (libraryId === libraries.activeId) { library.root.name = trimmed; await writeJson(libraryPath(), library); }
      await writeJson(librariesPath(), libraries);
      return libraries;
    });
    ipcMain.handle("libraries:save-preferences", async (_event, libraryId, requestedPreferences) => {
      if (!libraries.libraries.some(item => item.id === libraryId)) throw new Error("Библиотека не найдена");
      const preferences = normalizeLibraryPreferences(requestedPreferences, settings.languages);
      if (sameLanguage(preferences.studyLanguage, preferences.translationLanguage)) throw new Error("Выберите разные языки для изучения и перевода");
      if (libraryId === libraries.activeId) {
        library.preferences = preferences;
        await writeJson(libraryPath(), library);
      } else {
        const itemLibrary = normalizeLibrary(await readJson(libraryPath(libraryId), defaultLibrary));
        itemLibrary.preferences = preferences;
        await writeJson(libraryPath(libraryId), itemLibrary);
      }
      const item = libraries.libraries.find(entry => entry.id === libraryId);
      item.updatedAt = new Date().toISOString();
      await writeJson(librariesPath(), libraries);
      return preferences;
    });
    ipcMain.handle("libraries:delete", async (_event, libraryId) => {
      if (libraries.libraries.length < 2) throw new Error("Нельзя удалить последнюю библиотеку");
      const item = libraries.libraries.find(entry => entry.id === libraryId);
      if (!item) throw new Error("Библиотека не найдена");
      const removedLibrary = normalizeLibrary(await readJson(libraryPath(libraryId), defaultLibrary));
      await saveBackup(libraryId, removedLibrary);
      await shell.trashItem(libraryDirectory(libraryId));
      libraries.libraries = libraries.libraries.filter(entry => entry.id !== libraryId);
      if (libraries.activeId === libraryId) {
        libraries.activeId = libraries.libraries[0].id;
        library = normalizeLibrary(await readJson(libraryPath(), defaultLibrary));
      }
      await writeJson(librariesPath(), libraries);
      return { libraries, library };
    });
    ipcMain.handle("library:save", async (_event, nextLibrary) => {
      library = normalizeLibrary(nextLibrary);
      await writeJson(libraryPath(), library);
      const item = libraries.libraries.find(entry => entry.id === libraries.activeId);
      if (item) { item.updatedAt = new Date().toISOString(); await writeJson(librariesPath(), libraries); }
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
    ipcMain.handle("library:export", async (_event, libraryId = libraries.activeId) => {
      const item = libraries.libraries.find(entry => entry.id === libraryId);
      if (!item) throw new Error("Библиотека не найдена");
      const result = await dialog.showSaveDialog(mainWindow, { title: "Экспорт библиотеки", defaultPath: `${item?.name || "Библиотека"}.ytll-library.json`, filters: [{ name: "Библиотека YT Lang Learning", extensions: ["json"] }] });
      if (result.canceled || !result.filePath) return { canceled: true };
      const sourceLibrary = libraryId === libraries.activeId ? library : normalizeLibrary(await readJson(libraryPath(libraryId), defaultLibrary));
      await writeJson(result.filePath, await libraryBundle(sourceLibrary, libraryId));
      return { filePath: result.filePath };
    });
    ipcMain.handle("library:import", async () => {
      const result = await dialog.showOpenDialog(mainWindow, { title: "Импортировать как новую библиотеку", properties: ["openFile"], filters: [{ name: "Библиотека YT Lang Learning", extensions: ["json"] }] });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      const imported = JSON.parse(await readFile(result.filePaths[0], "utf8"));
      const bundle = normalizeLibraryBundle(imported);
      const item = { id: newId("library"), name: bundle.library.root.name || "Импортированная библиотека", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      libraries.libraries.push(item);
      libraries.activeId = item.id;
      library = defaultLibrary();
      await replaceLibraryFromBundle(imported, item.id);
      library = bundle.library;
      await writeJson(librariesPath(), libraries);
      return { libraries, library };
    });
    ipcMain.handle("library:backups", async () => {
      let backups;
      try { backups = (await readdir(backupsDirectory())).filter(name => name.endsWith(".ytll-library.json")).sort().reverse(); }
      catch (error) { if (error.code === "ENOENT") backups = []; else throw error; }
      return Promise.all(backups.map(async name => ({ name, modifiedAt: (await stat(path.join(backupsDirectory(), name))).mtime.toISOString() })));
    });
    ipcMain.handle("library:restore-backup", async (_event, name) => {
      if (!/^[A-Za-z0-9_.-]+\.ytll-library\.json$/.test(name || "")) throw new Error("Некорректная резервная копия");
      const backupPath = path.join(backupsDirectory(), name);
      if (!await pathExists(backupPath)) throw new Error("Резервная копия не найдена");
      await saveBackup();
      const backup = JSON.parse(await readFile(backupPath, "utf8"));
      return { library: await replaceLibraryFromBundle(backup) };
    });
    ipcMain.handle("captions:get", (_event, videoId, libraryId) => loadCaptions(videoId, libraryId));
    ipcMain.handle("captions:save", (_event, videoId, captions, libraryId) => saveCaptions(videoId, captions, libraryId));
    ipcMain.handle("captions:track-info", (_event, payload) => captionTrackInfo(payload));
    ipcMain.handle("captions:download-track", (_event, payload) => oncePerCaptionJob(`youtube:${payload.libraryId}:${payload.videoId}:${payload.language}`, () => downloadCaptionTrack(payload)));
    ipcMain.handle("captions:select-local-media", async () => {
      const result = await dialog.showOpenDialog(mainWindow, { title: "Выберите видео или аудио", properties: ["openFile"], filters: [{ name: "Медиа", extensions: ["mp4", "mkv", "webm", "mov", "m4v", "mp3", "m4a", "wav", "flac", "ogg"] }] });
      return result.canceled ? null : result.filePaths[0];
    });
    ipcMain.handle("captions:transcribe-track", (event, payload) => oncePerCaptionJob(
      `whisper:${payload.libraryId}:${payload.videoId}`,
      () => transcribeCaptionTrack(payload, progress => event.sender.send("captions:transcription-progress", progress))
    ));
    ipcMain.handle("captions:translate-track", (event, payload) => oncePerCaptionJob(`translate:${payload.libraryId}:${payload.videoId}:${payload.targetLanguage}`, () => translateCaptionTrack(payload, progress => event.sender.send("captions:translation-progress", progress))));
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

    ipcMain.handle("update:check", async () => {
      if (updateState.available) return { status: "available", version: updateState.available.version, body: updateState.available.body };
      const result = await checkForUpdates();
      if (result) updateState.available = result;
      return result ? { status: "available", version: result.version, body: result.body } : { status: "current" };
    });
    ipcMain.handle("update:get-status", () => ({
      downloading: updateState.downloading,
      downloadProgress: updateState.downloadProgress,
      downloadedPath: updateState.downloadedPath,
      available: updateState.available ? { version: updateState.available.version } : null
    }));
    ipcMain.handle("update:download", async event => {
      if (!updateState.available || updateState.downloading) return { ok: false, reason: updateState.downloading ? "already-downloading" : "no-update" };
      updateState.downloading = true;
      updateState.downloadProgress = 0;
      try {
        const asset = updateState.available.asset;
        if (!asset) throw new Error("Ассет установщика не найден");
        const fileName = asset.name;
        const filePath = path.join(updateDirectory, fileName);
        mkdirSync(updateDirectory, { recursive: true });
        const response = await fetch(asset.browser_download_url);
        if (!response.ok) throw new Error("HTTP " + response.status);
        const contentLength = Number(response.headers.get("content-length") || 0);
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (contentLength > 0) {
            updateState.downloadProgress = Math.round((received / contentLength) * 100);
            event.sender.send("update:download-progress", updateState.downloadProgress);
          }
        }
        const buffer = Buffer.concat(chunks);
        await writeFile(filePath, buffer);
        updateState.downloadedPath = filePath;
        updateState.downloadProgress = 100;
        event.sender.send("update:download-progress", 100);
        return { ok: true, filePath };
      } catch (error) {
        logDiagnostic("update download error: " + error.message);
        return { ok: false, reason: error.message };
      } finally {
        updateState.downloading = false;
      }
    });
    ipcMain.handle("update:install", async () => {
      if (!updateState.downloadedPath) return { ok: false, reason: "no-file" };
      try {
        launchInstallerAfterExit(updateState.downloadedPath);
        app.quit();
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error.message };
      }
    });


    await createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("will-quit", () => { rendererServer?.close(); });
}
