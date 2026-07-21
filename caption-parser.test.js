const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCaptionSegments, looksRolling } = require("./caption-parser");
const LanguageModel = require("./language-model");
const { normalizeCaptionDocument, preferredTrack } = LanguageModel;

const rolling = [
  { start: 3.27, end: 3.28, text: "Welcome back to Simple Spoken English." },
  { start: 3.28, end: 4.79, text: "Welcome back to Simple Spoken English. I'm Jack." },
  { start: 4.79, end: 4.80, text: "I'm Jack." },
  { start: 4.80, end: 7.63, text: "I'm Jack. And today, I'm not just going to teach" },
  { start: 7.63, end: 7.64, text: "And today, I'm not just going to teach" },
  { start: 7.64, end: 9.19, text: "And today, I'm not just going to teach you English." },
];

test("collapses YouTube rolling captions into complete non-repeating sentences", () => {
  assert.equal(looksRolling(rolling), true);
  assert.deepEqual(normalizeCaptionSegments(rolling), [
    { id: "en-1", start: 3.28, end: 4.79, text: "Welcome back to Simple Spoken English. I'm Jack." },
    { id: "en-2", start: 4.8, end: 9.19, text: "And today, I'm not just going to teach you English." },
  ]);
});

test("keeps normal authored captions separate", () => {
  const normal = [
    { start: 0, end: 2, text: "Hello." },
    { start: 2, end: 4, text: "How are you?" },
  ];
  assert.deepEqual(normalizeCaptionSegments(normal), [
    { id: "en-1", start: 0, end: 2, text: "Hello." },
    { id: "en-2", start: 2, end: 4, text: "How are you?" },
  ]);
});

test("migrates legacy English and Russian captions to multilingual tracks", () => {
  const document = normalizeCaptionDocument({ version: 1, english: [{ id: "en-1", start: 0, end: 1, text: "Hello" }], russian: [{ id: "en-1", start: 0, end: 1, text: "Привет" }], studiedIds: ["en-1"] });
  assert.equal(document.version, 2);
  assert.equal(preferredTrack(document, "en").segments[0].text, "Hello");
  assert.equal(preferredTrack(document, "ru").segments[0].text, "Привет");
  assert.deepEqual(document.studiedIds, ["en-1"]);
});

test("marks derived translations stale when a newer source track is selected", () => {
  const captions = LanguageModel.emptyCaptionDocument();
  const first = LanguageModel.addTrack(captions, LanguageModel.makeTrack({ language: "de", source: "whisper", revision: 1, segments: [{ id: "de-1", start: 0, end: 1, text: "Hallo" }] }));
  const translated = LanguageModel.addTrack(captions, LanguageModel.makeTrack({ language: "ru", source: "openrouter", kind: "translation", sourceTrackId: first.id, segments: [{ id: "de-1", start: 0, end: 1, text: "Привет" }] }));
  LanguageModel.addTrack(captions, LanguageModel.makeTrack({ language: "de", source: "whisper", revision: 2, segments: [{ id: "de-1", start: 0, end: 1, text: "Guten Tag" }] }));
  assert.equal(captions.tracks[translated.id].stale, true);
});
