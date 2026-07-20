const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { SUPPORTED_COMMANDS, execute } = require("./player-controls");

function fakePlayer({ time = 20, state = 2 } = {}) {
  const calls = [];
  return {
    calls,
    getCurrentTime: () => time,
    getPlayerState: () => state,
    playVideo: () => calls.push(["play"]),
    pauseVideo: () => calls.push(["pause"]),
    seekTo: (next, allowSeekAhead) => calls.push(["seek", next, allowSeekAhead]),
    setPlaybackRate: rate => calls.push(["rate", rate]),
  };
}

test("every rendered player command is implemented and no repeat placeholder remains", () => {
  const source = readFileSync(require.resolve("./app.js"), "utf8");
  const rendered = [...source.matchAll(/data-player="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...new Set(rendered)].sort(), ["back", "forward", "play", "previous", "repeat"]);
  assert.ok(rendered.every(command => SUPPORTED_COMMANDS.includes(command)));
  assert.doesNotMatch(source, /Повтор.+станет доступен/);
});

test("play button toggles play and pause", () => {
  const paused = fakePlayer({ state: 2 });
  const playing = fakePlayer({ state: 1 });
  assert.equal(execute({ player: paused, command: "play" }).ok, true);
  assert.deepEqual(paused.calls, [["play"]]);
  assert.equal(execute({ player: playing, command: "play" }).ok, true);
  assert.deepEqual(playing.calls, [["pause"]]);
});

test("back and forward seek five seconds and back clamps at zero", () => {
  const middle = fakePlayer({ time: 20 });
  execute({ player: middle, command: "back" });
  execute({ player: middle, command: "forward" });
  assert.deepEqual(middle.calls, [["seek", 15, true], ["seek", 25, true]]);

  const beginning = fakePlayer({ time: 2 });
  execute({ player: beginning, command: "back" });
  assert.deepEqual(beginning.calls, [["seek", 0, true]]);
});

test("caption click seeks and starts playback", () => {
  const player = fakePlayer();
  assert.equal(execute({ player, command: "seek", value: 31.5 }).ok, true);
  assert.deepEqual(player.calls, [["seek", 31.5, true], ["play"]]);
});

test("repeat seeks to the start of the current caption and starts playback", () => {
  const player = fakePlayer({ time: 188 });
  const captions = [{ id: "a", start: 181 }, { id: "b", start: 186 }, { id: "c", start: 191 }];
  const result = execute({ player, command: "repeat", captions });
  assert.equal(result.ok, true);
  assert.equal(result.caption.id, "b");
  assert.deepEqual(player.calls, [["seek", 186, true], ["play"]]);
});

test("repeat reports missing subtitles without moving playback", () => {
  const player = fakePlayer({ time: 10 });
  const result = execute({ player, command: "repeat", captions: [] });
  assert.equal(result.ok, false);
  assert.match(result.message, /субтитр/i);
  assert.deepEqual(player.calls, []);
});

test("previous moves to the preceding caption and starts playback", () => {
  const player = fakePlayer({ time: 188 });
  const captions = [{ id: "a", start: 181 }, { id: "b", start: 186 }, { id: "c", start: 191 }];
  const result = execute({ player, command: "previous", captions });
  assert.equal(result.ok, true);
  assert.equal(result.caption.id, "a");
  assert.deepEqual(player.calls, [["seek", 181, true], ["play"]]);
});

test("all displayed playback rates are passed to YouTube", () => {
  for (const rate of [0.5, 0.75, 1, 1.5, 2]) {
    const player = fakePlayer();
    assert.equal(execute({ player, command: "rate", value: rate }).ok, true);
    assert.deepEqual(player.calls, [["rate", rate]]);
  }
});
