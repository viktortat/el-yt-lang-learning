const test = require("node:test");
const assert = require("node:assert/strict");
const { STORAGE_KEY, createStore } = require("./playback-position");

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: key => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
    data,
  };
}

test("stores an independent playback position for every YouTube video", () => {
  const storage = memoryStorage();
  const store = createStore(storage, 0);
  assert.equal(store.save("first", 12.3456, { now: 1 }), true);
  assert.equal(store.save("second", 78.9, { now: 2 }), true);
  assert.equal(store.get("first"), 12.346);
  assert.equal(store.get("second"), 78.9);
  assert.deepEqual(JSON.parse(storage.data[STORAGE_KEY]), { first: 12.346, second: 78.9 });
});

test("throttles periodic writes but allows a forced final write", () => {
  const storage = memoryStorage();
  const store = createStore(storage, 1000);
  assert.equal(store.save("video", 10, { now: 1000 }), true);
  assert.equal(store.save("video", 11, { now: 1500 }), false);
  assert.equal(store.save("video", 11, { force: true, now: 1500 }), true);
  assert.equal(store.get("video"), 11);
});

test("ignores corrupted storage and invalid positions", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "not-json" });
  const store = createStore(storage, 0);
  assert.equal(store.get("video"), 0);
  assert.equal(store.save("video", Number.NaN), false);
  assert.equal(store.save("", 10), false);
});
