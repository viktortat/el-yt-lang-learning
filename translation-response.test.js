const test = require("node:test");
const assert = require("node:assert/strict");
const { translationsFromModel } = require("./translation-response");

const translations = [{ id: "en-1", text: "Привет" }];

test("reads a plain JSON array returned by a model", () => {
  assert.deepEqual(translationsFromModel(JSON.stringify(translations)), translations);
});

test("reads JSON from a Markdown code block without confusing brackets in prose", () => {
  const response = "Результат [готов].\n```json\n" + JSON.stringify(translations) + "\n```";
  assert.deepEqual(translationsFromModel(response), translations);
});

test("reads an object wrapper used by structured-output models", () => {
  assert.deepEqual(translationsFromModel({ translations }), translations);
  assert.deepEqual(translationsFromModel(JSON.stringify({ translations })), translations);
});

test("rejects a response that contains no translation array", () => {
  assert.throws(() => translationsFromModel("Перевод готов."), /не вернула JSON-перевод/);
});
