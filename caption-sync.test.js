const test = require("node:test");
const assert = require("node:assert/strict");
const { centeredScrollTop, createTimeTracker, findCurrentCaption } = require("./caption-sync");

test("findCurrentCaption follows normal playback and manual seeking", () => {
  const captions = [
    { id: "a", start: 0 },
    { id: "b", start: 20 },
    { id: "c", start: 67 },
  ];

  assert.equal(findCurrentCaption(captions, 19.99).id, "a");
  assert.equal(findCurrentCaption(captions, 20).id, "b");
  assert.equal(findCurrentCaption(captions, 67.4).id, "c");
  assert.equal(findCurrentCaption(captions, -1), null);
});

test("centeredScrollTop keeps the active caption in the middle of its own list", () => {
  assert.equal(centeredScrollTop({
    scrollTop: 900,
    viewportTop: 200,
    viewportHeight: 600,
    rowTop: 610,
    rowHeight: 60,
    scrollHeight: 3000,
  }), 1040);

  assert.equal(centeredScrollTop({
    scrollTop: 0,
    viewportTop: 200,
    viewportHeight: 600,
    rowTop: 220,
    rowHeight: 40,
    scrollHeight: 3000,
  }), 0);
});

test("time tracker starts before YouTube onReady and retries when the player becomes ready", () => {
  let ready = false;
  let scheduledTick;
  const observed = [];
  const player = {
    getCurrentTime() {
      if (!ready) throw new Error("iframe API is not ready");
      return 67;
    },
  };
  const tracker = createTimeTracker({
    getPlayer: () => player,
    onTime: time => observed.push(time),
    setIntervalFn: callback => { scheduledTick = callback; return 1; },
    clearIntervalFn: () => {},
  });

  tracker.start();
  assert.deepEqual(observed, []);
  ready = true;
  scheduledTick();
  assert.deepEqual(observed, [67]);
});

test("time tracker reads the latest player after a renderer remount", () => {
  let scheduledTick;
  let player = { getCurrentTime: () => 5 };
  const observed = [];
  const tracker = createTimeTracker({
    getPlayer: () => player,
    onTime: time => observed.push(time),
    setIntervalFn: callback => { scheduledTick = callback; return 1; },
    clearIntervalFn: () => {},
  });

  tracker.start();
  player = { getCurrentTime: () => 42 };
  scheduledTick();
  assert.deepEqual(observed, [5, 42]);
});
