(() => {
  const app = document.querySelector("#app");
  const toast = document.querySelector("#toast");
  const playerUrlDraftKey = "ytll-player-url-draft";
  const userGuideUrl = "https://github.com/viktortat/el-yt-lang-learning/blob/main/Docs/guide-users.md";
  const state = { library: null, libraries: null, libraryPreferencesById: {}, expandedLibraryId: "", settings: null, activeTab: "library", settingsSection: "appearance", selectedId: "root", playerVideoId: null, playerUrl: localStorage.getItem(playerUrlDraftKey) || "", previewTitle: "", captions: window.LanguageModel.emptyCaptionDocument(), player: null, playerAutoplay: false, youTubeReady: false, expanded: new Set(["root"]), layout: JSON.parse(localStorage.getItem("ytll-layout") || '{"mode":"columns","english":true,"russian":true}') };
  state.layout.leftWidth = Number(state.layout.leftWidth) || 320;
  state.layout.rightWidth = Number(state.layout.rightWidth) || 320;
  if (state.layout.mode === "columns" && !state.layout.english && !state.layout.russian) {
    state.layout.english = true;
    state.layout.russian = true;
    localStorage.setItem("ytll-layout", JSON.stringify(state.layout));
  }
  state.activeCaptionId = "";
  state.playerGeneration = 0;
  state.captionGeneration = 0;
  state.updateAvailable = null;
  state.updateDownloading = false;
  state.updateProgress = 0;
  state.updateDownloaded = false;
  state.captionDownloads = new Map();
  state.captionDownloadStates = new Map();
  state.draggedNodeId = "";
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
  const emptyCaptions = () => window.LanguageModel.emptyCaptionDocument(state.library?.preferences || state.settings?.languages);
  const newId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const showToast = (message, duration = 2600) => { toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), duration); };
  function updateActiveCaptionDownloadMessage(message) {
    const context = activeCaptionContext();
    if (!context) return;
    const prefix = `${activeLibraryId()}:${context.key}:`;
    for (const key of state.captionDownloadStates.keys()) {
      if (!key.startsWith(prefix)) continue;
      state.captionDownloadStates.set(key, message);
      const language = key.slice(prefix.length);
      document.querySelector(`[data-caption-download-progress="${CSS.escape(language)}"] span`)?.replaceChildren(message);
    }
  }
  function showChoiceDialog({ title, message, actions }) {
    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.className = "dialog-backdrop";
      backdrop.innerHTML = `<section class="dialog-card choice-dialog" role="dialog" aria-modal="true" aria-labelledby="choiceTitle"><h2 id="choiceTitle">${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><div class="form-actions">${actions.map((action, index) => `<button type="button" class="${action.primary ? "primary" : "subtle-button"}" data-choice="${index}">${escapeHtml(action.label)}</button>`).join("")}</div></section>`;
      const onKeydown = event => { if (event.key === "Escape") finish(null); };
      const finish = value => { document.removeEventListener("keydown", onKeydown); backdrop.remove(); resolve(value); };
      backdrop.addEventListener("click", event => { if (event.target === backdrop) finish(null); });
      backdrop.querySelectorAll("[data-choice]").forEach(button => button.addEventListener("click", () => finish(actions[Number(button.dataset.choice)].value)));
      document.body.append(backdrop);
      document.addEventListener("keydown", onKeydown);
      backdrop.querySelector("[data-choice]")?.focus();
    });
  }
  const persistLayout = () => localStorage.setItem("ytll-layout", JSON.stringify(state.layout));
  const youtubeId = value => { try { const url = new URL(value); if (url.hostname.includes("youtu.be")) return url.pathname.slice(1); return url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop(); } catch { return ""; } };
  const languageDisplay = new Intl.DisplayNames(["ru"], { type: "language" });
  const languageName = code => { try { return languageDisplay.of(code) || String(code).toUpperCase(); } catch { return String(code).toUpperCase(); } };
  const sortLanguages = languages => [...languages].sort((left, right) => languageName(left).localeCompare(languageName(right), "ru", { sensitivity: "base" }));
  const captionPreferences = () => state.library?.preferences || state.settings?.languages || { studyLanguage: "en", translationLanguage: "ru" };
  const studyLanguage = () => state.captions.active?.studyLanguage || captionPreferences().studyLanguage;
  const translationLanguage = () => state.captions.active?.translationLanguage || captionPreferences().translationLanguage;
  const trackFor = language => window.LanguageModel.preferredTrack(state.captions, language);
  const studyTrack = () => trackFor(studyLanguage());
  const translationTrack = () => trackFor(translationLanguage());
  function selectableLanguages() {
    return sortLanguages([...new Set([...(state.settings?.languages?.enabled || ["en", "ru"]), ...Object.values(state.captions.tracks || {}).map(track => track.language), studyLanguage(), translationLanguage()])].filter(Boolean));
  }
  function languageOptions(selected) {
    return `${selectableLanguages().map(language => `<option value="${escapeHtml(language)}" ${language === selected ? "selected" : ""}>${escapeHtml(languageName(language))}</option>`).join("")}<option value="__other__">Другой язык…</option>`;
  }
  function showLanguagePicker({ allowRemember = true } = {}) {
    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.className = "dialog-backdrop";
      const options = sortLanguages(window.LanguageModel.SUPPORTED_LANGUAGES).map(language => `<option value="${language}">${escapeHtml(languageName(language))}</option>`).join("");
      backdrop.innerHTML = `<form class="dialog-card language-picker"><h2>Выберите язык</h2><input name="search" placeholder="Поиск языка…" autocomplete="off" /><select name="language" size="10">${options}</select>${allowRemember ? '<label class="language-picker-check"><input type="checkbox" name="remember" checked /> Добавить в «Мои языки»</label>' : ""}<div class="form-actions"><button type="button" class="subtle-button" data-cancel>Отмена</button><button class="primary" type="submit">Выбрать</button></div></form>`;
      const form = backdrop.querySelector("form");
      const select = form.elements.language;
      const finish = value => { backdrop.remove(); resolve(value); };
      form.elements.search.addEventListener("input", () => {
        const query = form.elements.search.value.trim().toLocaleLowerCase("ru");
        [...select.options].forEach(option => { option.hidden = Boolean(query) && !option.text.toLocaleLowerCase("ru").includes(query) && !option.value.includes(query); });
        const first = [...select.options].find(option => !option.hidden);
        if (first) first.selected = true;
      });
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const language = select.value;
        if (!language) return;
        if (allowRemember && form.elements.remember.checked && !state.settings.languages.enabled.includes(language)) {
          const next = clone(state.settings);
          next.languages.enabled.push(language);
          state.settings = await window.appAPI.saveSettings({ settings: next });
        }
        finish(language);
      });
      backdrop.addEventListener("click", event => { if (event.target === backdrop) finish(null); });
      form.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
      document.body.append(backdrop);
      form.elements.search.focus();
    });
  }
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
  function preservePlayerUrlDraft() {
    if (state.playerVideoId) return;
    const value = document.querySelector("#playerLinkForm [name=url]")?.value.trim();
    if (!value) return;
    state.playerUrl = value;
    localStorage.setItem(playerUrlDraftKey, value);
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
    libraryPlus: '<path class="icon-fill" d="M4 5h12v14H4z"/><path d="M7 3h12v14H7M4 5h12v14H4zM14 17v5m-2.5-2.5h5"/>',
    listPlus: '<path d="M5 6h10M5 10h10M5 14h6M18 15v6m-3-3h6"/>',
    folder: '<path class="icon-fill" d="M3 7.5h7l1.7 2H21v9H3z"/><path d="M3 18.5v-12h6l2 2H21v10z"/>',
    folderOpen: '<path class="icon-fill" d="M3.5 9h17l-2 9H2z"/><path d="M3 8.5v-2h6l2 2h10l-2.3 10H2.5z"/><path d="M3.5 9h17"/>',
    video: '<rect class="icon-fill" x="3" y="5" width="18" height="14" rx="3"/><rect x="3" y="5" width="18" height="14" rx="3"/><path class="icon-solid" d="m10 9 5 3-5 3z"/>',
    folderPlus: '<path class="icon-fill" d="M3 8h7l1.7 2H21v9H3z"/><path d="M3 18.5v-12h6l2 2H21v10z"/><path d="M12 12v4m-2-2h4"/>',
    videoPlus: '<rect class="icon-fill" x="3" y="5" width="18" height="14" rx="3"/><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M12 9v6m-3-3h6"/>',
    circlePlus: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8m-4-4h8"/>',
    import: '<path d="M12 3.5v11M8 10.5l4 4 4-4"/><path d="M4 15.5v4h16v-4"/>',
    export: '<path d="M12 14.5v-11M8 7.5l4-4 4 4"/><path d="M4 15.5v4h16v-4"/>',
    restore: '<path d="M5 8.5V4.5M5 4.5h4"/><path d="M5.5 5.5A8 8 0 1 1 4 14"/><path d="M12 8v4l2.5 1.5"/>',
    play: '<path class="icon-solid" d="m9 6 9 6-9 6z"/>',
    pause: '<path class="icon-solid" d="M7 6h3v12H7zm7 0h3v12h-3z"/>',
    back: '<path d="M5 7v5h5"/><path d="M5.5 12a7 7 0 1 0 2-5"/>',
    forward: '<path d="M19 7v5h-5"/><path d="M18.5 12a7 7 0 1 1-2-5"/>',
    previous: '<path d="M6 5v14"/><path d="m18 6-7 6 7 6"/>',
    next: '<path d="M18 5v14"/><path d="m6 6 7 6-7 6"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    download: '<path d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14"/>',
    externalLink: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    save: '<path d="M5 4h12l3 3v13H4V5a1 1 0 0 1 1-1z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/>',
    edit: '<path d="m5 19 4-.8L19 8.2a2.1 2.1 0 0 0-3-3L6 15l-1 4zM14.5 6.5l3 3"/>',
    trash: '<path d="M4 7h16M10 11v5m4-5v5M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    translate: '<path d="M4 5h8M8 3v2c0 4-2 7-5 9m2-5c2 2 4 3 7 3m3-7h6m-3-2v2c0 4 1.5 7 3 9m-6-4h6"/>',
    swap: '<path d="m8 3-4 4 4 4M4 7h16m-4 14 4-4-4-4m4 4H4"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16"/>',
    center: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8m-8 3h8m-8 3h8"/>',
  };
  const icon = (name, className = "ui-icon") => `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;

  function walk(node, callback, parent = null) { if (callback(node, parent) === false) return false; if (node.type === "folder") for (const child of node.children || []) if (walk(child, callback, node) === false) return false; }
  function findNode(id) { let found; walk(state.library.root, node => { if (node.id === id) { found = node; return false; } }); return found; }
  function activeLibrary() { return state.libraries?.libraries.find(item => item.id === state.libraries.activeId); }
  function activeLibraryId() { return state.libraries?.activeId; }
  function findParent(id) { let found; walk(state.library.root, (node, parent) => { if (node.id === id) { found = parent; return false; } }); return found; }
  function adjacentVideos() {
    const current = state.playerVideoId && findNode(state.playerVideoId);
    const parent = current && findParent(current.id);
    const videos = parent?.children?.filter(node => node.type === "video") || [];
    const index = videos.findIndex(node => node.id === current?.id);
    return { previous: index > 0 ? videos[index - 1] : null, next: index >= 0 && index < videos.length - 1 ? videos[index + 1] : null, available: index >= 0 };
  }
  function selected() { return findNode(state.selectedId) || state.library.root; }
  async function saveLibrary() { state.library = await window.appAPI.saveLibrary(state.library); }
  function isLibraryEmpty() { return !(state.library?.root?.children || []).length; }
  async function offerDefaultLibrary() {
    if (!isLibraryEmpty() || !state.settings?.onboarding?.defaultLibraryOfferEnabled) return;
    const shouldPopulate = confirm("Библиотека пуста. Заполнить её примерами для обучения?");
    const result = await window.appAPI.handleEmptyLibraryDefault(shouldPopulate);
    if (result.library) state.library = result.library;
    if (result.handled) state.settings.onboarding.defaultLibraryOfferEnabled = false;
  }
  function directChildren(folder) { return (folder.children || []).filter(child => child.type === "video"); }
  function isDescendantOf(node, possibleAncestor) {
    let parent = findParent(node.id);
    while (parent) {
      if (parent.id === possibleAncestor.id) return true;
      parent = findParent(parent.id);
    }
    return false;
  }
  function dropPlacement(row, target, event) {
    const { top, height } = row.getBoundingClientRect();
    const offset = event.clientY - top;
    if (target.type === "folder" && offset > height * .25 && offset < height * .75) return "inside";
    return offset < height / 2 ? "before" : "after";
  }
  function clearDropIndicators() { document.querySelectorAll(".tree-row.drag-over, .tree-row.drop-before, .tree-row.drop-after").forEach(row => row.classList.remove("drag-over", "drop-before", "drop-after")); }
  function canMoveNode(moving, destination) { return moving && moving.id !== "root" && destination?.type === "folder" && moving.id !== destination.id && !isDescendantOf(destination, moving); }
  function moveNode(moving, destination, index) {
    const source = findParent(moving.id);
    if (!source || !canMoveNode(moving, destination)) return false;
    const sourceIndex = source.children.findIndex(child => child.id === moving.id);
    if (sourceIndex < 0) return false;
    source.children.splice(sourceIndex, 1);
    const adjustedIndex = source === destination && sourceIndex < index ? index - 1 : index;
    destination.children.splice(Math.max(0, Math.min(adjustedIndex, destination.children.length)), 0, moving);
    return true;
  }

  function shell(content) {
    const info = state.info || {};
    return `<section class="shell"><header class="topbar"><div class="brand"><span class="brand-mark">YT</span><span>LANG LEARNING</span></div><nav class="tabs" aria-label="Разделы"><button class="tab ${state.activeTab === "library" ? "active" : ""}" data-tab="library">БИБЛИОТЕКА</button><button class="tab ${state.activeTab === "player" ? "active" : ""}" data-tab="player">ПЛЕЕР</button></nav><div class="top-actions"><button class="icon-button" id="addVideoTop" title="Добавить ролик" aria-label="Добавить ролик">${icon("circlePlus")}</button><button class="icon-button" data-tab="settings" title="Настройки" aria-label="Настройки">⚙</button></div></header>${content}<footer class="statusbar"><b id="versionLabel" class="version-label${state.updateAvailable ? " has-update" : ""}" title="${state.updateAvailable ? "Доступно обновление v" + state.updateAvailable.version : ""}">v${escapeHtml(info.version || "?")}${state.updateAvailable ? `<span class="update-badge">!</span>` : ""}</b> · переносная библиотека · ${escapeHtml(info.dataDirectory || "")}</footer></section>`;
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
    const current = activeLibrary();
    return shell(`<section class="view library-view"><aside class="tree-panel"><header class="tree-header"><div class="library-heading"><p class="eyebrow">Библиотека</p><button class="library-switcher" id="librarySwitcher" aria-haspopup="menu"><span>${escapeHtml(current?.name || "Моя библиотека")}</span>${icon("chevronDown")}</button></div><div class="tree-actions"><button class="icon-button tree-tool" id="newFolder" title="Новая папка" aria-label="Новая папка">${icon("folderPlus")}</button><button class="icon-button tree-tool" id="newVideo" title="Добавить ролик" aria-label="Добавить ролик">${icon("videoPlus")}</button><button class="subtle-button library-manager-button" id="manageLibraries">Библиотеки</button></div></header><div class="tree">${renderTreeNode(state.library.root)}</div></aside><section class="inspector">${inspector}</section></section>`);
  }

  function renderFolderInspector(folder) {
    if (folder.id === "root") {
      const items = state.libraries.libraries.map(item => {
        const expanded = item.id === state.expandedLibraryId;
        const preferences = state.libraryPreferencesById[item.id] || (item.id === activeLibraryId() ? state.library.preferences : null);
        const languagePair = preferences ? `${languageName(preferences.studyLanguage)} → ${languageName(preferences.translationLanguage)}` : "Языки не загружены";
        const languageOptions = selected => sortLanguages(state.settings.languages.enabled).map(language => `<option value="${escapeHtml(language)}" ${language === selected ? "selected" : ""}>${escapeHtml(languageName(language))}</option>`).join("");
        const languageSettings = preferences ? `<div class="library-language-settings"><label>Изучаемый язык<select data-library-study-language="${item.id}">${languageOptions(preferences.studyLanguage)}</select></label><label>Язык перевода<select data-library-translation-language="${item.id}">${languageOptions(preferences.translationLanguage)}</select></label></div>` : "";
        return `<article class="library-overview-item ${item.id === activeLibraryId() ? "active" : ""} ${expanded ? "expanded" : ""}"><button class="library-overview-summary" data-library-toggle="${item.id}" aria-expanded="${expanded}" aria-controls="library-actions-${item.id}"><span class="node-icon">${icon("library", "tree-node-icon")}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(languagePair)}</small></span>${item.id === activeLibraryId() ? '<span class="node-chip">Текущая</span>' : ""}<span class="library-overview-chevron">${icon(expanded ? "chevronDown" : "chevronRight")}</span></button><div class="library-overview-details" id="library-actions-${item.id}" ${expanded ? "" : "hidden"}>${languageSettings}<div class="library-overview-actions"><button class="subtle-button library-overview-action" data-library-open="${item.id}" title="Перейти в библиотеку" aria-label="Перейти в библиотеку">${icon("externalLink")}</button><button class="subtle-button library-overview-action" data-library-export="${item.id}" title="Экспортировать библиотеку" aria-label="Экспортировать библиотеку">${icon("export")}</button><button class="subtle-button library-overview-action" data-library-rename="${item.id}" title="Переименовать библиотеку" aria-label="Переименовать библиотеку">${icon("edit")}</button><button class="subtle-button danger library-overview-action" data-library-delete="${item.id}" title="Удалить библиотеку" aria-label="Удалить библиотеку" ${state.libraries.libraries.length === 1 ? "disabled" : ""}>${icon("trash")}</button></div></div></article>`;
      }).join("");
      return `<section class="library-overview"><header class="inspector-header"><div><p class="eyebrow">Библиотеки</p><h1 class="view-title">Управление библиотеками</h1><p class="hint">Каждая библиотека хранит отдельные ролики, прогресс и субтитры.</p></div></header><div class="library-overview-list">${items}</div><div class="library-overview-global-actions"><button class="primary library-overview-action" id="createLibraryMain" title="Новая библиотека" aria-label="Новая библиотека">${icon("libraryPlus")}</button><button class="subtle-button library-overview-action" id="importLibraryMain" title="Импортировать библиотеку" aria-label="Импортировать библиотеку">${icon("import")}</button><button class="subtle-button library-overview-action" id="showBackupsMain" title="Резервные копии" aria-label="Резервные копии">${icon("restore")}</button></div></section>`;
    }
    const videos = directChildren(folder).length;
    return `<header class="inspector-header"><div><p class="eyebrow">Папка</p><h1 class="view-title">${escapeHtml(folder.name)}</h1></div><span class="node-chip">${videos} роликов</span></header><form class="form folder-form" id="folderForm"><label class="field">YouTube-плейлист<div class="playlist-input"><input name="playlistUrl" value="${escapeHtml(folder.playlistUrl || "")}" placeholder="https://www.youtube.com/watch?v=…&list=…" autocomplete="off" /><button class="subtle-button folder-action" type="button" id="openPlaylist" title="Открыть плейлист в браузере" aria-label="Открыть плейлист в браузере">${icon("externalLink")}</button></div></label><p class="hint">Ссылка сохраняется только для этой папки.</p><label class="field">Добавить ролики из плейлиста<div class="playlist-input"><input name="importPlaylistUrl" placeholder="https://www.youtube.com/playlist?list=…" autocomplete="off" /><button class="primary playlist-import-button" type="button" id="importPlaylistVideos">Добавить</button></div></label><p class="hint">Поле используется только для загрузки списка роликов; ссылка не сохраняется.</p><div class="form-actions"><button class="primary folder-action" type="submit" title="Сохранить ссылку" aria-label="Сохранить ссылку">${icon("save")}</button><button class="subtle-button folder-action" type="button" data-action="rename" title="Переименовать" aria-label="Переименовать">${icon("edit")}</button><button class="subtle-button folder-action" type="button" data-action="add-video" title="Добавить ролик" aria-label="Добавить ролик">${icon("videoPlus")}</button><button class="subtle-button danger folder-action" type="button" data-action="delete" title="Удалить" aria-label="Удалить">${icon("trash")}</button></div></form>`;
  }

  function renderVideoInspector(video) {
    return `<header class="inspector-header"><div><p class="eyebrow">YouTube-ролик</p><h1 class="view-title">Свойства</h1></div><span class="node-chip">${video.progress?.studied || 0} изучено</span></header><form class="form video-form" id="videoForm"><label class="field">Название<input name="name" value="${escapeHtml(video.name)}" required /></label><label class="field">YouTube URL<div class="playlist-input"><input name="url" value="${escapeHtml(video.url || "")}" placeholder="https://www.youtube.com/watch?v=…" required /><button class="subtle-button folder-action" type="button" id="openYoutube" title="Открыть ролик в браузере" aria-label="Открыть ролик в браузере">${icon("externalLink")}</button></div></label><p class="hint">Название используется только в вашей библиотеке и всегда остаётся редактируемым.</p><div class="form-actions"><button class="primary folder-action" type="submit" title="Сохранить" aria-label="Сохранить">${icon("save")}</button><button class="subtle-button folder-action" type="button" id="openPlayer" title="Открыть в плеере" aria-label="Открыть в плеере">${icon("play")}</button><button class="subtle-button danger folder-action" type="button" data-action="delete" title="Удалить" aria-label="Удалить">${icon("trash")}</button></div></form>`;
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
    if (!items?.length) return `<p class="caption-empty">Дорожка «${escapeHtml(languageName(language))}» ещё не создана.</p>`;
    return items.map(item => `<button class="caption-row" data-caption-language="${language}" data-caption-start="${item.start}" data-caption-id="${item.id}"><span>${Math.floor(item.start / 60)}:${String(Math.floor(item.start % 60)).padStart(2, "0")}</span>${escapeHtml(item.text)}</button>`).join("");
  }
  function trackStatus(track) {
    if (!track) return "Нет дорожки";
    const sources = { "youtube-manual": "YouTube · авторская", "youtube-auto": "YouTube · автоматическая", "youtube-translation": "YouTube · машинный перевод", whisper: "Whisper · язык речи", openrouter: "OpenRouter · перевод", legacy: "Импортированная" };
    return `${sources[track.source] || track.source}${track.stale ? " · устарела" : ""}${track.userEdited ? " · исправлена" : ""}`;
  }
  function versionSelector(track, language) {
    const versions = window.LanguageModel.tracksForLanguage(state.captions, language);
    if (versions.length < 2) return "";
    return `<select class="track-version" data-track-version="${escapeHtml(language)}" aria-label="Версия дорожки">${versions.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === track?.id ? "selected" : ""}>${escapeHtml(trackStatus(item))} · v${item.revision}</option>`).join("")}</select>`;
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
    const study = studyTrack();
    const translated = translationTrack();
    const studyCode = studyLanguage();
    const translationCode = translationLanguage();
    const leftTrack = state.layout.swapped ? translated : study;
    const rightTrack = state.layout.swapped ? study : translated;
    const leftCode = state.layout.swapped ? translationCode : studyCode;
    const rightCode = state.layout.swapped ? studyCode : translationCode;
    const toolButton = (className, attributes, iconName, label) => `<button class="${className}" ${attributes} title="${label}" aria-label="${label}">${icon(iconName)}</button>`;
    const playbackControls = `${toolButton("control", 'data-player="back"', "back", "Назад на 5 секунд")}${toolButton("control", 'data-player="play"', "play", "Воспроизвести или поставить на паузу")}${toolButton("control", 'data-player="forward"', "forward", "Вперёд на 5 секунд")}<span class="controls-divider" aria-hidden="true"></span>${toolButton("control", 'data-player="previous"', "previous", "Повторить предыдущую реплику")}${toolButton("control", 'data-player="repeat"', "repeat", "Повторить текущую реплику")}`;
    const adjacent = adjacentVideos();
    const navigationButton = (direction, target) => {
      const label = target ? `${direction === "previous" ? "Предыдущий" : "Следующий"} ролик: ${target.name}` : adjacent.available ? `${direction === "previous" ? "Предыдущего" : "Следующего"} ролика нет` : "Навигация доступна для роликов из библиотеки";
      return `<button class="video-navigation-button" type="button" ${target ? `data-video-navigation="${direction}"` : "disabled"} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon(direction === "previous" ? "previous" : "next")}</button>`;
    };
    const videoNavigation = `<nav class="video-navigation" aria-label="Переход между роликами">${navigationButton("previous", adjacent.previous)}${navigationButton("next", adjacent.next)}</nav>`;
    const leftRole = state.layout.swapped ? "translation" : "study";
    const rightRole = state.layout.swapped ? "study" : "translation";
    const captionDownloadState = language => {
      const context = activeCaptionContext();
      if (!context) return null;
      return state.captionDownloadStates.get(`${activeLibraryId()}:${context.key}:${language}`) || null;
    };
    const panelActions = role => {
      if (!id) return "";
      const buttons = [];
      const language = role === "study" ? studyCode : translationCode;
      const progress = captionDownloadState(language);
      const disabled = progress ? " disabled aria-busy=\"true\"" : "";
      if (role === "study") buttons.push(toolButton(`mode-button panel-track-action ${progress ? "is-busy" : ""}`, `id="loadStudyTrack" data-caption-download="${escapeHtml(language)}"${disabled}`, "download", `Получить дорожку «${languageName(studyCode)}»`));
      if (role === "translation") {
        buttons.push(toolButton(`mode-button panel-track-action ${translationReady ? "" : "needs-key"} ${progress ? "is-busy" : ""}`, `id="createTranslationTrack" data-caption-download="${escapeHtml(language)}"${disabled}`, "download", `Создать дорожку «${languageName(translationCode)}»`));
      }
      const status = progress ? `<div class="caption-download-progress" data-caption-download-progress="${escapeHtml(language)}"><span>${escapeHtml(progress)}</span><i aria-hidden="true"></i></div>` : "";
      return buttons.length ? `<div class="panel-track-actions">${buttons.join("")}${status}</div>` : "";
    };
    const leftHead = `<div class="track-heading"><select id="${leftRole}Language" aria-label="${leftRole === "study" ? "Изучаемый язык" : "Язык перевода"}">${languageOptions(leftCode)}</select><small>${escapeHtml(trackStatus(leftTrack))}</small>${versionSelector(leftTrack, leftCode)}</div>${panelActions(leftRole)}<span>${leftTrack?.segments.length || 0}</span>`;
    const rightHead = `<div class="track-heading"><select id="${rightRole}Language" aria-label="${rightRole === "study" ? "Изучаемый язык" : "Язык перевода"}">${languageOptions(rightCode)}</select><small>${escapeHtml(trackStatus(rightTrack))}</small>${versionSelector(rightTrack, rightCode)}</div>${panelActions(rightRole)}<span>${rightTrack?.segments.length || 0}</span>`;
    return shell(`<section class="view player-view ${mode === "center" ? "center-mode" : ""}"><header class="player-head"><form class="player-link-form" id="playerLinkForm"><input name="url" value="${url}" placeholder="Вставьте YouTube-ссылку…" autocomplete="off" />${toolButton("subtle-button", 'type="submit"', "play", "Открыть ролик")}${toolButton("subtle-button", 'type="button" id="swapLanguages"', "swap", "Поменять дорожки местами")}${toolButton("primary", 'type="button" id="addRootVideo"', "listPlus", "Сохранить ролик в библиотеку")}</form></header><section class="learning-stage"><aside class="caption-panel ${state.layout.english ? "" : "collapsed"}"><header class="caption-head">${leftHead}</header><div class="caption-list">${captionsMarkup(leftTrack?.segments, leftCode)}</div></aside><section class="video-zone"><h1 class="player-title">${title}</h1>${player}<div class="center-captions"><b>${escapeHtml(study?.segments[0]?.text || "Субтитры по центру")}</b>${escapeHtml(translated?.segments[0]?.text || `Создайте перевод на ${languageName(translationCode)}.`)}</div>${videoNavigation}<nav class="study-controls" aria-label="Управление просмотром">${playbackControls}<span class="controls-divider" aria-hidden="true"></span>${["0.5","0.75","1","1.5","2"].map(rate => `<button class="control rate-control ${rate === "1" ? "active" : ""}" data-rate="${rate}" aria-label="Скорость ${rate}">${rate}×</button>`).join("")}</nav></section><aside class="caption-panel ${state.layout.russian ? "" : "collapsed"}"><header class="caption-head">${rightHead}</header><div class="caption-list">${captionsMarkup(rightTrack?.segments, rightCode)}</div></aside></section></section>`);
  }
  function renderSettings() {
    const s = state.settings; const t = s.translation; const tr = s.transcription;
    const selected = state.settingsSection;
    const menuItem = (id, label) => `<button type="button" class="settings-nav-item ${selected === id ? "active" : ""}" data-settings-section="${id}" aria-current="${selected === id ? "page" : "false"}">${label}</button>`;
    const allLanguageOptions = sortLanguages(window.LanguageModel.SUPPORTED_LANGUAGES).map(language => `<option value="${language}" ${s.languages.enabled.includes(language) ? "selected" : ""}>${escapeHtml(languageName(language))}</option>`).join("");
    const enabledOptions = sortLanguages(s.languages.enabled).map(language => `<option value="${language}">${escapeHtml(languageName(language))}</option>`).join("");
    const languageTags = sortLanguages(s.languages.enabled).map(language => `<button type="button" class="language-tag" data-language-tag="${language}" aria-label="Удалить язык: ${escapeHtml(languageName(language))}">${escapeHtml(languageName(language))}<small>${escapeHtml(language.toUpperCase())}</small><b aria-hidden="true">×</b></button>`).join("");
    return shell(`<section class="view settings-view"><form class="settings-layout" id="settingsForm"><aside class="settings-nav" aria-label="Разделы настроек"><p class="settings-nav-label">Настройки</p>${menuItem("appearance", "Внешний вид")}${menuItem("languages", "Языки")}${menuItem("translation", "Перевод OpenRouter")}${menuItem("transcription", "Локальная транскрибация")}</aside><main class="settings-main"><header class="settings-head"><div><p class="eyebrow">Настройки</p><h1 class="view-title">Локальная конфигурация</h1><p class="hint">Общие языки используются для новых библиотек и временных роликов.</p></div><div class="settings-actions"><button type="button" class="subtle-button" id="resetSettings">Сбросить</button><button class="primary" type="submit">Сохранить настройки</button></div></header><section class="settings-group ${selected === "appearance" ? "active" : ""}" data-settings-panel="appearance"><h2>Внешний вид</h2><label class="settings-row"><span><strong>Тема</strong><small>Светлая или тёмная оболочка.</small></span><select name="theme"><option value="dark" ${s.theme === "dark" ? "selected" : ""}>Тёмная</option><option value="light" ${s.theme === "light" ? "selected" : ""}>Светлая</option></select></label><label class="settings-row"><span><strong>Примеры для пустой библиотеки</strong><small>При следующем запуске предложить загрузить учебные примеры.</small></span><input name="defaultLibraryOfferEnabled" type="checkbox" ${s.onboarding.defaultLibraryOfferEnabled ? "checked" : ""} /></label></section><section class="settings-group ${selected === "languages" ? "active" : ""}" data-settings-panel="languages"><label class="settings-row"><span><strong>Доступные языки</strong><small>Они первыми отображаются в селекторах плеера.</small><span class="language-tags" id="languageTags" aria-label="Выбранные языки">${languageTags || '<span class="language-tags-empty">Выберите хотя бы один язык</span>'}</span></span><select name="enabledLanguages" multiple size="12">${allLanguageOptions}</select></label><label class="settings-row"><span><strong>Изучаемый язык по умолчанию</strong><small>Используется при создании новой библиотеки.</small></span><select name="studyLanguage">${enabledOptions.replace(`value="${s.languages.studyLanguage}"`, `value="${s.languages.studyLanguage}" selected`)}</select></label><label class="settings-row"><span><strong>Язык перевода по умолчанию</strong></span><select name="translationLanguage">${enabledOptions.replace(`value="${s.languages.translationLanguage}"`, `value="${s.languages.translationLanguage}" selected`)}</select></label><label class="settings-row"><span><strong>Порог определения языка</strong><small>Ниже этого значения приложение попросит подтвердить язык речи.</small></span><input name="detectionThreshold" type="number" min="0.5" max="0.99" step="0.01" value="${s.languages.detectionThreshold}" /></label></section><section class="settings-group ${selected === "translation" ? "active" : ""}" data-settings-panel="translation"><h2>Перевод OpenRouter</h2><label class="settings-row"><span><strong>API-ключ</strong><small>${t.hasApiKey ? "Ключ сохранён в зашифрованном виде. Оставьте пустым, чтобы не менять." : "Ключ ещё не сохранён."}</small></span><input name="apiKey" type="password" placeholder="sk-or-v1-…" /></label><label class="settings-row"><span><strong>Модель перевода</strong><small>Используется для пакетного перевода реплик.</small></span><input name="model" value="${escapeHtml(t.model)}" /></label></section><section class="settings-group ${selected === "transcription" ? "active" : ""}" data-settings-panel="transcription"><h2>Локальная транскрибация</h2><label class="settings-row"><span><strong>Каталог моделей</strong><small>Уже скачанная модель faster-whisper.</small></span><input name="modelRoot" value="${escapeHtml(tr.modelRoot)}" /></label><label class="settings-row"><span><strong>Модель</strong><small>Используется только после согласия на локальную транскрибацию.</small></span><input name="whisperModel" value="${escapeHtml(tr.model)}" /></label><label class="settings-row"><span><strong>Команда uv</strong></span><input name="uvPath" value="${escapeHtml(tr.uvPath)}" /></label><label class="settings-row"><span><strong>Команда yt-dlp</strong></span><input name="ytDlpPath" value="${escapeHtml(tr.ytDlpPath)}" /></label></section></main></form></section>`);
  }

  function currentCaption(time) {
    return window.CaptionSync.findCurrentCaption(studyTrack()?.segments || [], Number(time));
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

  function syncCaptionsToTime(time) {
    const active = currentCaption(time);
    const translatedActive = window.CaptionSync.findCurrentCaption(translationTrack()?.segments || [], Number(time));
    const captionId = active?.id || "";
    const activeByLanguage = new Map([
      [studyLanguage(), active?.id || ""],
      [translationLanguage(), translatedActive?.id || ""]
    ]);
    const changed = captionId !== state.activeCaptionId;
    const renderedActiveId = document.querySelector(".caption-row.active")?.dataset.captionId || "";
    const needsPositionRestore = captionId && renderedActiveId !== captionId;
    state.activeCaptionId = captionId;
    document.querySelectorAll(".caption-row").forEach(row => row.classList.toggle("active", row.dataset.captionId === activeByLanguage.get(row.dataset.captionLanguage)));
    const center = document.querySelector(".center-captions");
    if (center && active) {
      const translated = translationTrack()?.segments.find(item => item.id === captionId)
        || translationTrack()?.segments.find(item => Math.abs(item.start - active.start) < 0.35);
      center.innerHTML = `<b>${escapeHtml(active.text)}</b>${escapeHtml(translated?.text || "")}`;
    }
    if ((!changed && !needsPositionRestore) || !captionId) return;
    const leftActiveId = document.querySelector('.caption-list[data-language="left"] .caption-row.active')?.dataset.captionId;
    const rightActiveId = document.querySelector('.caption-list[data-language="right"] .caption-row.active')?.dataset.captionId;
    if (leftActiveId) scrollCaptionIntoView("left", leftActiveId, true);
    if (rightActiveId) scrollCaptionIntoView("right", rightActiveId, true);
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
    [[panels[0], "left"], [panels[1], "right"]].forEach(([panel, language]) => {
      if (!panel) return;
      const list = panel.querySelector(".caption-list");
      const head = panel.querySelector(".caption-head");
      if (!list || !head) return;
      list.dataset.language = language;
      const panelKey = language === "left" ? "english" : "russian";
      const collapse = document.createElement("button");
      collapse.type = "button";
      collapse.className = "panel-collapse";
      collapse.dataset.panelCollapse = panelKey;
      collapse.addEventListener("click", () => {
        state.layout[panelKey] = !state.layout[panelKey];
        persistLayout();
        applyPlayerLayout();
      });
      if (language === "left") head.prepend(collapse);
      if (language === "right") head.append(collapse);
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
      const label = `${expanded ? "Свернуть" : "Развернуть"} ${isLeft ? "левую" : "правую"} дорожку`;
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
    const shouldAutoplay = state.playerAutoplay;
    state.playerAutoplay = false;
    const generation = ++state.playerGeneration;
    state.player = null;
    stopCaptionSync();
    if (!host || !id) return;
    if (!window.YT?.Player) {
      setTimeout(() => {
        if (generation !== state.playerGeneration || !host.isConnected || window.YT?.Player) return;
        const source = `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0&autoplay=${shouldAutoplay ? "1" : "0"}&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
        host.innerHTML = `<iframe src="${source}" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      }, 1500);
      return;
    }
    const player = new window.YT.Player("youtubePlayer", {
      videoId: id,
      playerVars: { origin: window.location.origin, rel: 0, modestbranding: 1, autoplay: shouldAutoplay ? 1 : 0 },
      events: {
        onReady: event => {
          if (generation !== state.playerGeneration) return;
          state.player = event.target;
          const savedTime = state.positionStore.get(id);
          if (savedTime > 0.25) event.target.seekTo(savedTime, true);
          if (shouldAutoplay) event.target.playVideo();
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
  function openPlayer(video, autoplay = false) {
    saveCurrentPlayerPosition();
    state.playerVideoId = video.id;
    state.playerUrl = "";
    state.previewTitle = "";
    state.playerAutoplay = autoplay;
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
      let captions = await window.appAPI.getCaptions(context.key, activeLibraryId());
      if (context.isLibraryVideo && !Object.keys(captions.tracks || {}).length) {
        const previewCaptions = await window.appAPI.getCaptions(context.previewKey, activeLibraryId());
        if (Object.keys(previewCaptions.tracks || {}).length) captions = await window.appAPI.saveCaptions(context.key, previewCaptions, activeLibraryId());
      }
      if (generation !== state.captionGeneration || context.youtubeId !== activeYoutubeId()) return;
      state.captions = captions;
      render();
      if (automaticDownload && !studyTrack()?.segments.length) {
        showToast(`Ищу на YouTube дорожку «${languageName(studyLanguage())}»…`);
        void downloadTrackForActive(studyLanguage(), generation);
      }
    } catch (error) {
      if (generation === state.captionGeneration) showToast(error?.message || "Неизвестная ошибка");
    }
  }
  async function saveCaptionDocument() {
    const context = activeCaptionContext();
    if (!context) return;
    state.captions = await window.appAPI.saveCaptions(context.key, state.captions, activeLibraryId());
  }
  async function translateWithOpenRouter(sourceLanguage, targetLanguage, expectedGeneration = state.captionGeneration) {
    const context = activeCaptionContext();
    if (!context) return null;
    if (!state.settings?.translation?.hasApiKey) { state.activeTab = "settings"; state.settingsSection = "translation"; render(); showToast("Введите и сохраните ключ OpenRouter"); return null; }
    showToast(`Перевожу на ${languageName(targetLanguage)} через OpenRouter…`);
    const captions = await window.appAPI.translateCaptionTrack({ videoId: context.key, sourceLanguage, targetLanguage, libraryId: activeLibraryId() });
    if (expectedGeneration !== state.captionGeneration || context.youtubeId !== activeYoutubeId()) return null;
    state.captions = captions;
    render();
    return captions;
  }
  async function recoverCaptionTrack(language, info, status, expectedGeneration, onStatus = () => {}) {
    const context = activeCaptionContext();
    const source = trackFor(info.sourceLanguage || state.captions.speechLanguage || studyLanguage());
    const actions = [];
    if (source && !window.LanguageModel.sameLanguage(source.language, language) && state.settings?.translation?.hasApiKey) actions.push({ label: "Перевести через OpenRouter", value: "openrouter", primary: true });
    actions.push({ label: "Распознать через Whisper", value: "whisper", primary: !actions.length });
    actions.push({ label: "Выбрать локальный файл", value: "local" });
    actions.push({ label: "Отмена", value: "cancel" });
    const reason = status === "rate-limited" ? "YouTube временно ограничил запросы (429)." : "YouTube не предоставил нужную дорожку.";
    onStatus(`${reason} Нужен другой способ создания дорожки…`);
    const decisionKey = `fallback:${language}`;
    const remembered = state.captions.decisions[decisionKey]?.choice;
    const canReuse = remembered === "whisper" || (remembered === "openrouter" && source);
    const choice = canReuse ? remembered : await showChoiceDialog({ title: "Не удалось получить субтитры", message: `${reason} Можно распознать язык речи локально и затем создать перевод. Выбор сохранится для этого видео.`, actions });
    if (!choice || choice === "cancel") return null;
    state.captions.decisions[decisionKey] = { choice };
    await saveCaptionDocument();
    if (choice === "openrouter") {
      onStatus(`Перевожу дорожку на «${languageName(language)}» через OpenRouter…`);
      return translateWithOpenRouter(source.language, language, expectedGeneration);
    }
    const mediaPath = choice === "local" ? await window.appAPI.selectLocalMedia() : null;
    if (choice === "local" && !mediaPath) return null;
    const whisperStatus = mediaPath ? "Запускаю Whisper для выбранного файла…" : "Whisper: сначала загружаю видео…";
    onStatus(whisperStatus);
    showToast(whisperStatus);
    let captions = await window.appAPI.transcribeCaptionTrack({ videoId: context.key, url: context.url, mediaPath, language: info.sourceLanguage || "", libraryId: activeLibraryId() });
    if (expectedGeneration !== state.captionGeneration || context.youtubeId !== activeYoutubeId()) return null;
    state.captions = captions;
    onStatus("Whisper завершил распознавание. Подготавливаю дорожку…");
    let detected = captions.speechLanguage;
    const detectedTrack = trackFor(detected);
    const threshold = Number(state.settings?.languages?.detectionThreshold) || 0.75;
    if (detectedTrack?.confidence != null && detectedTrack.confidence < threshold) {
      const answer = await showChoiceDialog({ title: "Проверьте язык речи", message: `Whisper предполагает «${languageName(detected)}» с уверенностью ${Math.round(detectedTrack.confidence * 100)}%.`, actions: [{ label: "Подтвердить", value: "confirm", primary: true }, { label: "Выбрать другой", value: "other" }, { label: "Отмена", value: "cancel" }] });
      if (answer === "cancel" || !answer) { render(); return captions; }
      if (answer === "other") {
        const selectedLanguage = await showLanguagePicker();
        if (!selectedLanguage) { render(); return captions; }
        const corrected = window.LanguageModel.makeTrack({ ...detectedTrack, id: undefined, language: selectedLanguage, confidence: null, revision: window.LanguageModel.tracksForLanguage(captions, selectedLanguage).length + 1 });
        window.LanguageModel.addTrack(captions, corrected);
        captions.speechLanguage = selectedLanguage;
        detected = selectedLanguage;
        state.captions = await window.appAPI.saveCaptions(context.key, captions, activeLibraryId());
      }
    }
    if (detected && !window.LanguageModel.sameLanguage(detected, language)) {
      if (!state.settings?.translation?.hasApiKey) { render(); showToast(`Речь распознана как «${languageName(detected)}». Для перевода настройте OpenRouter.`); return captions; }
      onStatus(`Whisper завершил распознавание. Перевожу на «${languageName(language)}»…`);
      captions = await translateWithOpenRouter(detected, language, expectedGeneration);
    } else render();
    return captions;
  }
  async function downloadTrackForActive(language = studyLanguage(), expectedGeneration = state.captionGeneration) {
    const context = activeCaptionContext();
    if (!context) return;
    const libraryId = activeLibraryId();
    const targetLanguage = window.LanguageModel.normalizeLanguage(language, studyLanguage());
    const jobKey = `${libraryId}:${context.key}:${targetLanguage}`;
    if (state.captionDownloads.has(jobKey)) return state.captionDownloads.get(jobKey);
    const setProgress = message => {
      state.captionDownloadStates.set(jobKey, message);
      const button = document.querySelector(`[data-caption-download="${CSS.escape(targetLanguage)}"]`);
      button?.toggleAttribute("disabled", true);
      button?.setAttribute("aria-busy", "true");
      button?.classList.add("is-busy");
      let progress = document.querySelector(`[data-caption-download-progress="${CSS.escape(targetLanguage)}"]`);
      if (!progress && button) {
        progress = document.createElement("div");
        progress.className = "caption-download-progress";
        progress.dataset.captionDownloadProgress = targetLanguage;
        progress.innerHTML = "<span></span><i aria-hidden=\"true\"></i>";
        button.closest(".panel-track-actions")?.append(progress);
      }
      if (progress) progress.querySelector("span").textContent = message;
    };
    const clearProgress = () => {
      state.captionDownloadStates.delete(jobKey);
      const button = document.querySelector(`[data-caption-download="${CSS.escape(targetLanguage)}"]`);
      button?.toggleAttribute("disabled", false);
      button?.removeAttribute("aria-busy");
      button?.classList.remove("is-busy");
      document.querySelector(`[data-caption-download-progress="${CSS.escape(targetLanguage)}"]`)?.remove();
    };
    setProgress("Проверяю дорожки на YouTube…");
    const slowCheckTimer = setTimeout(() => {
      setProgress("YouTube отвечает дольше обычного. Жду ответ до 30 секунд…");
    }, 8000);
    const job = (async () => {
      try {
        showToast(`Проверяю дорожки на YouTube…`);
        const trackInfo = await window.appAPI.getCaptionTrackInfo({ url: context.url, targetLanguage });
        clearTimeout(slowCheckTimer);
        if (trackInfo.status === "rate-limited") {
          setProgress("YouTube временно ограничил запросы. Выбираю следующий вариант…");
          return recoverCaptionTrack(targetLanguage, trackInfo, "rate-limited", expectedGeneration, setProgress);
        }
        let allowTranslatedAutomaticTrack = true;
        if (trackInfo.needsTranslatedAutomaticTrack) {
          setProgress(`Найдена автоматическая дорожка на «${languageName(trackInfo.sourceLanguage)}». Загружаю перевод YouTube…`);
        }
        const downloadMessage = `Загружаю дорожку «${languageName(targetLanguage)}»…`;
        setProgress(downloadMessage);
        showToast(downloadMessage);
        const result = await window.appAPI.downloadCaptionTrack({ videoId: context.key, url: context.url, language: targetLanguage, libraryId, allowTranslatedAutomaticTrack });
        if (expectedGeneration !== state.captionGeneration || context.youtubeId !== activeYoutubeId()) return;
        if (["rate-limited", "missing-track"].includes(result.status)) {
          setProgress(result.status === "rate-limited" ? "YouTube временно ограничил запросы. Выбираю следующий вариант…" : "Подходящей дорожки нет. Выбираю следующий вариант…");
          return recoverCaptionTrack(targetLanguage, trackInfo, result.status, expectedGeneration, setProgress);
        }
        state.captions = result.captions;
        render();
        showToast(`Дорожка «${languageName(targetLanguage)}» готова`);
      } catch (error) {
        clearTimeout(slowCheckTimer);
        if (expectedGeneration === state.captionGeneration) showToast(error?.message || "Неизвестная ошибка", 8000);
      }
    })();
    state.captionDownloads.set(jobKey, job);
    try { return await job; }
    finally {
      clearProgress();
      if (state.captionDownloads.get(jobKey) === job) state.captionDownloads.delete(jobKey);
    }
  }
  async function createTranslationForActive() {
    if (translationTrack()) return showToast("Выбранная дорожка уже готова");
    return downloadTrackForActive(translationLanguage());
  }
  async function titleForUrl(url) { const result = await window.appAPI.getYoutubeMetadata(url); if (result.warning) showToast("Не удалось получить название; будет использовано «Новый урок»"); return result.title || "Новый урок"; }
  async function playUrl(url) {
    const cleanUrl = url?.trim();
    if (!youtubeId(cleanUrl)) { showToast("Вставьте корректную YouTube-ссылку"); return; }
    saveCurrentPlayerPosition();
    state.playerVideoId = null;
    state.playerUrl = cleanUrl;
    localStorage.setItem(playerUrlDraftKey, cleanUrl);
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
    let existingVideo;
    walk(state.library.root, node => {
      if (node.type === "video" && youtubeId(node.url) === targetYoutubeId) {
        existingVideo = node;
        return false;
      }
    });
    if (existingVideo) {
      let parent = findParent(existingVideo.id);
      while (parent) {
        state.expanded.add(parent.id);
        parent = findParent(parent.id);
      }
      state.selectedId = existingVideo.id;
      state.activeTab = "library";
      render();
      showToast("Этот ролик уже есть в библиотеке");
      return;
    }
    const captionsToKeep = targetYoutubeId === activeYoutubeId() ? clone(state.captions) : emptyCaptions();
    const video = { id: newId("video"), type: "video", name: "Новый урок", url: cleanUrl, createdAt: new Date().toISOString(), progress: { studied: 0, position: 0 } };
    state.library.root.children.push(video);
    await saveLibrary();
    if (Object.keys(captionsToKeep.tracks || {}).length) await window.appAPI.saveCaptions(video.id, captionsToKeep, activeLibraryId());
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
  function closeVideoDialog() { document.querySelector("#videoDialog")?.remove(); }
  function createVideo() {
    if (document.querySelector("#videoDialog")) return;
    const dialog = document.createElement("div");
    dialog.className = "dialog-backdrop";
    dialog.id = "videoDialog";
    dialog.innerHTML = `<form class="dialog-card" aria-labelledby="videoDialogTitle"><h2 id="videoDialogTitle">Новый ролик</h2><label class="field">YouTube URL<input name="url" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off" required /></label><label class="field">Название<input name="name" value="Новый урок" autocomplete="off" required /></label><div class="form-actions"><button class="subtle-button" type="button" data-dialog-cancel>Отмена</button><button class="primary" type="submit">Добавить</button></div></form>`;
    const form = dialog.querySelector("form");
    const urlInput = form.elements.url;
    dialog.addEventListener("click", event => { if (event.target === dialog) closeVideoDialog(); });
    dialog.querySelector("[data-dialog-cancel]").addEventListener("click", closeVideoDialog);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const url = urlInput.value.trim();
      const name = form.elements.name.value.trim();
      if (!youtubeId(url)) { urlInput.focus(); return showToast("Вставьте корректную YouTube-ссылку"); }
      if (!name) { form.elements.name.focus(); return; }
      const folder = targetFolder();
      folder.children ||= [];
      const video = { id: newId("video"), type: "video", name, url, createdAt: new Date().toISOString(), progress: { studied: 0, position: 0 } };
      folder.children.push(video);
      try {
        await saveLibrary();
        state.selectedId = video.id;
        state.expanded.add(folder.id);
        closeVideoDialog();
        render();
      } catch (error) {
        folder.children = folder.children.filter(item => item !== video);
        showToast(`Не удалось добавить ролик: ${error.message}`);
      }
    });
    document.body.append(dialog);
    urlInput.focus();
  }
  async function importPlaylistVideos() {
    const input = document.querySelector('#folderForm [name="importPlaylistUrl"]');
    const url = input?.value.trim();
    if (!url) return showToast("Вставьте ссылку на плейлист YouTube");
    const button = document.querySelector("#importPlaylistVideos");
    button.disabled = true;
    button.textContent = "Поиск…";
    try {
      const entries = await window.appAPI.getPlaylistVideos(url);
      const knownIds = new Set();
      walk(state.library.root, node => { if (node.type === "video") knownIds.add(youtubeId(node.url)); });
      const newEntries = entries.filter(entry => !knownIds.has(entry.id));
      if (!newEntries.length) return showToast(entries.length ? "Все ролики из плейлиста уже есть в библиотеке" : "В плейлисте нет доступных роликов");
      if (!confirm(`Добавить ${newEntries.length} роликов из плейлиста в папку «${selected().name}»?`)) return;
      const folder = selected();
      folder.children ||= [];
      folder.children.push(...newEntries.map(entry => ({ id: newId("video"), type: "video", name: entry.name, url: entry.url, createdAt: new Date().toISOString(), progress: { studied: 0, position: 0 } })));
      state.expanded.add(folder.id);
      await saveLibrary();
      render();
      showToast(`Добавлено роликов: ${newEntries.length}${entries.length > newEntries.length ? `, пропущено: ${entries.length - newEntries.length}` : ""}`);
    } catch (error) {
      showToast(`Не удалось добавить ролики: ${error.message}`);
    } finally {
      if (button?.isConnected) { button.disabled = false; button.textContent = "Добавить"; }
    }
  }
  function closeRenameNodeDialog() { document.querySelector("#renameNodeDialog")?.remove(); }
  function renameSelected() {
    const node = selected();
    if (node.id === "root") return renameLibrary(activeLibraryId());
    if (document.querySelector("#renameNodeDialog")) return;
    const entity = node.type === "folder" ? "папку" : "ролик";
    const dialog = document.createElement("div");
    dialog.className = "dialog-backdrop";
    dialog.id = "renameNodeDialog";
    dialog.innerHTML = `<form class="dialog-card" aria-labelledby="renameNodeDialogTitle"><h2 id="renameNodeDialogTitle">Переименовать ${entity}</h2><label class="field">Название<input name="name" value="${escapeHtml(node.name)}" autocomplete="off" required /></label><div class="form-actions"><button class="subtle-button" type="button" data-dialog-cancel>Отмена</button><button class="primary" type="submit">Сохранить</button></div></form>`;
    const form = dialog.querySelector("form");
    const input = form.elements.name;
    dialog.addEventListener("click", event => { if (event.target === dialog) closeRenameNodeDialog(); });
    dialog.querySelector("[data-dialog-cancel]").addEventListener("click", closeRenameNodeDialog);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return input.focus();
      node.name = name;
      try { await saveLibrary(); closeRenameNodeDialog(); render(); showToast("Название сохранено"); }
      catch (error) { showToast(`Не удалось переименовать: ${error.message}`); }
    });
    document.body.append(dialog);
    input.select();
    input.focus();
  }
  async function deleteSelected() { const node = selected(); if (node.id === "root") return; if (!confirm(`Удалить «${node.name}» из библиотеки?`)) return; const parent = findParent(node.id); parent.children = parent.children.filter(child => child.id !== node.id); state.selectedId = parent.id; if (state.playerVideoId === node.id) state.playerVideoId = null; await saveLibrary(); render(); }
  async function switchLibrary(libraryId) {
    if (libraryId === activeLibraryId()) return;
    try {
      saveCurrentPlayerPosition();
      const result = await window.appAPI.selectLibrary(libraryId);
      state.libraries = result.libraries;
      state.library = result.library;
      state.libraryPreferencesById[libraryId] = result.library.preferences;
      state.selectedId = "root";
      state.playerVideoId = null;
      state.playerUrl = "";
      startCaptionSession();
      state.activeTab = "library";
      render();
    } catch (error) { showToast(`Не удалось переключить библиотеку: ${error.message}`); }
  }
  function closeCreateLibraryDialog() { document.querySelector("#createLibraryDialog")?.remove(); }
  function createLibrary() {
    closeLibraryDialog();
    if (document.querySelector("#createLibraryDialog")) return;
    const preferences = state.settings?.languages || { studyLanguage: "en", translationLanguage: "ru" };
    const dialog = document.createElement("div");
    dialog.className = "dialog-backdrop";
    dialog.id = "createLibraryDialog";
    dialog.innerHTML = `<form class="dialog-card" aria-labelledby="createLibraryDialogTitle"><h2 id="createLibraryDialogTitle">Новая библиотека</h2><label class="field">Название библиотеки<input name="name" value="Новая библиотека" autocomplete="off" required /></label><label class="field">Изучаемый язык<select name="studyLanguage">${languageOptions(preferences.studyLanguage)}</select></label><label class="field">Язык перевода<select name="translationLanguage">${languageOptions(preferences.translationLanguage)}</select></label><p class="hint">Языки берутся из общих настроек, но действуют только для этой библиотеки.</p><div class="form-actions"><button class="subtle-button" type="button" data-dialog-cancel>Отмена</button><button class="primary" type="submit">Создать</button></div></form>`;
    const form = dialog.querySelector("form");
    const input = form.elements.name;
    const setLanguage = (select, language) => {
      if (![...select.options].some(option => option.value === language)) select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(language)}">${escapeHtml(languageName(language))}</option>`);
      select.value = language;
    };
    const bindLanguagePicker = select => {
      let previous = select.value;
      select.addEventListener("change", async () => {
        if (select.value !== "__other__") { previous = select.value; return; }
        const language = await showLanguagePicker({ allowRemember: false });
        if (!language) { select.value = previous; return; }
        setLanguage(select, language);
        previous = language;
      });
    };
    bindLanguagePicker(form.elements.studyLanguage);
    bindLanguagePicker(form.elements.translationLanguage);
    input.readOnly = false;
    input.disabled = false;
    dialog.addEventListener("keydown", event => event.stopPropagation());
    dialog.addEventListener("click", event => { if (event.target === dialog) closeCreateLibraryDialog(); });
    dialog.querySelector("[data-dialog-cancel]").addEventListener("click", closeCreateLibraryDialog);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return input.focus();
      const requestedPreferences = { studyLanguage: form.elements.studyLanguage.value, translationLanguage: form.elements.translationLanguage.value };
      if (window.LanguageModel.sameLanguage(requestedPreferences.studyLanguage, requestedPreferences.translationLanguage)) return showToast("Языки совпадают. Выберите разные языки для двух полей.");
      try {
        const result = await window.appAPI.createLibrary(name, requestedPreferences);
        state.libraries = result.libraries;
        state.library = result.library;
        state.libraryPreferencesById[result.libraries.activeId] = result.library.preferences;
        state.expandedLibraryId = result.libraries.activeId;
        state.selectedId = "root";
        state.playerVideoId = null;
        startCaptionSession();
        closeCreateLibraryDialog();
        render();
        showToast("Библиотека создана");
      } catch (error) { showToast(`Не удалось создать библиотеку: ${error.message}`); }
    });
    document.body.append(dialog);
    input.select();
    input.focus();
  }
  function closeRenameLibraryDialog() { document.querySelector("#renameLibraryDialog")?.remove(); }
  function renameLibrary(libraryId) {
    const item = state.libraries.libraries.find(entry => entry.id === libraryId);
    if (!item || document.querySelector("#renameLibraryDialog")) return;
    closeLibraryDialog();
    const dialog = document.createElement("div");
    dialog.className = "dialog-backdrop";
    dialog.id = "renameLibraryDialog";
    dialog.innerHTML = `<form class="dialog-card" aria-labelledby="renameLibraryDialogTitle"><h2 id="renameLibraryDialogTitle">Переименовать библиотеку</h2><label class="field">Название библиотеки<input name="name" value="${escapeHtml(item.name)}" autocomplete="off" required /></label><div class="form-actions"><button class="subtle-button" type="button" data-dialog-cancel>Отмена</button><button class="primary" type="submit">Сохранить</button></div></form>`;
    const form = dialog.querySelector("form");
    const input = form.elements.name;
    input.readOnly = false;
    input.disabled = false;
    dialog.addEventListener("keydown", event => event.stopPropagation());
    dialog.addEventListener("click", event => { if (event.target === dialog) closeRenameLibraryDialog(); });
    dialog.querySelector("[data-dialog-cancel]").addEventListener("click", closeRenameLibraryDialog);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return input.focus();
      try {
        state.libraries = await window.appAPI.renameLibrary(libraryId, name);
        if (libraryId === activeLibraryId() && state.library?.root) state.library.root.name = name;
        closeRenameLibraryDialog();
        render();
        showToast("Библиотека переименована");
      } catch (error) { showToast(`Не удалось переименовать библиотеку: ${error.message}`); }
    });
    document.body.append(dialog);
    input.select();
    input.focus();
  }
  async function exportLibrary() { try { const result = await window.appAPI.exportLibrary(); if (!result.canceled) showToast("Библиотека экспортирована"); } catch (error) { showToast(`Не удалось экспортировать библиотеку: ${error.message}`); } }
  async function importLibrary() {
    try {
      const result = await window.appAPI.importLibrary();
      if (result.canceled) return;
      state.libraries = result.libraries;
      state.library = result.library;
      state.libraryPreferencesById = await window.appAPI.getLibraryPreferences();
      state.selectedId = "root";
      state.playerVideoId = null;
      startCaptionSession();
      render();
      showToast("Библиотека импортирована");
    } catch (error) { showToast(`Не удалось импортировать библиотеку: ${error.message}`); }
  }
  function closeLibraryDialog() { document.querySelector("#libraryDialog")?.remove(); }
  async function deleteLibrary(libraryId) {
    const item = state.libraries.libraries.find(entry => entry.id === libraryId);
    if (!item) return;
    if (confirm(`Экспортировать библиотеку «${item.name}» перед удалением?`)) {
      try { const exported = await window.appAPI.exportLibrary(item.id); if (exported.canceled) return; } catch (error) { return showToast(`Не удалось экспортировать библиотеку: ${error.message}`); }
    }
    if (!confirm(`Удалить библиотеку «${item.name}»? Перед удалением будет создана резервная копия, затем файлы будут перемещены в Корзину.`)) return;
    try {
      const result = await window.appAPI.deleteLibrary(item.id);
      state.libraries = result.libraries;
      state.library = result.library;
      state.libraryPreferencesById = await window.appAPI.getLibraryPreferences();
      state.expandedLibraryId = activeLibraryId();
      state.selectedId = "root";
      state.playerVideoId = null;
      startCaptionSession();
      closeLibraryDialog();
      render();
      showToast("Библиотека перемещена в Корзину");
    } catch (error) { showToast(`Не удалось удалить библиотеку: ${error.message}`); }
  }
  function manageLibraries() {
    closeLibraryDialog();
    const dialog = document.createElement("div");
    dialog.className = "dialog-backdrop";
    dialog.id = "libraryDialog";
    const rows = state.libraries.libraries.map(item => `<div class="library-manager-row"><div><strong>${escapeHtml(item.name)}</strong><small>${item.id === activeLibraryId() ? "Текущая библиотека" : ""}</small></div><div><button class="subtle-button" data-library-export="${item.id}">Экспорт</button><button class="subtle-button" data-library-rename="${item.id}">Переименовать</button><button class="subtle-button danger" data-library-delete="${item.id}" ${state.libraries.libraries.length === 1 ? "disabled" : ""}>Удалить</button></div></div>`).join("");
    dialog.innerHTML = `<section class="dialog-card library-manager" aria-labelledby="libraryDialogTitle"><h2 id="libraryDialogTitle">Управление библиотеками</h2><div class="library-manager-list">${rows}</div><div class="form-actions"><button class="subtle-button" type="button" data-dialog-close>Закрыть</button><button class="primary" type="button" data-library-create>Новая библиотека</button></div></section>`;
    dialog.addEventListener("click", event => { if (event.target === dialog) closeLibraryDialog(); });
    dialog.querySelector("[data-dialog-close]").addEventListener("click", closeLibraryDialog);
    dialog.querySelector("[data-library-create]").addEventListener("click", () => { closeLibraryDialog(); createLibrary(); });
    dialog.querySelectorAll("[data-library-export]").forEach(button => button.addEventListener("click", async () => {
      try { const result = await window.appAPI.exportLibrary(button.dataset.libraryExport); if (!result.canceled) showToast("Библиотека экспортирована"); } catch (error) { showToast(error.message); }
    }));
    dialog.querySelectorAll("[data-library-rename]").forEach(button => button.addEventListener("click", () => renameLibrary(button.dataset.libraryRename)));
    dialog.querySelectorAll("[data-library-delete]").forEach(button => button.addEventListener("click", () => deleteLibrary(button.dataset.libraryDelete)));
    document.body.append(dialog);
  }
  async function showBackups() {
    try {
      const backups = await window.appAPI.getLibraryBackups();
      if (!backups.length) return showToast("Резервных копий пока нет");
      closeLibraryDialog();
      const dialog = document.createElement("div");
      dialog.className = "dialog-backdrop";
      dialog.id = "libraryDialog";
      dialog.innerHTML = `<section class="dialog-card library-manager" aria-labelledby="libraryDialogTitle"><h2 id="libraryDialogTitle">Резервные копии</h2><div class="library-manager-list">${backups.map(item => `<div class="library-manager-row"><div><strong>${new Date(item.modifiedAt).toLocaleString("ru-RU")}</strong><small>Автоматическая копия</small></div><button class="subtle-button" data-backup="${escapeHtml(item.name)}">Восстановить</button></div>`).join("")}</div><div class="form-actions"><button class="subtle-button" type="button" data-dialog-close>Закрыть</button></div></section>`;
      dialog.addEventListener("click", event => { if (event.target === dialog) closeLibraryDialog(); });
      dialog.querySelector("[data-dialog-close]").addEventListener("click", closeLibraryDialog);
      dialog.querySelectorAll("[data-backup]").forEach(button => button.addEventListener("click", async () => {
        if (!confirm("Восстановить эту версию? Текущее состояние сначала будет сохранено в резервную копию.")) return;
        try { const result = await window.appAPI.restoreLibraryBackup(button.dataset.backup); state.library = result.library; state.selectedId = "root"; state.playerVideoId = null; startCaptionSession(); closeLibraryDialog(); render(); showToast("Библиотека восстановлена"); } catch (error) { showToast(`Не удалось восстановить библиотеку: ${error.message}`); }
      }));
      document.body.append(dialog);
    } catch (error) { showToast(`Не удалось получить резервные копии: ${error.message}`); }
  }
  function showLibraryMenu() {
    closeContextMenu();
    const trigger = document.querySelector("#librarySwitcher");
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "context-menu library-menu";
    menu.style.left = `${box.left}px`;
    menu.style.top = `${box.bottom + 6}px`;
    menu.innerHTML = `${state.libraries.libraries.map(item => `<button data-library-select="${item.id}" class="${item.id === activeLibraryId() ? "active" : ""}">${escapeHtml(item.name)}</button>`).join("")}<span class="menu-divider"></span><button data-library-menu="create">Создать библиотеку</button><button data-library-menu="import">Импортировать как новую</button><button data-library-menu="export">Экспортировать текущую</button><button data-library-menu="backups">Резервные копии…</button><button data-library-menu="manage">Управлять библиотеками…</button>`;
    menu.addEventListener("click", event => {
      const target = event.target.closest("button");
      if (!target) return;
      closeContextMenu();
      if (target.dataset.librarySelect) switchLibrary(target.dataset.librarySelect);
      if (target.dataset.libraryMenu === "create") createLibrary();
      if (target.dataset.libraryMenu === "import") importLibrary();
      if (target.dataset.libraryMenu === "export") exportLibrary();
      if (target.dataset.libraryMenu === "backups") showBackups();
      if (target.dataset.libraryMenu === "manage") manageLibraries();
    });
    document.body.append(menu);
  }
  function closeContextMenu() { document.querySelector(".context-menu")?.remove(); }
  function showContextMenu(event, nodeId) {
    event.preventDefault(); closeContextMenu(); state.selectedId = nodeId;
    const node = findNode(nodeId);
    const menu = document.createElement("div"); menu.className = "context-menu"; menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`; menu.style.top = `${Math.min(event.clientY, window.innerHeight - 165)}px`;
    menu.innerHTML = `<button data-menu="folder">${icon("folderPlus")}<span>Новая папка</span></button><button data-menu="video">${icon("videoPlus")}<span>Добавить ролик</span></button><button data-menu="rename">${icon("edit")}<span>Переименовать</span></button>${node.id === "root" ? "" : `<button class="danger" data-menu="delete">${icon("trash")}<span>Удалить</span></button>`}`;
    menu.addEventListener("click", event => { const action = event.target.closest("[data-menu]")?.dataset.menu; if (!action) return; closeContextMenu(); if (action === "folder") createFolder(); if (action === "video") createVideo(); if (action === "rename") renameSelected(); if (action === "delete") deleteSelected(); });
    document.body.append(menu);
  }
  function playerCommand(command, value) {
    const result = window.PlayerControls.execute({ player: state.player, command, value, captions: studyTrack()?.segments || [] });
    if (!result.ok) showToast(result.message);
    return result.ok;
  }

  function bindEvents() {
    document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => { state.activeTab = button.dataset.tab; render(); }));
    document.querySelector("#newFolder")?.addEventListener("click", createFolder); document.querySelector("#newVideo")?.addEventListener("click", createVideo); document.querySelector("#newVideoEmpty")?.addEventListener("click", createVideo); document.querySelector("#addVideoTop")?.addEventListener("click", createVideo); document.querySelector("#librarySwitcher")?.addEventListener("click", event => { event.stopPropagation(); showLibraryMenu(); }); document.querySelector("#manageLibraries")?.addEventListener("click", manageLibraries);
    document.querySelector("#createLibraryMain")?.addEventListener("click", createLibrary);
    document.querySelector("#importLibraryMain")?.addEventListener("click", importLibrary);
    document.querySelector("#showBackupsMain")?.addEventListener("click", showBackups);
    document.querySelectorAll("[data-library-toggle]").forEach(button => button.addEventListener("click", () => { state.expandedLibraryId = state.expandedLibraryId === button.dataset.libraryToggle ? "" : button.dataset.libraryToggle; render(); }));
    document.querySelectorAll("[data-library-open]").forEach(button => button.addEventListener("click", () => switchLibrary(button.dataset.libraryOpen)));
    document.querySelectorAll("[data-library-study-language], [data-library-translation-language]").forEach(select => select.addEventListener("change", async () => {
      const libraryId = select.dataset.libraryStudyLanguage || select.dataset.libraryTranslationLanguage;
      const preferences = state.libraryPreferencesById[libraryId];
      const studyLanguage = document.querySelector(`[data-library-study-language="${libraryId}"]`).value;
      const translationLanguage = document.querySelector(`[data-library-translation-language="${libraryId}"]`).value;
      try {
        state.libraryPreferencesById[libraryId] = await window.appAPI.saveLibraryPreferences(libraryId, { ...preferences, studyLanguage, translationLanguage });
        if (libraryId === activeLibraryId()) state.library.preferences = state.libraryPreferencesById[libraryId];
        render();
        showToast("Языки библиотеки сохранены");
      } catch (error) { render(); showToast(error.message); }
    }));
    document.querySelectorAll("[data-library-export]").forEach(button => button.addEventListener("click", async () => { try { const result = await window.appAPI.exportLibrary(button.dataset.libraryExport); if (!result.canceled) showToast("Библиотека экспортирована"); } catch (error) { showToast(`Не удалось экспортировать библиотеку: ${error.message}`); } }));
    document.querySelectorAll("[data-library-rename]").forEach(button => button.addEventListener("click", () => renameLibrary(button.dataset.libraryRename)));
    document.querySelectorAll("[data-library-delete]").forEach(button => button.addEventListener("click", () => deleteLibrary(button.dataset.libraryDelete)));
    document.querySelectorAll("[data-toggle]").forEach(button => button.addEventListener("click", event => { event.stopPropagation(); const id = button.dataset.toggle; if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id); render(); }));
    document.querySelectorAll(".tree-row").forEach(row => {
      row.addEventListener("click", () => { state.selectedId = row.dataset.nodeId; render(); });
      row.addEventListener("dblclick", () => { const node = findNode(row.dataset.nodeId); if (node.type === "video") openPlayer(node); });
      row.addEventListener("contextmenu", event => showContextMenu(event, row.dataset.nodeId));
      row.addEventListener("dragstart", event => { state.draggedNodeId = row.dataset.nodeId; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", state.draggedNodeId); requestAnimationFrame(() => row.classList.add("dragging")); });
      row.addEventListener("dragend", () => { state.draggedNodeId = ""; clearDropIndicators(); document.querySelectorAll(".tree-row.dragging").forEach(item => item.classList.remove("dragging")); });
      row.addEventListener("dragover", event => {
        const target = findNode(row.dataset.nodeId);
        const moving = findNode(state.draggedNodeId || event.dataTransfer.getData("text/plain"));
        const placement = dropPlacement(row, target, event);
        const destination = placement === "inside" ? target : findParent(target.id);
        if (!canMoveNode(moving, destination)) return;
        event.preventDefault(); event.dataTransfer.dropEffect = "move"; clearDropIndicators();
        row.classList.add(placement === "inside" ? "drag-over" : `drop-${placement}`);
      });
      row.addEventListener("dragleave", event => { if (!row.contains(event.relatedTarget)) clearDropIndicators(); });
      row.addEventListener("drop", async event => {
        event.preventDefault(); clearDropIndicators();
        const target = findNode(row.dataset.nodeId);
        const moving = findNode(state.draggedNodeId || event.dataTransfer.getData("text/plain"));
        const placement = dropPlacement(row, target, event);
        const destination = placement === "inside" ? target : findParent(target.id);
        if (!canMoveNode(moving, destination)) return;
        const targetIndex = destination.children.findIndex(child => child.id === target.id);
        const index = placement === "inside" ? destination.children.length : targetIndex + (placement === "after" ? 1 : 0);
        if (!moveNode(moving, destination, index)) return;
        if (placement === "inside") state.expanded.add(destination.id);
        state.selectedId = moving.id;
        await saveLibrary(); render();
      });
    });
    document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => { const action = button.dataset.action; if (action === "rename") renameSelected(); if (action === "delete") deleteSelected(); if (action === "add-video") createVideo(); }));
    document.querySelector("#folderForm")?.addEventListener("submit", async event => { event.preventDefault(); const folder = selected(); folder.playlistUrl = new FormData(event.currentTarget).get("playlistUrl").trim(); await saveLibrary(); showToast("Ссылка на плейлист сохранена"); render(); });
    document.querySelector("#openPlaylist")?.addEventListener("click", async () => { const url = document.querySelector("#folderForm [name=playlistUrl]").value.trim(); if (!url) return showToast("Вставьте ссылку на плейлист YouTube"); try { await window.appAPI.openPlaylist(url); } catch (error) { showToast(error.message); } });
    document.querySelector("#importPlaylistVideos")?.addEventListener("click", importPlaylistVideos);
    document.querySelector("#videoForm")?.addEventListener("submit", async event => { event.preventDefault(); const data = new FormData(event.currentTarget); const video = selected(); video.name = data.get("name").trim(); video.url = data.get("url").trim(); await saveLibrary(); showToast("Свойства ролика сохранены"); render(); }); document.querySelector("#openPlayer")?.addEventListener("click", () => openPlayer(selected()));
    document.querySelector("#openYoutube")?.addEventListener("click", async () => { const url = document.querySelector("#videoForm [name=url]").value.trim(); if (!url) return showToast("Вставьте ссылку на YouTube"); try { await window.appAPI.openYoutube(url); } catch (error) { showToast(error.message); } });
    document.querySelector("#playerLinkForm")?.addEventListener("submit", event => { event.preventDefault(); playUrl(new FormData(event.currentTarget).get("url")); });
    document.querySelector("#playerLinkForm [name=url]")?.addEventListener("input", event => {
      if (state.playerVideoId) return;
      state.playerUrl = event.currentTarget.value.trim();
      if (state.playerUrl) localStorage.setItem(playerUrlDraftKey, state.playerUrl);
      else localStorage.removeItem(playerUrlDraftKey);
    });
    document.querySelector("#addRootVideo")?.addEventListener("click", () => addUrlToRoot(new FormData(document.querySelector("#playerLinkForm")).get("url")));
    document.querySelectorAll("[data-video-navigation]").forEach(button => button.addEventListener("click", () => {
      const target = adjacentVideos()[button.dataset.videoNavigation];
      if (target) openPlayer(target, true);
    }));
    document.querySelector("#loadStudyTrack")?.addEventListener("click", () => downloadTrackForActive(studyLanguage()));
    document.querySelector("#createTranslationTrack")?.addEventListener("click", createTranslationForActive);
    document.querySelector("#studyLanguage")?.addEventListener("change", async event => { preservePlayerUrlDraft(); const language = event.target.value === "__other__" ? await showLanguagePicker() : event.target.value; if (!language) return render(); state.captions.active.studyLanguage = language; await saveCaptionDocument(); render(); if (!studyTrack()?.segments.length) { showToast(`Ищу на YouTube дорожку «${languageName(language)}»…`); void downloadTrackForActive(language); } });
    document.querySelector("#translationLanguage")?.addEventListener("change", async event => { preservePlayerUrlDraft(); const language = event.target.value === "__other__" ? await showLanguagePicker() : event.target.value; if (!language) return render(); state.captions.active.translationLanguage = language; await saveCaptionDocument(); render(); if (!translationTrack()) showToast("Для выбранного языка нужно создать перевод"); });
    document.querySelectorAll("[data-track-version]").forEach(select => select.addEventListener("change", async () => { window.LanguageModel.setPreferredTrack(state.captions, select.dataset.trackVersion, select.value); await saveCaptionDocument(); render(); }));
    document.querySelector("#swapLanguages")?.addEventListener("click", () => { saveCurrentPlayerPosition(); state.layout.swapped = !state.layout.swapped; persistLayout(); render(); });
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
    const translationSettings = document.querySelector('[data-settings-panel="translation"]');
    if (translationSettings && !translationSettings.querySelector('[name="translationInstruction"]')) {
      const row = document.createElement("label");
      row.className = "settings-row";
      row.innerHTML = `<span><strong>Инструкция для OpenRouter</strong><small>Применяется ко всем переводам субтитров.</small></span><textarea name="translationInstruction" rows="4" placeholder="Например: переводи максимально буквально">${escapeHtml(state.settings.translation.instruction || "")}</textarea>`;
      translationSettings.querySelector('[name="model"]')?.closest("label")?.after(row);
    }
    document.querySelector("#settingsForm")?.addEventListener("submit", () => {
      const instruction = document.querySelector('#settingsForm [name="translationInstruction"]');
      if (instruction) state.settings.translation.instruction = instruction.value.trim();
    }, true);
    const enabledLanguagesSelect = document.querySelector('#settingsForm [name="enabledLanguages"]');
    if (enabledLanguagesSelect) {
      const refreshLanguagePreview = () => {
        const selectedLanguages = sortLanguages([...enabledLanguagesSelect.selectedOptions].map(option => option.value));
        const tags = document.querySelector("#languageTags");
        if (tags) tags.innerHTML = selectedLanguages.map(language => `<button type="button" class="language-tag" data-language-tag="${language}" aria-label="Удалить язык: ${escapeHtml(languageName(language))}">${escapeHtml(languageName(language))}<small>${escapeHtml(language.toUpperCase())}</small><b aria-hidden="true">×</b></button>`).join("") || '<span class="language-tags-empty">Выберите хотя бы один язык</span>';
        for (const name of ["studyLanguage", "translationLanguage"]) {
          const select = document.querySelector(`#settingsForm [name="${name}"]`);
          if (!select || !selectedLanguages.length) continue;
          const current = select.value;
          select.innerHTML = selectedLanguages.map(language => `<option value="${language}" ${language === current ? "selected" : ""}>${escapeHtml(languageName(language))}</option>`).join("");
          if (!selectedLanguages.includes(current)) select.value = selectedLanguages[0];
        }
      };
      enabledLanguagesSelect.addEventListener("mousedown", event => {
        const option = event.target.closest("option");
        if (!option) return;
        event.preventDefault();
        option.selected = !option.selected;
        enabledLanguagesSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      enabledLanguagesSelect.addEventListener("change", refreshLanguagePreview);
      document.querySelector("#languageTags")?.addEventListener("click", event => {
        const tag = event.target.closest("[data-language-tag]");
        if (!tag) return;
        const option = [...enabledLanguagesSelect.options].find(item => item.value === tag.dataset.languageTag);
        if (!option) return;
        option.selected = false;
        enabledLanguagesSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    document.querySelector("#settingsForm")?.addEventListener("submit", async event => { event.preventDefault(); const form = new FormData(event.currentTarget); const apiKey = form.get("apiKey"); const payload = { settings: clone(state.settings), apiKey: apiKey ? apiKey : undefined }; payload.settings.theme = form.get("theme"); payload.settings.onboarding.defaultLibraryOfferEnabled = form.get("defaultLibraryOfferEnabled") === "on"; payload.settings.languages = { enabled: form.getAll("enabledLanguages"), studyLanguage: form.get("studyLanguage"), translationLanguage: form.get("translationLanguage"), detectionThreshold: Number(form.get("detectionThreshold")) }; payload.settings.translation.model = form.get("model").trim(); Object.assign(payload.settings.transcription, { modelRoot: form.get("modelRoot").trim(), model: form.get("whisperModel").trim(), uvPath: form.get("uvPath").trim(), ytDlpPath: form.get("ytDlpPath").trim() }); try { state.settings = await window.appAPI.saveSettings(payload); showToast("Настройки сохранены"); render(); } catch (error) { showToast(error.message); } }); document.querySelector("#resetSettings")?.addEventListener("click", async () => { if (!confirm("Сбросить настройки?")) return; state.settings = await window.appAPI.getDefaultSettings(); render(); showToast("Черновик настроек сброшен"); });
    const apiKeyInput = document.querySelector('#settingsForm [name="apiKey"]');
    if (apiKeyInput) {
      const wrapper = document.createElement("div");
      wrapper.className = "settings-input-action";
      apiKeyInput.replaceWith(wrapper);
      wrapper.append(apiKeyInput);
      const openApiKeys = document.createElement("button");
      openApiKeys.type = "button";
      openApiKeys.className = "subtle-button folder-action";
      openApiKeys.title = "Открыть ключи OpenRouter в браузере";
      openApiKeys.setAttribute("aria-label", openApiKeys.title);
      openApiKeys.innerHTML = icon("externalLink");
      openApiKeys.addEventListener("click", () => window.appAPI.openOpenRouterApiKeys());
      wrapper.append(openApiKeys);
    }
  }

  const onYouTubeIframeAPIReady = () => { state.youTubeReady = true; if (state.activeTab === "player") render(); };
  window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
  window.addEventListener("load", () => { if (window.YT?.Player && !state.youTubeReady) onYouTubeIframeAPIReady(); });
  window.appAPI.onTranslationProgress?.(progress => {
    const context = activeCaptionContext();
    if (context?.key !== progress.videoId) return;
    if (progress.stage === "completed") {
      const prefix = `${activeLibraryId()}:${context.key}:`;
      for (const key of state.captionDownloadStates.keys()) {
        if (!key.startsWith(prefix)) continue;
        state.captionDownloadStates.delete(key);
      }
      window.appAPI.getCaptions(context.key, activeLibraryId()).then(captions => {
        const currentContext = activeCaptionContext();
        if (currentContext?.key !== progress.videoId) return;
        state.captions = captions;
        render();
        showToast("Перевод готов");
      }).catch(error => showToast(error?.message || "Не удалось обновить готовую дорожку", 8000));
      return;
    }
    const message = `Перевожу: ${progress.completed} из ${progress.total} реплик…`;
    updateActiveCaptionDownloadMessage(message);
    showToast(message);
  });
  window.appAPI.onTranscriptionProgress?.(progress => {
    const context = activeCaptionContext();
    if (context?.key !== progress.videoId) return;
    if (progress.stage === "download") {
      updateActiveCaptionDownloadMessage(`Whisper: загружено видео ${progress.percent}%…`);
      showToast(`Загружено видео ${progress.percent}%…`);
    } else if (progress.stage === "transcription-start") {
      updateActiveCaptionDownloadMessage("Видео загружено. Запускаю Whisper…");
      showToast("Видео загружено. Запускаю faster-whisper…");
    } else {
      const message = progress.percent >= 100
        ? "Whisper завершил распознавание. Подготавливаю дорожку…"
        : `Whisper: распознано ${progress.percent}%…`;
      updateActiveCaptionDownloadMessage(message);
      showToast(message);
    }
  });
  async function checkForUpdateOnStart() {
    try {
      const result = await window.appAPI.checkForUpdates();
      if (result.status === "available") {
        state.updateAvailable = result;
        render();
        setTimeout(showUpdateDialog, 800);
      }
    } catch {}
  }
  async function showUpdateDialog() {
    if (!state.updateAvailable) return;
    const info = state.updateAvailable;
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    backdrop.innerHTML = `<section class="dialog-card update-dialog" role="dialog" aria-modal="true"><h2>Доступно обновление v${escapeHtml(info.version)}</h2><div class="update-body"><p>${escapeHtml(info.body || "Нет описания.").replace(/\n/g, "<br>")}</p></div><div class="form-actions"><a class="subtle-button update-guide-link" href="${userGuideUrl}" target="_blank" rel="noreferrer">${icon("externalLink")}<span>Документация</span></a><button type="button" class="primary" id="updateConfirmBtn">Обновить</button><button type="button" class="subtle-button" data-cancel>Позже</button></div></section>`;
    const finish = () => { backdrop.remove(); };
    backdrop.addEventListener("click", event => { if (event.target === backdrop) finish(); });
    backdrop.querySelector("[data-cancel]").addEventListener("click", finish);
    backdrop.querySelector("#updateConfirmBtn").addEventListener("click", async () => {
      backdrop.querySelector("#updateConfirmBtn").disabled = true;
      backdrop.querySelector("#updateConfirmBtn").textContent = "Скачивание…";
      const unsub = window.appAPI.onDownloadProgress(progress => {
        state.updateProgress = progress;
        backdrop.querySelector("#updateConfirmBtn").textContent = "Скачивание " + progress + "%";
      });
      const result = await window.appAPI.downloadUpdate();
      unsub();
      if (result.ok) {
        backdrop.querySelector("#updateConfirmBtn").textContent = "Установка…";
        await window.appAPI.installUpdate();
      } else {
        backdrop.querySelector("#updateConfirmBtn").disabled = false;
        backdrop.querySelector("#updateConfirmBtn").textContent = "Ошибка. Попробовать ещё раз";
        showToast("Ошибка скачивания: " + result.reason);
      }
    });
    document.body.append(backdrop);
  }
    function renderStatusBar() {
    const versionEl = document.querySelector("#versionLabel");
    if (!versionEl) return;
    versionEl.classList.toggle("has-update", !!state.updateAvailable);
    const badge = versionEl.querySelector(".update-badge");
    if (state.updateAvailable && !badge) {
      const b = document.createElement("span");
      b.className = "update-badge";
      b.textContent = "!";
      versionEl.append(b);
    } else if (!state.updateAvailable && badge) {
      badge.remove();
    }
  }
  window.addEventListener("beforeunload", saveCurrentPlayerPosition);
  document.addEventListener("click", event => { if (!event.target.closest(".context-menu")) closeContextMenu(); });
    document.querySelector("#versionLabel")?.addEventListener("click", showUpdateDialog);
  document.addEventListener("keydown", event => { if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return; if (state.activeTab !== "player") return; if (event.code === "Space") { event.preventDefault(); playerCommand("play"); } if (event.key === "ArrowLeft") playerCommand("back"); if (event.key === "ArrowRight") playerCommand("forward"); if (event.key === "[") playerCommand("rate", .75); if (event.key === "]") playerCommand("rate", 1.25); if (event.key.toLowerCase() === "r") playerCommand("repeat"); });
  Promise.all([window.appAPI.getInfo(), window.appAPI.getLibrary(), window.appAPI.getLibraries(), window.appAPI.getLibraryPreferences(), window.appAPI.getSettings()]).then(async ([info, library, libraries, libraryPreferencesById, settings]) => { state.info = info; state.library = library; state.libraries = libraries; state.libraryPreferencesById = libraryPreferencesById; state.expandedLibraryId = libraries.activeId; state.settings = settings; await offerDefaultLibrary();
    checkForUpdateOnStart(); render(); }).catch(error => { app.textContent = `Не удалось загрузить приложение: ${error.message}`; });
})();
