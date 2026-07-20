(() => {
  const app = document.querySelector("#app");
  const toast = document.querySelector("#toast");
  const state = { library: null, settings: null, activeTab: "library", settingsSection: "appearance", selectedId: "root", playerVideoId: null, playerUrl: "", previewTitle: "", captions: { english: [], russian: [], studiedIds: [] }, player: null, youTubeReady: false, expanded: new Set(["root"]), layout: JSON.parse(localStorage.getItem("ytll-layout") || '{"mode":"columns","english":true,"russian":true}') };
  state.layout.leftWidth = Number(state.layout.leftWidth) || 320;
  state.layout.rightWidth = Number(state.layout.rightWidth) || 320;
  if (state.layout.mode === "columns" && !state.layout.english && !state.layout.russian) {
    state.layout.english = true;
    state.layout.russian = true;
    localStorage.setItem("ytll-layout", JSON.stringify(state.layout));
  }
  state.follow = { en: true, ru: true };
  state.activeCaptionId = "";
  state.playerGeneration = 0;
  state.captionGeneration = 0;
  state.captionDownloads = new Map();
  state.positionStore = window.PlaybackPosition.createStore(localStorage);
  state.captionTracker = window.CaptionSync.createTimeTracker({
    getPlayer: () => state.player,
    onTime: time => {
      syncCaptionsToTime(time);
      const videoId = activeYoutubeId();
      if (videoId) state.positionStore.save(videoId, time);
    },
  });
  let toastTimer;

  const escapeHtml = value => String(value || "").replace(/[&<>"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[char]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const emptyCaptions = () => ({ english: [], russian: [], studiedIds: [] });
  const newId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const showToast = message => { toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2600); };
  const persistLayout = () => localStorage.setItem("ytll-layout", JSON.stringify(state.layout));
  const youtubeId = value => { try { const url = new URL(value); if (url.hostname.includes("youtu.be")) return url.pathname.slice(1); return url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop(); } catch { return ""; } };
  function activeYoutubeId() {
    const video = state.playerVideoId && state.library ? findNode(state.playerVideoId) : null;
    return youtubeId(video?.type === "video" ? video.url : state.playerUrl);
  }
  function activeCaptionContext() {
    const youtubeVideoId = activeYoutubeId();
    if (!youtubeVideoId) return null;
    const video = state.playerVideoId && state.library ? findNode(state.playerVideoId) : null;
    return {
      key: video?.type === "video" ? video.id : `youtube-${youtubeVideoId}`,
      previewKey: `youtube-${youtubeVideoId}`,
      isLibraryVideo: video?.type === "video",
      url: video?.type === "video" ? video.url : state.playerUrl,
      youtubeId: youtubeVideoId,
    };
  }
  function startCaptionSession() {
    state.captionGeneration += 1;
    state.captions = emptyCaptions();
    state.activeCaptionId = "";
    return state.captionGeneration;
  }
  function saveCurrentPlayerPosition() {
    try {
      const videoId = activeYoutubeId();
      if (videoId && state.player?.getCurrentTime) state.positionStore.save(videoId, state.player.getCurrentTime(), { force: true });
    } catch {}
  }
  const iconPaths = {
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    chevronLeft: '<path d="m15 6-6 6 6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    library: '<path class="icon-fill" d="M4 7.5h16v11H4z"/><path d="M6 4.5h12M3.5 7.5h17v11h-17z"/><path d="M8 11.5h8"/>',
    folder: '<path class="icon-fill" d="M3 7.5h7l1.7 2H21v9H3z"/><path d="M3 18.5v-12h6l2 2H21v10z"/>',
    folderOpen: '<path class="icon-fill" d="M3.5 9h17l-2 9H2z"/><path d="M3 8.5v-2h6l2 2h10l-2.3 10H2.5z"/><path d="M3.5 9h17"/>',
    video: '<rect class="icon-fill" x="3" y="5" width="18" height="14" rx="3"/><rect x="3" y="5" width="18" height="14" rx="3"/><path class="icon-solid" d="m10 9 5 3-5 3z"/>',
    folderPlus: '<path class="icon-fill" d="M3 8h7l1.7 2H21v9H3z"/><path d="M3 18.5v-12h6l2 2H21v10z"/><path d="M12 12v4m-2-2h4"/>',
    videoPlus: '<rect class="icon-fill" x="3" y="5" width="18" height="14" rx="3"/><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M12 9v6m-3-3h6"/>',
    play: '<path class="icon-solid" d="m9 6 9 6-9 6z"/>',
    pause: '<path class="icon-solid" d="M7 6h3v12H7zm7 0h3v12h-3z"/>',
    back: '<path d="M5 7v5h5"/><path d="M5.5 12a7 7 0 1 0 2-5"/>',
    forward: '<path d="M19 7v5h-5"/><path d="M18.5 12a7 7 0 1 1-2-5"/>',
    previous: '<path d="M6 5v14"/><path d="m18 6-7 6 7 6"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    download: '<path d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14"/>',
    externalLink: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    save: '<path d="M5 4h12l3 3v13H4V5a1 1 0 0 1 1-1z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/>',
    edit: '<path d="m5 19 4-.8L19 8.2a2.1 2.1 0 0 0-3-3L6 15l-1 4zM14.5 6.5l3 3"/>',
    trash: '<path d="M4 7h16M10 11v5m4-5v5M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    translate: '<path d="M4 5h8M8 3v2c0 4-2 7-5 9m2-5c2 2 4 3 7 3m3-7h6m-3-2v2c0 4 1.5 7 3 9m-6-4h6"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16"/>',
    center: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8m-8 3h8m-8 3h8"/>',
  };
  const icon = (name, className = "ui-icon") => `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;

  function walk(node, callback, parent = null) { if (callback(node, parent) === false) return false; if (node.type === "folder") for (const child of node.children || []) if (walk(child, callback, node) === false) return false; }
  function findNode(id) { let found; walk(state.library.root, node => { if (node.id === id) { found = node; return false; } }); return found; }
  function findParent(id) { let found; walk(state.library.root, (node, parent) => { if (node.id === id) { found = parent; return false; } }); return found; }
  function selected() { return findNode(state.selectedId) || state.library.root; }
  async function saveLibrary() { state.library = await window.appAPI.saveLibrary(state.library); }
  function directChildren(folder) { return (folder.children || []).filter(child => child.type === "video"); }

  function shell(content) {
    const info = state.info || {};
    return `<section class="shell"><header class="topbar"><div class="brand"><span class="brand-mark">YT</span><span>LANG LEARNING</span></div><nav class="tabs" aria-label="Разделы"><button class="tab ${state.activeTab === "library" ? "active" : ""}" data-tab="library">БИБЛИОТЕКА</button><button class="tab ${state.activeTab === "player" ? "active" : ""}" data-tab="player">ПЛЕЕР</button></nav><div class="top-actions"><button class="icon-button" id="addVideoTop" title="Добавить ролик" aria-label="Добавить ролик">${icon("videoPlus")}</button><button class="icon-button" data-tab="settings" title="Настройки" aria-label="Настройки">⚙</button></div></header>${content}<footer class="statusbar"><b>v${escapeHtml(info.version || "?")}</b> · переносная библиотека · ${escapeHtml(info.dataDirectory || "")}</footer></section>`;
  }

  function renderTreeNode(node, depth = 0) {
    const isFolder = node.type === "folder";
    const expanded = state.expanded.has(node.id);
    const active = node.id === state.selectedId;
    const count = isFolder ? directChildren(node).length : "";
    const children = isFolder && expanded ? (node.children || []).map(child => renderTreeNode(child, depth + 1)).join("") : "";
    const twisty = isFolder
      ? `<button class="twisty" data-toggle="${node.id}" aria-label="${expanded ? "Свернуть" : "Развернуть"} ${escapeHtml(node.name)}">${icon(expanded ? "chevronDown" : "chevronRight", "tree-chevron")}</button>`
      : '<span class="twisty-spacer" aria-hidden="true"></span>';
    const nodeIcon = node.id === "root" ? "library" : isFolder ? (expanded ? "folderOpen" : "folder") : "video";
    return `<div class="tree-node"><div class="tree-row ${active ? "selected" : ""}" draggable="${node.id !== "root"}" data-node-id="${node.id}" style="--depth:${depth}"><span class="tree-indent"></span>${twisty}<span class="node-icon">${icon(nodeIcon, "tree-node-icon")}</span><span class="node-label">${escapeHtml(node.name)}</span>${isFolder ? `<span class="node-meta">${count}</span>` : ""}</div>${children}</div>`;
  }

  function renderLibrary() {
    const node = selected();
    const inspector = node.type === "video" ? renderVideoInspector(node) : renderFolderInspector(node);
    return shell(`<section class="view library-view"><aside class="tree-panel"><header class="tree-header"><div><p class="eyebrow">Рабочая папка</p><h1 class="view-title">Библиотека</h1></div><div class="tree-actions"><button class="icon-button tree-tool" id="newFolder" title="Новая папка" aria-label="Новая папка">${icon("folderPlus")}</button><button class="icon-button tree-tool" id="newVideo" title="Добавить ролик" aria-label="Добавить ролик">${icon("videoPlus")}</button></div></header><div class="tree">${renderTreeNode(state.library.root)}</div></aside><section class="inspector">${inspector}</section></section>`);
  }

  function renderFolderInspector(folder) {
    if (folder.id === "root") return `<div class="inspector-empty"><strong>Соберите свой учебный маршрут</strong><p>Создайте папку для темы или добавьте YouTube-ролик. Двойной клик откроет ролик в плеере.</p><button class="primary" id="newVideoEmpty">Добавить первый ролик</button></div>`;
    const videos = directChildren(folder).length;
    return `<header class="inspector-header"><div><p class="eyebrow">Папка</p><h1 class="view-title">${escapeHtml(folder.name)}</h1></div><span class="node-chip">${videos} роликов</span></header><form class="form folder-form" id="folderForm"><label class="field">YouTube-плейлист<div class="playlist-input"><input name="playlistUrl" value="${escapeHtml(folder.playlistUrl || "")}" placeholder="https://www.youtube.com/watch?v=…&list=…" autocomplete="off" /><button class="subtle-button folder-action" type="button" id="openPlaylist" title="Открыть плейлист в браузере" aria-label="Открыть плейлист в браузере">${icon("externalLink")}</button></div></label><p class="hint">Ссылка сохраняется только для этой папки.</p><div class="form-actions"><button class="primary folder-action" type="submit" title="Сохранить ссылку" aria-label="Сохранить ссылку">${icon("save")}</button><button class="subtle-button folder-action" type="button" data-action="rename" title="Переименовать" aria-label="Переименовать">${icon("edit")}</button><button class="subtle-button folder-action" type="button" data-action="add-video" title="Добавить ролик" aria-label="Добавить ролик">${icon("videoPlus")}</button><button class="subtle-button danger folder-action" type="button" data-action="delete" title="Удалить" aria-label="Удалить">${icon("trash")}</button></div></form>`;
  }

  function renderVideoInspector(video) {
    return `<header class="inspector-header"><div><p class="eyebrow">YouTube-ролик</p><h1 class="view-title">Свойства</h1></div><span class="node-chip">${video.progress?.studied || 0} изучено</span></header><form class="form" id="videoForm"><label class="field">Название<input name="name" value="${escapeHtml(video.name)}" required /></label><label class="field">YouTube URL<input name="url" value="${escapeHtml(video.url || "")}" placeholder="https://www.youtube.com/watch?v=…" required /></label><p class="hint">Название используется только в вашей библиотеке и всегда остаётся редактируемым.</p><div class="form-actions"><button class="primary" type="submit">Сохранить</button><button class="subtle-button" type="button" id="openPlayer">Открыть плеер</button><button class="subtle-button danger" type="button" data-action="delete">Удалить</button></div></form>`;
  }

  function renderPlayer() {
    const video = state.playerVideoId && findNode(state.playerVideoId);
    const hasVideo = video && video.type === "video";
    const activeUrl = hasVideo ? video.url : state.playerUrl;
    const id = youtubeId(activeUrl);
    const mode = state.layout.mode || "columns";
    const player = id ? `<div class="video-frame"><div id="youtubePlayer" aria-label="${escapeHtml(hasVideo ? video.name : state.previewTitle || "YouTube preview")}"></div></div>` : `<div class="video-empty"><strong>${activeUrl ? "Не удалось распознать YouTube-ссылку" : "Вставьте YouTube-ссылку"}</strong><p>${activeUrl ? "Проверьте URL в верхнем поле." : "Нажмите Play, чтобы открыть ролик без сохранения."}</p></div>`;
    const title = hasVideo ? escapeHtml(video.name) : state.previewTitle ? escapeHtml(state.previewTitle) : "Плеер ожидает ролик";
    const url = escapeHtml(activeUrl || "");
    return shell(`<section class="view player-view ${mode === "center" ? "center-mode" : ""}"><header class="player-head"><div><div class="player-title">${title}</div><div class="player-url">${url}</div></div><form class="player-link-form" id="playerLinkForm"><input name="url" value="${url}" placeholder="Вставьте YouTube-ссылку…" autocomplete="off" /><button class="subtle-button" type="submit">▶ Play</button><button class="primary" type="button" id="addRootVideo">＋ В библиотеку</button></form><div class="layout-actions"><button class="mode-button ${mode === "columns" ? "active" : ""}" data-mode="columns">КОЛОНКИ</button><button class="mode-button ${mode === "center" ? "active" : ""}" data-mode="center">ЦЕНТР</button><button class="mode-button" data-toggle-panel="english">EN ${state.layout.english ? "−" : "+"}</button><button class="mode-button" data-toggle-panel="russian">RU ${state.layout.russian ? "−" : "+"}</button></div></header><section class="learning-stage"><aside class="caption-panel ${state.layout.english ? "" : "collapsed"}"><header class="caption-head">English <span>0 / 0</span></header><div class="caption-list"><p class="caption-empty">Английские субтитры появятся после загрузки дорожки или локальной транскрибации.</p></div></aside><section class="video-zone">${player}<div class="center-captions"><b>Субтитры по центру</b>Когда дорожка будет загружена, здесь появится английская реплика и её русский перевод.</div><nav class="study-controls" aria-label="Управление просмотром"><button class="control" data-player="back">↶ 5 сек</button><button class="control" data-player="play">▶ / ❚❚</button><button class="control" data-player="forward">5 сек ↷</button><button class="control" data-player="repeat">↻ реплика</button><span style="width:8px"></span>${["0.5","0.75","1","1.5","2"].map(rate => `<button class="control ${rate === "1" ? "active" : ""}" data-rate="${rate}">${rate}×</button>`).join("")}</nav></section><aside class="caption-panel ${state.layout.russian ? "" : "collapsed"}"><header class="caption-head">Русский <span>0 / 0</span></header><div class="caption-list"><p class="caption-empty">Перевод создаётся вручную через OpenRouter и сохранится рядом с библиотекой.</p></div></aside></section></section>`);
  }

  function captionsMarkup(items, language) {
    if (!items?.length) return `<p class="caption-empty">${language === "en" ? "Английские субтитры ещё не загружены." : "Русский перевод ещё не создан."}</p>`;
    return items.map(item => `<button class="caption-row" data-caption-language="${language}" data-caption-start="${item.start}" data-caption-id="${item.id}"><span>${Math.floor(item.start / 60)}:${String(Math.floor(item.start % 60)).padStart(2, "0")}</span>${escapeHtml(item.text)}</button>`).join("");
  }
  function renderPlayerV2() {
    const video = state.playerVideoId && findNode(state.playerVideoId);
    const hasVideo = video && video.type === "video";
    const activeUrl = hasVideo ? video.url : state.playerUrl;
    const id = youtubeId(activeUrl);
    const mode = state.layout.mode || "columns";
    const title = hasVideo ? escapeHtml(video.name) : state.previewTitle ? escapeHtml(state.previewTitle) : "Плеер ожидает ролик";
    const url = escapeHtml(activeUrl || "");
    const player = id ? `<div class="video-frame"><div id="youtubePlayer" aria-label="${title}"></div></div>` : `<div class="video-empty"><strong>Вставьте YouTube-ссылку</strong><p>Нажмите Play, чтобы открыть ролик без сохранения.</p></div>`;
    const translationReady = state.settings?.translation?.hasApiKey;
    const toolButton = (className, attributes, iconName, label) => `<button class="${className}" ${attributes} title="${label}" aria-label="${label}">${icon(iconName)}</button>`;
    const actions = id ? `${toolButton("mode-button", 'id="loadEnglish"', "download", "Загрузить английские субтитры")}${toolButton(`mode-button ${translationReady ? "" : "needs-key"}`, 'id="translateRussian"', "translate", translationReady ? "Перевести на русский" : "Настроить ключ OpenRouter")}` : "";
    const playbackControls = `${toolButton("control", 'data-player="back"', "back", "Назад на 5 секунд")}${toolButton("control", 'data-player="play"', "play", "Воспроизвести или поставить на паузу")}${toolButton("control", 'data-player="forward"', "forward", "Вперёд на 5 секунд")}<span class="controls-divider" aria-hidden="true"></span>${toolButton("control", 'data-player="previous"', "previous", "Повторить предыдущую реплику")}${toolButton("control", 'data-player="repeat"', "repeat", "Повторить текущую реплику")}`;
    return shell(`<section class="view player-view ${mode === "center" ? "center-mode" : ""}"><header class="player-head"><div class="player-url">${url}</div><form class="player-link-form" id="playerLinkForm"><input name="url" value="${url}" placeholder="Вставьте YouTube-ссылку…" autocomplete="off" />${toolButton("subtle-button", 'type="submit"', "play", "Открыть ролик")}${toolButton("primary", 'type="button" id="addRootVideo"', "videoPlus", "Сохранить ролик в библиотеку")}</form><div class="layout-actions">${actions}</div></header><section class="learning-stage"><aside class="caption-panel ${state.layout.english ? "" : "collapsed"}"><header class="caption-head">English <span>${state.captions.english.length}</span></header><div class="caption-list">${captionsMarkup(state.captions.english, "en")}</div></aside><section class="video-zone"><h1 class="player-title">${title}</h1>${player}<div class="center-captions"><b>${state.captions.english[0]?.text || "Субтитры по центру"}</b>${state.captions.russian[0]?.text || "Загрузите английскую дорожку и создайте перевод."}</div><nav class="study-controls" aria-label="Управление просмотром">${playbackControls}<span class="controls-divider" aria-hidden="true"></span>${["0.5","0.75","1","1.5","2"].map(rate => `<button class="control rate-control ${rate === "1" ? "active" : ""}" data-rate="${rate}" aria-label="Скорость ${rate}">${rate}×</button>`).join("")}</nav></section><aside class="caption-panel ${state.layout.russian ? "" : "collapsed"}"><header class="caption-head">Русский <span>${state.captions.russian.length}</span></header><div class="caption-list">${captionsMarkup(state.captions.russian, "ru")}</div></aside></section></section>`);
  }
  function renderSettings() {
    const s = state.settings; const t = s.translation; const tr = s.transcription;
    const selected = state.settingsSection;
    const menuItem = (id, label) => `<button type="button" class="settings-nav-item ${selected === id ? "active" : ""}" data-settings-section="${id}" aria-current="${selected === id ? "page" : "false"}">${label}</button>`;
    return shell(`<section class="view settings-view"><form class="settings-layout" id="settingsForm"><aside class="settings-nav" aria-label="Разделы настроек"><p class="settings-nav-label">Настройки</p>${menuItem("appearance", "Внешний вид")}${menuItem("translation", "Перевод OpenRouter")}${menuItem("transcription", "Локальная транскрибация")}</aside><main class="settings-main"><header class="settings-head"><div><p class="eyebrow">Настройки</p><h1 class="view-title">Локальная конфигурация</h1><p class="hint">Файлы настроек сохраняются рядом с переносным приложением.</p></div><div class="settings-actions"><button type="button" class="subtle-button" id="resetSettings">Сбросить</button><button class="primary" type="submit">Сохранить настройки</button></div></header><section class="settings-group ${selected === "appearance" ? "active" : ""}" data-settings-panel="appearance"><h2>Внешний вид</h2><label class="settings-row"><span><strong>Тема</strong><small>Светлая или тёмная оболочка.</small></span><select name="theme"><option value="dark" ${s.theme === "dark" ? "selected" : ""}>Тёмная</option><option value="light" ${s.theme === "light" ? "selected" : ""}>Светлая</option></select></label></section><section class="settings-group ${selected === "translation" ? "active" : ""}" data-settings-panel="translation"><h2>Перевод OpenRouter</h2><label class="settings-row"><span><strong>API-ключ</strong><small>${t.hasApiKey ? "Ключ сохранён в зашифрованном виде. Оставьте пустым, чтобы не менять." : "Ключ ещё не сохранён."}</small></span><input name="apiKey" type="password" placeholder="sk-or-v1-…" /></label><label class="settings-row"><span><strong>Модель перевода</strong><small>Используется для пакетного перевода реплик.</small></span><input name="model" value="${escapeHtml(t.model)}" /></label></section><section class="settings-group ${selected === "transcription" ? "active" : ""}" data-settings-panel="transcription"><h2>Локальная транскрибация</h2><label class="settings-row"><span><strong>Каталог моделей</strong><small>Уже скачанная модель faster-whisper.</small></span><input name="modelRoot" value="${escapeHtml(tr.modelRoot)}" /></label><label class="settings-row"><span><strong>Модель</strong><small>Используется только после согласия на локальную транскрибацию.</small></span><input name="whisperModel" value="${escapeHtml(tr.model)}" /></label><label class="settings-row"><span><strong>Команда uv</strong><small>Запускает независимый скрипт транскрибации.</small></span><input name="uvPath" value="${escapeHtml(tr.uvPath)}" /></label><label class="settings-row"><span><strong>Команда yt-dlp</strong><small>Временно скачивает аудио только с подтверждения пользователя.</small></span><input name="ytDlpPath" value="${escapeHtml(tr.ytDlpPath)}" /></label></section></main></form></section>`);
  }

  function currentCaption(time) {
    return window.CaptionSync.findCurrentCaption(state.captions.english || [], Number(time));
  }

  function scrollCaptionIntoView(language, captionId, smooth = true) {
    const list = document.querySelector(`.caption-list[data-language="${language}"]`);
    const row = list?.querySelector(`[data-caption-id="${captionId}"]`);
    if (!list || !row) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const top = window.CaptionSync.centeredScrollTop({
      scrollTop: list.scrollTop,
      viewportTop: listRect.top,
      viewportHeight: list.clientHeight,
      rowTop: rowRect.top,
      rowHeight: rowRect.height,
      scrollHeight: list.scrollHeight,
    });
    list.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }

  function setFollow(language, enabled) {
    state.follow[language] = enabled;
    const button = document.querySelector(`[data-follow="${language}"]`);
    button?.classList.toggle("visible", !enabled);
    if (enabled && state.activeCaptionId) scrollCaptionIntoView(language, state.activeCaptionId, false);
  }

  function syncCaptionsToTime(time) {
    const active = currentCaption(time);
    const captionId = active?.id || "";
    const changed = captionId !== state.activeCaptionId;
    const renderedActiveId = document.querySelector(".caption-row.active")?.dataset.captionId || "";
    const needsPositionRestore = captionId && renderedActiveId !== captionId;
    state.activeCaptionId = captionId;
    document.querySelectorAll(".caption-row").forEach(row => row.classList.toggle("active", row.dataset.captionId === captionId));
    const center = document.querySelector(".center-captions");
    if (center && active) {
      const translated = state.captions.russian.find(item => item.id === captionId);
      center.innerHTML = `<b>${escapeHtml(active.text)}</b>${escapeHtml(translated?.text || "")}`;
    }
    if ((!changed && !needsPositionRestore) || !captionId) return;
    if (state.follow.en) scrollCaptionIntoView("en", captionId, false);
    if (state.follow.ru) scrollCaptionIntoView("ru", captionId, false);
  }

  function stopCaptionSync() {
    state.captionTracker.stop();
  }

  function startCaptionSync() {
    state.captionTracker.start();
  }

  function setupCaptionPanels() {
    document.querySelectorAll("[data-toggle-panel]").forEach(button => button.remove());
    const panels = document.querySelectorAll(".caption-panel");
    [[panels[0], "en"], [panels[1], "ru"]].forEach(([panel, language]) => {
      if (!panel) return;
      const list = panel.querySelector(".caption-list");
      const head = panel.querySelector(".caption-head");
      if (!list || !head) return;
      list.dataset.language = language;
      const panelKey = language === "en" ? "english" : "russian";
      const collapse = document.createElement("button");
      collapse.type = "button";
      collapse.className = "panel-collapse";
      collapse.dataset.panelCollapse = panelKey;
      collapse.addEventListener("click", () => {
        state.layout[panelKey] = !state.layout[panelKey];
        persistLayout();
        applyPlayerLayout();
      });
      const follow = document.createElement("button");
      follow.type = "button";
      follow.className = `follow-caption${state.follow[language] ? "" : " visible"}`;
      follow.dataset.follow = language;
      follow.textContent = "К текущей реплике";
      follow.addEventListener("click", () => setFollow(language, true));
      if (language === "en") head.prepend(collapse);
      head.append(follow);
      if (language === "ru") head.append(collapse);
      list.addEventListener("wheel", () => setFollow(language, false), { passive: true });
      list.addEventListener("touchmove", () => setFollow(language, false), { passive: true });
      list.addEventListener("pointerdown", event => {
        const bounds = list.getBoundingClientRect();
        if (event.clientX >= bounds.right - 18) setFollow(language, false);
      });
    });
  }

  function applyPlayerLayout() {
    const view = document.querySelector(".player-view");
    const stage = document.querySelector(".learning-stage");
    const panels = stage?.querySelectorAll(".caption-panel");
    if (!view || !stage || panels?.length < 2) return;

    view.classList.toggle("center-mode", state.layout.mode === "center");
    panels[0].classList.toggle("collapsed", !state.layout.english);
    panels[1].classList.toggle("collapsed", !state.layout.russian);
    stage.style.gridTemplateColumns = window.PlayerLayout.gridTemplate(state.layout);
    // Свёрнутая колонка остаётся доступной для обратного раскрытия.
    stage.style.setProperty("--left-width", state.layout.english ? `${state.layout.leftWidth}px` : "42px");
    stage.style.setProperty("--right-width", state.layout.russian ? `${state.layout.rightWidth}px` : "42px");
    stage.style.setProperty("--left-handle", state.layout.english ? "6px" : "0px");
    stage.style.setProperty("--right-handle", state.layout.russian ? "6px" : "0px");
    stage.querySelector('[data-resize-panel="left"]')?.toggleAttribute("hidden", !state.layout.english);
    stage.querySelector('[data-resize-panel="right"]')?.toggleAttribute("hidden", !state.layout.russian);
    document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === state.layout.mode));
    document.querySelectorAll("[data-panel-collapse]").forEach(button => {
      const key = button.dataset.panelCollapse;
      const isLeft = key === "english";
      const expanded = state.layout[key];
      const direction = isLeft ? (expanded ? "chevronLeft" : "chevronRight") : (expanded ? "chevronRight" : "chevronLeft");
      const label = `${expanded ? "Свернуть" : "Развернуть"} ${isLeft ? "английские" : "русские"} субтитры`;
      button.innerHTML = icon(direction, "panel-chevron");
      button.title = label;
      button.setAttribute("aria-label", label);
    });
  }

  function setupPanelResizers() {
    const stage = document.querySelector(".learning-stage");
    const panels = stage?.querySelectorAll(".caption-panel");
    const video = stage?.querySelector(".video-zone");
    if (!stage || panels?.length < 2 || !video) return;
    stage.classList.add("resizable-columns");
    const leftHandle = document.createElement("div");
    const rightHandle = document.createElement("div");
    leftHandle.className = "panel-resizer";
    rightHandle.className = "panel-resizer";
    leftHandle.dataset.resizePanel = "left";
    rightHandle.dataset.resizePanel = "right";
    panels[0].after(leftHandle);
    video.after(rightHandle);

    applyPlayerLayout();

    [leftHandle, rightHandle].forEach(handle => {
      handle.addEventListener("dblclick", () => {
        if (handle.dataset.resizePanel === "left") state.layout.leftWidth = 320;
        else state.layout.rightWidth = 320;
        applyPlayerLayout();
        persistLayout();
      });
      handle.addEventListener("pointerdown", event => {
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add("resizing-panels");
        const startX = event.clientX;
        const startWidth = handle.dataset.resizePanel === "left" ? state.layout.leftWidth : state.layout.rightWidth;
        const onMove = moveEvent => {
          const delta = moveEvent.clientX - startX;
          const otherWidth = handle.dataset.resizePanel === "left"
            ? (state.layout.russian ? state.layout.rightWidth : 0)
            : (state.layout.english ? state.layout.leftWidth : 0);
          const maxWidth = Math.max(180, Math.min(600, stage.clientWidth - otherWidth - 410));
          const next = Math.max(180, Math.min(maxWidth, startWidth + (handle.dataset.resizePanel === "left" ? delta : -delta)));
          if (handle.dataset.resizePanel === "left") state.layout.leftWidth = next;
          else state.layout.rightWidth = next;
          applyPlayerLayout();
        };
        const onUp = () => {
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          document.body.classList.remove("resizing-panels");
          persistLayout();
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
      });
    });
  }

  function mountPlayer() {
    const video = state.playerVideoId && findNode(state.playerVideoId);
    const host = document.querySelector("#youtubePlayer");
    const id = youtubeId(video?.type === "video" ? video.url : state.playerUrl);
    const generation = ++state.playerGeneration;
    state.player = null;
    stopCaptionSync();
    if (!host || !id) return;
    if (!window.YT?.Player) {
      setTimeout(() => {
        if (generation !== state.playerGeneration || !host.isConnected || window.YT?.Player) return;
        const source = `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
        host.innerHTML = `<iframe src="${source}" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      }, 1500);
      return;
    }
    const player = new window.YT.Player("youtubePlayer", {
      videoId: id,
      playerVars: { origin: window.location.origin, rel: 0, modestbranding: 1 },
      events: {
        onReady: event => {
          if (generation !== state.playerGeneration) return;
          state.player = event.target;
          const savedTime = state.positionStore.get(id);
          if (savedTime > 0.25) event.target.seekTo(savedTime, true);
          state.captionTracker.tick();
        },
        onStateChange: event => {
          if (generation !== state.playerGeneration) return;
          state.player = event.target;
          state.captionTracker.tick();
        },
      },
    });
    state.player = player;
    startCaptionSync();
  }
  function render() { if (state.activeTab !== "player") { saveCurrentPlayerPosition(); state.playerGeneration += 1; state.player = null; stopCaptionSync(); } document.documentElement.dataset.theme = state.settings?.theme || "dark"; app.innerHTML = state.activeTab === "library" ? renderLibrary() : state.activeTab === "player" ? renderPlayerV2() : renderSettings(); bindEvents(); if (state.activeTab === "player") { setupCaptionPanels(); setupPanelResizers(); mountPlayer(); } }
  function openPlayer(video) {
    saveCurrentPlayerPosition();
    state.playerVideoId = video.id;
    state.playerUrl = "";
    state.previewTitle = "";
    state.activeTab = "player";
    startCaptionSession();
    render();
    loadCaptionsForActive(true);
  }
  async function loadCaptionsForActive(automaticDownload = false) {
    const context = activeCaptionContext();
    if (!context) return;
    const generation = state.captionGeneration;
    try {
      let captions = await window.appAPI.getCaptions(context.key);
      if (context.isLibraryVideo && (!captions.english.length || !captions.russian.length)) {
        const previewCaptions = await window.appAPI.getCaptions(context.previewKey);
        const merged = {
          ...captions,
          english: captions.english.length ? captions.english : previewCaptions.english,
          russian: captions.russian.length ? captions.russian : previewCaptions.russian,
          studiedIds: captions.studiedIds?.length ? captions.studiedIds : previewCaptions.studiedIds,
        };
        if (merged.english.length !== captions.english.length || merged.russian.length !== captions.russian.length) {
          captions = await window.appAPI.saveCaptions(context.key, merged);
        }
      }
      if (generation !== state.captionGeneration || context.youtubeId !== activeYoutubeId()) return;
      state.captions = captions;
      render();
      if (automaticDownload && !captions.english.length) downloadEnglishForActive(false, generation);
    } catch (error) {
      if (generation === state.captionGeneration) showToast(error.message);
    }
  }
  async function downloadEnglishForActive(confirmDownload = true, expectedGeneration = state.captionGeneration) {
    const context = activeCaptionContext();
    if (!context) return;
    if (state.captionDownloads.has(context.key)) return state.captionDownloads.get(context.key);
    if (confirmDownload && !confirm("Загрузить доступные английские субтитры с YouTube?")) return;
    const job = (async () => {
      try {
        showToast("Загружаю английские субтитры…");
        const result = await window.appAPI.downloadEnglishCaptions({ videoId: context.key, url: context.url });
        if (expectedGeneration !== state.captionGeneration || context.youtubeId !== activeYoutubeId()) return;
        let captions = result.captions;
        if (result.status === "missing-track") {
          const approved = confirm("YouTube не отдал английскую дорожку. Скачать временное видео и распознать речь локально через faster-whisper?");
          if (!approved) { showToast("Локальное распознавание отменено"); return; }
          showToast("Скачиваю временное видео и запускаю faster-whisper…");
          captions = await window.appAPI.transcribeEnglishCaptions({ videoId: context.key, url: context.url });
          if (expectedGeneration !== state.captionGeneration || context.youtubeId !== activeYoutubeId()) return;
        }
        state.captions = captions;
        render();
        showToast(`Загружено реплик: ${state.captions.english.length}`);
      } catch (error) {
        if (expectedGeneration === state.captionGeneration) showToast(error.message);
      }
    })();
    state.captionDownloads.set(context.key, job);
    try { return await job; }
    finally { if (state.captionDownloads.get(context.key) === job) state.captionDownloads.delete(context.key); }
  }
  async function translateActiveCaptions() {
    const context = activeCaptionContext();
    if (!context) return;
    if (!state.settings?.translation?.hasApiKey) { state.activeTab = "settings"; render(); showToast("Введите и сохраните ключ OpenRouter"); return; }
    const generation = state.captionGeneration;
    try {
      showToast("Перевожу субтитры через OpenRouter…");
      const captions = await window.appAPI.translateCaptions(context.key);
      if (generation !== state.captionGeneration || context.youtubeId !== activeYoutubeId()) return;
      state.captions = captions;
      render();
      showToast("Русский перевод готов");
    } catch (error) {
      if (generation === state.captionGeneration) {
        await loadCaptionsForActive(false);
        showToast(error.message);
      }
    }
  }
  async function titleForUrl(url) { const result = await window.appAPI.getYoutubeMetadata(url); if (result.warning) showToast("Не удалось получить название; будет использовано «Новый урок»"); return result.title || "Новый урок"; }
  async function playUrl(url) {
    const cleanUrl = url?.trim();
    if (!youtubeId(cleanUrl)) { showToast("Вставьте корректную YouTube-ссылку"); return; }
    saveCurrentPlayerPosition();
    state.playerVideoId = null;
    state.playerUrl = cleanUrl;
    state.previewTitle = "Загрузка названия…";
    const generation = startCaptionSession();
    render();
    loadCaptionsForActive(true);
    const title = await titleForUrl(cleanUrl);
    if (generation !== state.captionGeneration || youtubeId(cleanUrl) !== activeYoutubeId()) return;
    state.previewTitle = title;
    const titleElement = document.querySelector(".player-title");
    if (titleElement) titleElement.textContent = title;
  }
  async function addUrlToRoot(url) {
    const cleanUrl = url?.trim();
    const targetYoutubeId = youtubeId(cleanUrl);
    if (!targetYoutubeId) { showToast("Вставьте корректную YouTube-ссылку"); return; }
    const captionsToKeep = targetYoutubeId === activeYoutubeId() ? clone(state.captions) : emptyCaptions();
    const video = { id: newId("video"), type: "video", name: "Новый урок", url: cleanUrl, createdAt: new Date().toISOString(), progress: { studied: 0, position: 0 } };
    state.library.root.children.push(video);
    await saveLibrary();
    if (captionsToKeep.english.length || captionsToKeep.russian.length) await window.appAPI.saveCaptions(video.id, captionsToKeep);
    saveCurrentPlayerPosition();
    state.selectedId = video.id;
    state.playerVideoId = video.id;
    state.playerUrl = "";
    state.previewTitle = "";
    startCaptionSession();
    render();
    showToast("Ролик и его субтитры сохранены в библиотеке");
    loadCaptionsForActive(true);
    // Метаданные необязательны: сохранение ролика не ждёт ответа сети.
    titleForUrl(cleanUrl).then(async title => {
      const savedVideo = findNode(video.id);
      if (!savedVideo || savedVideo.name !== "Новый урок" || title === "Новый урок") return;
      savedVideo.name = title;
      await saveLibrary();
      if (state.playerVideoId === savedVideo.id) {
        const titleElement = document.querySelector(".player-title");
        if (titleElement) titleElement.textContent = title;
      }
    }).catch(() => {});
  }
  function targetFolder() { const node = selected(); return node.type === "folder" ? node : findParent(node.id) || state.library.root; }
  function closeFolderDialog() { document.querySelector("#folderDialog")?.remove(); }
  function createFolder() {
    if (document.querySelector("#folderDialog")) return;
    const dialog = document.createElement("div");
    dialog.className = "dialog-backdrop";
    dialog.id = "folderDialog";
    dialog.innerHTML = `<form class="dialog-card" aria-labelledby="folderDialogTitle"><h2 id="folderDialogTitle">Новая папка</h2><label class="field">Название папки<input name="name" autocomplete="off" required /></label><div class="form-actions"><button class="subtle-button" type="button" data-dialog-cancel>Отмена</button><button class="primary" type="submit">Создать</button></div></form>`;
    const form = dialog.querySelector("form");
    const input = form.elements.name;
    dialog.addEventListener("click", event => { if (event.target === dialog) closeFolderDialog(); });
    dialog.querySelector("[data-dialog-cancel]").addEventListener("click", closeFolderDialog);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      const folder = targetFolder();
      const child = { id: newId("folder"), type: "folder", name, children: [] };
      folder.children ||= [];
      folder.children.push(child);
      try {
        await saveLibrary();
        closeFolderDialog();
        state.expanded.add(folder.id);
        render();
        showToast("Папка создана");
      } catch (error) {
        folder.children = folder.children.filter(item => item !== child);
        showToast(`Не удалось создать папку: ${error.message}`);
      }
    });
    document.body.append(dialog);
    input.focus();
  }
  async function createVideo() { const url = prompt("Вставьте YouTube URL:"); if (!url?.trim()) return; const name = prompt("Название ролика:", "Новый урок") || "Новый урок"; const folder = targetFolder(); folder.children ||= []; const video = { id: newId("video"), type: "video", name: name.trim(), url: url.trim(), createdAt: new Date().toISOString(), progress: { studied: 0, position: 0 } }; folder.children.push(video); await saveLibrary(); state.selectedId = video.id; render(); }
  async function renameSelected() { const node = selected(); if (node.id === "root") return; const name = prompt("Новое название:", node.name); if (!name?.trim()) return; node.name = name.trim(); await saveLibrary(); render(); }
  async function deleteSelected() { const node = selected(); if (node.id === "root") return; if (!confirm(`Удалить «${node.name}» из библиотеки?`)) return; const parent = findParent(node.id); parent.children = parent.children.filter(child => child.id !== node.id); state.selectedId = parent.id; if (state.playerVideoId === node.id) state.playerVideoId = null; await saveLibrary(); render(); }
  function closeContextMenu() { document.querySelector(".context-menu")?.remove(); }
  function showContextMenu(event, nodeId) {
    event.preventDefault(); closeContextMenu(); state.selectedId = nodeId;
    const node = findNode(nodeId);
    const menu = document.createElement("div"); menu.className = "context-menu"; menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`; menu.style.top = `${Math.min(event.clientY, window.innerHeight - 165)}px`;
    menu.innerHTML = `<button data-menu="folder">Новая папка</button><button data-menu="video">Добавить ролик</button><button data-menu="rename">Переименовать</button>${node.id === "root" ? "" : '<button class="danger" data-menu="delete">Удалить</button>'}`;
    menu.addEventListener("click", item => { const action = item.target.dataset.menu; closeContextMenu(); if (action === "folder") createFolder(); if (action === "video") createVideo(); if (action === "rename") renameSelected(); if (action === "delete") deleteSelected(); });
    document.body.append(menu);
  }
  function playerCommand(command, value) {
    const result = window.PlayerControls.execute({ player: state.player, command, value, captions: state.captions.english });
    if (!result.ok) showToast(result.message);
    return result.ok;
  }

  function bindEvents() {
    document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => { state.activeTab = button.dataset.tab; render(); }));
    document.querySelector("#newFolder")?.addEventListener("click", createFolder); document.querySelector("#newVideo")?.addEventListener("click", createVideo); document.querySelector("#newVideoEmpty")?.addEventListener("click", createVideo); document.querySelector("#addVideoTop")?.addEventListener("click", createVideo);
    document.querySelectorAll("[data-toggle]").forEach(button => button.addEventListener("click", event => { event.stopPropagation(); const id = button.dataset.toggle; if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id); render(); }));
    document.querySelectorAll(".tree-row").forEach(row => { row.addEventListener("click", () => { state.selectedId = row.dataset.nodeId; render(); }); row.addEventListener("dblclick", () => { const node = findNode(row.dataset.nodeId); if (node.type === "video") openPlayer(node); }); row.addEventListener("contextmenu", event => showContextMenu(event, row.dataset.nodeId)); row.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", row.dataset.nodeId)); row.addEventListener("dragover", event => { const node = findNode(row.dataset.nodeId); if (node.type === "folder") { event.preventDefault(); row.classList.add("drag-over"); } }); row.addEventListener("dragleave", () => row.classList.remove("drag-over")); row.addEventListener("drop", async event => { event.preventDefault(); row.classList.remove("drag-over"); const target = findNode(row.dataset.nodeId); const moving = findNode(event.dataTransfer.getData("text/plain")); if (!moving || target.type !== "folder" || moving.id === target.id) return; const source = findParent(moving.id); if (source?.id === moving.id || moving.type === "folder") { let parent = target; while (parent) { if (parent.id === moving.id) return; parent = findParent(parent.id); } } source.children = source.children.filter(child => child.id !== moving.id); target.children ||= []; target.children.push(moving); state.expanded.add(target.id); await saveLibrary(); render(); }); });
    document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => { const action = button.dataset.action; if (action === "rename") renameSelected(); if (action === "delete") deleteSelected(); if (action === "add-video") createVideo(); }));
    document.querySelector("#folderForm")?.addEventListener("submit", async event => { event.preventDefault(); const folder = selected(); folder.playlistUrl = new FormData(event.currentTarget).get("playlistUrl").trim(); await saveLibrary(); showToast("Ссылка на плейлист сохранена"); render(); });
    document.querySelector("#openPlaylist")?.addEventListener("click", async () => { const url = document.querySelector("#folderForm [name=playlistUrl]").value.trim(); if (!url) return showToast("Вставьте ссылку на плейлист YouTube"); try { await window.appAPI.openPlaylist(url); } catch (error) { showToast(error.message); } });
    document.querySelector("#videoForm")?.addEventListener("submit", async event => { event.preventDefault(); const data = new FormData(event.currentTarget); const video = selected(); video.name = data.get("name").trim(); video.url = data.get("url").trim(); await saveLibrary(); showToast("Свойства ролика сохранены"); render(); }); document.querySelector("#openPlayer")?.addEventListener("click", () => openPlayer(selected()));
    document.querySelector("#playerLinkForm")?.addEventListener("submit", event => { event.preventDefault(); playUrl(new FormData(event.currentTarget).get("url")); });
    document.querySelector("#addRootVideo")?.addEventListener("click", () => addUrlToRoot(new FormData(document.querySelector("#playerLinkForm")).get("url")));
    document.querySelector("#loadEnglish")?.addEventListener("click", () => downloadEnglishForActive());
    document.querySelector("#translateRussian")?.addEventListener("click", translateActiveCaptions);
    document.querySelectorAll("[data-caption-start]").forEach(button => button.addEventListener("click", () => playerCommand("seek", button.dataset.captionStart)));
    document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => { state.layout.mode = button.dataset.mode; if (state.layout.mode === "columns") { state.layout.english = true; state.layout.russian = true; } persistLayout(); applyPlayerLayout(); }));
    document.querySelectorAll("[data-player]").forEach(button => button.addEventListener("click", () => playerCommand(button.dataset.player))); document.querySelectorAll("[data-rate]").forEach(button => button.addEventListener("click", () => { if (playerCommand("rate", button.dataset.rate)) document.querySelectorAll("[data-rate]").forEach(item => item.classList.toggle("active", item === button)); }));
    document.querySelectorAll("[data-settings-section]").forEach(button => button.addEventListener("click", () => {
      state.settingsSection = button.dataset.settingsSection;
      document.querySelectorAll("[data-settings-section]").forEach(item => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-current", active ? "page" : "false");
      });
      document.querySelectorAll("[data-settings-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.settingsPanel === state.settingsSection));
    }));
    document.querySelector("#settingsForm")?.addEventListener("submit", async event => { event.preventDefault(); const form = new FormData(event.currentTarget); const apiKey = form.get("apiKey"); const payload = { settings: clone(state.settings), apiKey: apiKey ? apiKey : undefined }; payload.settings.theme = form.get("theme"); payload.settings.translation.model = form.get("model").trim(); Object.assign(payload.settings.transcription, { modelRoot: form.get("modelRoot").trim(), model: form.get("whisperModel").trim(), uvPath: form.get("uvPath").trim(), ytDlpPath: form.get("ytDlpPath").trim() }); try { state.settings = await window.appAPI.saveSettings(payload); showToast("Настройки сохранены"); render(); } catch (error) { showToast(error.message); } }); document.querySelector("#resetSettings")?.addEventListener("click", async () => { if (!confirm("Сбросить настройки?")) return; state.settings = await window.appAPI.getDefaultSettings(); render(); showToast("Черновик настроек сброшен"); });
  }

  const onYouTubeIframeAPIReady = () => { state.youTubeReady = true; if (state.activeTab === "player") render(); };
  window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
  window.addEventListener("load", () => { if (window.YT?.Player && !state.youTubeReady) onYouTubeIframeAPIReady(); });
  window.appAPI.onTranslationProgress?.(progress => {
    const context = activeCaptionContext();
    if (context?.key === progress.videoId) showToast(`Переведено ${progress.completed} из ${progress.total} реплик…`);
  });
  window.appAPI.onTranscriptionProgress?.(progress => {
    const context = activeCaptionContext();
    if (context?.key !== progress.videoId) return;
    if (progress.stage === "download") showToast(`Загружено видео ${progress.percent}%…`);
    else if (progress.stage === "transcription-start") showToast("Видео загружено. Запускаю faster-whisper…");
    else showToast(`Распознано ${progress.percent}%…`);
  });
  window.addEventListener("beforeunload", saveCurrentPlayerPosition);
  document.addEventListener("click", event => { if (!event.target.closest(".context-menu")) closeContextMenu(); });
  document.addEventListener("keydown", event => { if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return; if (state.activeTab !== "player") return; if (event.code === "Space") { event.preventDefault(); playerCommand("play"); } if (event.key === "ArrowLeft") playerCommand("back"); if (event.key === "ArrowRight") playerCommand("forward"); if (event.key === "[") playerCommand("rate", .75); if (event.key === "]") playerCommand("rate", 1.25); if (event.key.toLowerCase() === "r") playerCommand("repeat"); });
  Promise.all([window.appAPI.getInfo(), window.appAPI.getLibrary(), window.appAPI.getSettings()]).then(([info, library, settings]) => { state.info = info; state.library = library; state.settings = settings; render(); }).catch(error => { app.textContent = `Не удалось загрузить приложение: ${error.message}`; });
})();
