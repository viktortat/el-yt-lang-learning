const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCaptionSegments, looksRolling } = require("./caption-parser");

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
