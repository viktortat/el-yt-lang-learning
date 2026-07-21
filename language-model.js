(function exposeLanguageModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LanguageModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const SUPPORTED_LANGUAGES = [
    "af", "am", "ar", "as", "az", "ba", "be", "bg", "bn", "bo", "br", "bs", "ca", "cs", "cy", "da", "de", "el", "en", "es", "et", "eu", "fa", "fi", "fo", "fr", "gl", "gu", "ha", "haw", "he", "hi", "hr", "ht", "hu", "hy", "id", "is", "it", "ja", "jw", "ka", "kk", "km", "kn", "ko", "la", "lb", "ln", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "ne", "nl", "nn", "no", "oc", "pa", "pl", "ps", "pt", "ro", "ru", "sa", "sd", "si", "sk", "sl", "sn", "so", "sq", "sr", "su", "sv", "sw", "ta", "te", "tg", "th", "tk", "tl", "tr", "tt", "uk", "ur", "uz", "vi", "yi", "yo", "zh"
  ];

  function normalizeLanguage(value, fallback = "") {
    const normalized = String(value || "").trim().replace(/_/g, "-").toLowerCase();
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized) ? normalized : fallback;
  }

  function baseLanguage(value) { return normalizeLanguage(value).split("-")[0]; }
  function sameLanguage(left, right) { return !!baseLanguage(left) && baseLanguage(left) === baseLanguage(right); }
  function decodeHtmlEntities(value) {
    const named = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
    return String(value || "").replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, code) => {
      if (code[0] !== "#") return named[code.toLowerCase()] || entity;
      const number = Number.parseInt(code.slice(code[1].toLowerCase() === "x" ? 2 : 1), code[1].toLowerCase() === "x" ? 16 : 10);
      try { return Number.isValidCodePoint(number) ? String.fromCodePoint(number) : entity; } catch { return entity; }
    });
  }

  function normalizeLanguageSettings(value = {}) {
    const enabled = [...new Set((Array.isArray(value.enabled) ? value.enabled : ["en", "ru"])
      .map(item => normalizeLanguage(item)).filter(Boolean))];
    const studyLanguage = normalizeLanguage(value.studyLanguage, "en");
    const translationLanguage = normalizeLanguage(value.translationLanguage, "ru");
    for (const language of [studyLanguage, translationLanguage]) if (!enabled.includes(language)) enabled.push(language);
    return {
      enabled,
      studyLanguage,
      translationLanguage,
      detectionThreshold: Math.max(0.5, Math.min(0.99, Number(value.detectionThreshold) || 0.8))
    };
  }

  function normalizeLibraryPreferences(value = {}, defaults = normalizeLanguageSettings()) {
    const preferences = value && typeof value === "object" ? value : {};
    return {
      studyLanguage: normalizeLanguage(preferences.studyLanguage, defaults.studyLanguage),
      translationLanguage: normalizeLanguage(preferences.translationLanguage, defaults.translationLanguage),
      translationInstruction: String(preferences.translationInstruction || "").trim()
    };
  }

  function emptyCaptionDocument(preferences = {}) {
    return {
      version: 2,
      speechLanguage: null,
      tracks: {},
      preferredByLanguage: {},
      active: {
        studyLanguage: normalizeLanguage(preferences.studyLanguage, "en"),
        translationLanguage: normalizeLanguage(preferences.translationLanguage, "ru")
      },
      studiedIds: [],
      decisions: {}
    };
  }

  function cleanSegments(segments, language = "") {
    const prefix = baseLanguage(language) || "seg";
    return (Array.isArray(segments) ? segments : []).map((segment, index) => ({
      id: String(segment?.id || `${prefix}-${index + 1}`),
      start: Number(segment?.start),
      end: Number(segment?.end),
      text: decodeHtmlEntities(segment?.text).replace(/(^|\s)>>\s*/g, "$1").replace(/\s+/g, " ").trim(),
      ...(segment?.language ? { language: normalizeLanguage(segment.language) || undefined } : {})
    })).filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.text);
  }

  function trackId(language, source, revision = 1) {
    return `${normalizeLanguage(language, "und")}:${String(source || "unknown").replace(/[^a-z0-9-]/gi, "-").toLowerCase()}:${revision}`;
  }

  function makeTrack({ language, source, kind = "source", segments = [], sourceTrackId = null, revision = 1, stale = false, label = "", confidence = null }) {
    const normalizedLanguage = normalizeLanguage(language, "und");
    const id = trackId(normalizedLanguage, source, revision);
    return { id, language: normalizedLanguage, source, kind, sourceTrackId, revision, stale: Boolean(stale), userEdited: false, label, confidence, segments: cleanSegments(segments, normalizedLanguage) };
  }

  function normalizeTrack(value, fallbackId) {
    const language = normalizeLanguage(value?.language, fallbackId?.split(":")[0] || "und");
    const source = String(value?.source || "legacy");
    const revision = Math.max(1, Number(value?.revision) || 1);
    const id = String(value?.id || fallbackId || trackId(language, source, revision));
    return {
      id, language, source,
      kind: value?.kind === "translation" ? "translation" : "source",
      sourceTrackId: value?.sourceTrackId || null,
      revision,
      stale: Boolean(value?.stale),
      userEdited: Boolean(value?.userEdited),
      label: String(value?.label || ""),
      confidence: Number.isFinite(Number(value?.confidence)) ? Number(value.confidence) : null,
      segments: cleanSegments(value?.segments, language)
    };
  }

  function normalizeCaptionDocument(value, preferences = {}) {
    const result = emptyCaptionDocument(preferences);
    if (value?.version === 2 && value.tracks && typeof value.tracks === "object") {
      for (const [id, candidate] of Object.entries(value.tracks)) {
        const track = normalizeTrack(candidate, id);
        result.tracks[track.id] = track;
      }
      result.speechLanguage = normalizeLanguage(value.speechLanguage) || null;
      result.preferredByLanguage = { ...(value.preferredByLanguage || {}) };
      result.active = {
        studyLanguage: normalizeLanguage(value.active?.studyLanguage, result.active.studyLanguage),
        translationLanguage: normalizeLanguage(value.active?.translationLanguage, result.active.translationLanguage)
      };
      result.studiedIds = Array.isArray(value.studiedIds) ? value.studiedIds.map(String) : [];
      result.decisions = value.decisions && typeof value.decisions === "object" ? value.decisions : {};
    } else {
      const english = cleanSegments(value?.english, "en");
      const russian = cleanSegments(value?.russian, "ru");
      if (english.length) addTrack(result, makeTrack({ language: "en", source: "legacy", segments: english }));
      if (russian.length) {
        const sourceTrack = preferredTrack(result, "en");
        addTrack(result, makeTrack({ language: "ru", source: "legacy", kind: "translation", sourceTrackId: sourceTrack?.id || null, segments: russian }));
      }
      result.speechLanguage = english.length ? "en" : null;
      result.studiedIds = Array.isArray(value?.studiedIds) ? value.studiedIds.map(String) : [];
      if (value?.translatedAutoCaptions) result.decisions.translatedAutoCaptions = value.translatedAutoCaptions;
    }
    for (const [language, id] of Object.entries(result.preferredByLanguage)) {
      if (!result.tracks[id] || !sameLanguage(language, result.tracks[id].language)) delete result.preferredByLanguage[language];
    }
    for (const track of Object.values(result.tracks)) if (!result.preferredByLanguage[track.language]) result.preferredByLanguage[track.language] = track.id;
    return result;
  }

  function addTrack(document, trackValue) {
    const track = normalizeTrack(trackValue, trackValue?.id);
    if (track.kind === "source") {
      const previous = preferredTrack(document, track.language);
      if (previous && previous.id !== track.id) {
        for (const candidate of Object.values(document.tracks || {})) {
          if (candidate.kind === "translation" && candidate.sourceTrackId === previous.id && !candidate.userEdited) candidate.stale = true;
        }
      }
    }
    document.tracks[track.id] = track;
    document.preferredByLanguage[track.language] = track.id;
    return track;
  }

  function tracksForLanguage(document, language) {
    return Object.values(document?.tracks || {}).filter(track => sameLanguage(track.language, language));
  }

  function preferredTrack(document, language) {
    const id = document?.preferredByLanguage?.[normalizeLanguage(language)];
    return document?.tracks?.[id] || tracksForLanguage(document, language)[0] || null;
  }

  function setPreferredTrack(document, language, trackIdValue) {
    const track = document?.tracks?.[trackIdValue];
    if (track && sameLanguage(track.language, language)) document.preferredByLanguage[normalizeLanguage(language)] = track.id;
    return document;
  }

  return {
    SUPPORTED_LANGUAGES, normalizeLanguage, baseLanguage, sameLanguage,
    normalizeLanguageSettings, normalizeLibraryPreferences,
    emptyCaptionDocument, normalizeCaptionDocument, makeTrack, addTrack,
    tracksForLanguage, preferredTrack, setPreferredTrack, cleanSegments
  };
});
