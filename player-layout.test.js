const test = require("node:test");
const assert = require("node:assert/strict");
const { gridTemplate } = require("./player-layout");

const base = { mode: "columns", english: true, russian: true, leftWidth: 300, rightWidth: 340 };

test("player grid preserves the video column for every panel combination", () => {
  assert.equal(gridTemplate(base), "300px 6px minmax(380px, 1fr) 6px 340px");
  assert.equal(gridTemplate({ ...base, english: false }), "42px minmax(380px, 1fr) 6px 340px");
  assert.equal(gridTemplate({ ...base, russian: false }), "300px 6px minmax(380px, 1fr) 42px");
  assert.equal(gridTemplate({ ...base, english: false, russian: false }), "42px minmax(380px, 1fr) 42px");
  assert.equal(gridTemplate({ ...base, mode: "center" }), "minmax(0, 1fr)");
});

test("the central player column is present and flexible in every layout", () => {
  for (const mode of ["columns", "center"]) {
    for (const english of [false, true]) {
      for (const russian of [false, true]) {
        assert.match(gridTemplate({ ...base, mode, english, russian }), /minmax\((?:0|380px), 1fr\)/);
      }
    }
  }
});
