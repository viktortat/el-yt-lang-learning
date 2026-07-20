const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const appSource = readFileSync(require.resolve("./app.js"), "utf8");
const mainSource = readFileSync(require.resolve("./main.js"), "utf8");
const preloadSource = readFileSync(require.resolve("./preload.js"), "utf8");

test("every preload IPC call has exactly one main-process handler", () => {
  const invoked = [...preloadSource.matchAll(/ipcRenderer\.invoke\("([^"]+)"/g)].map(match => match[1]).sort();
  const handled = [...mainSource.matchAll(/ipcMain\.handle\("([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(invoked, handled);
  assert.equal(new Set(handled).size, handled.length);
});

test("external links are opened in the system browser instead of a child window", () => {
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(mainSource, /shell\.openExternal\(url\)/);
  assert.match(mainSource, /return \{ action: "deny" \}/);
});

test("every rendered button id has a renderer binding", () => {
  const ids = [...new Set([...appSource.matchAll(/<button[^>]*\sid="([^"]+)"/g)].map(match => match[1]))];
  const unbound = ids.filter(id => !appSource.includes(`querySelector("#${id}")`));
  assert.deepEqual(unbound, []);
});

test("adding a video uses the app dialog instead of unsupported browser prompts", () => {
  const start = appSource.indexOf("function createVideo()");
  const end = appSource.indexOf("async function importPlaylistVideos", start);
  const createVideoSource = appSource.slice(start, end);
  assert.match(createVideoSource, /dialog\.id = "videoDialog"/);
  assert.doesNotMatch(createVideoSource, /prompt\(/);
});

test("renderer has no placeholder markers", () => {
  assert.doesNotMatch(appSource, /TODO|FIXME|заглушк|станет доступен/i);
});

test("library tree uses the unified SVG icon set instead of unicode glyphs", () => {
  assert.doesNotMatch(appSource, /[▣▷⌄›]/);
  for (const iconName of ["library", "folder", "folderOpen", "video", "folderPlus", "videoPlus"]) {
    assert.match(appSource, new RegExp(`${iconName}:|\\"${iconName}\\"`));
  }
});

test("layout controls do not remount the YouTube player", () => {
  const modeBinding = [...appSource.matchAll(/querySelectorAll\("\[data-mode\]"\)[^\n]+/gi)].map(match => match[0]).find(line => line.includes("addEventListener")) || "";
  const panelStart = appSource.indexOf('collapse.addEventListener("click"');
  const panelBinding = panelStart >= 0 ? appSource.slice(panelStart, panelStart + 320) : "";
  assert.match(modeBinding, /applyPlayerLayout/);
  assert.match(panelBinding, /applyPlayerLayout/);
  assert.doesNotMatch(modeBinding, /render\(/);
  assert.doesNotMatch(panelBinding, /render\(/);
  assert.doesNotMatch(appSource, /data-toggle-panel[^\n]+addEventListener/);
  assert.match(appSource, /querySelectorAll\("\[data-toggle-panel\]"\)\.forEach\(button => button\.remove\(\)\)/);
});

test("changing a YouTube URL starts a fresh caption session before metadata resolves", () => {
  const start = appSource.indexOf("async function playUrl");
  const end = appSource.indexOf("async function addUrlToRoot", start);
  const playUrlSource = appSource.slice(start, end);
  assert.match(playUrlSource, /startCaptionSession\(\)/);
  assert.match(playUrlSource, /loadCaptionsForActive\(true\)/);
  assert.ok(playUrlSource.indexOf("startCaptionSession()") < playUrlSource.indexOf("await titleForUrl"));
});

test("late caption responses are rejected after the active video changes", () => {
  assert.match(appSource, /generation !== state\.captionGeneration/);
  assert.match(appSource, /context\.youtubeId !== activeYoutubeId\(\)/);
});

test("caption downloads are deduplicated and local transcription requires consent", () => {
  assert.match(appSource, /captionDownloads\.has\(context\.key\)/);
  assert.match(appSource, /confirm\("YouTube не отдал английскую дорожку\.[^\n]+faster-whisper\?"\)/);
  assert.match(appSource, /transcribeEnglishCaptions/);
});

test("translation reports progress and is deduplicated per video", () => {
  assert.match(mainSource, /oncePerCaptionJob\(`translate:\$\{videoId\}`/);
  assert.match(mainSource, /captions:translation-progress/);
  assert.match(mainSource, /response_format: \{ type: "json_schema"/);
  assert.match(preloadSource, /onTranslationProgress/);
  assert.match(appSource, /Переведено \$\{progress\.completed\} из \$\{progress\.total\}/);
});

test("local transcription reports progress to the active video", () => {
  assert.match(mainSource, /captions:transcription-progress/);
  assert.match(mainSource, /PYTHONUNBUFFERED: "1"/);
  assert.match(mainSource, /parseDownloadProgress/);
  assert.match(mainSource, /stage: "download"/);
  assert.match(mainSource, /stage: "transcription"/);
  assert.match(preloadSource, /onTranscriptionProgress/);
  assert.match(appSource, /Загружено видео \$\{progress\.percent\}%/);
  assert.match(appSource, /Распознано \$\{progress\.percent\}%/);
});
