const test = require("node:test");
const assert = require("node:assert/strict");
const { downloadVideoArgs, transcriberArgs, captionsFromTranscript, hasVtt, chooseEnglishVtt } = require("./transcription-plan");

test("builds a lightweight single-video yt-dlp request", () => {
  const args = downloadVideoArgs("C:\\tmp\\source.%(ext)s", "https://youtu.be/example");
  assert.ok(args.includes("--no-playlist"));
  assert.ok(args.includes("worst[ext=mp4]/worst"));
  assert.equal(args.at(-1), "https://youtu.be/example");
});

test("uses the configured local transcriber with English language", () => {
  const config = { pythonPath: "C:\\Python314\\python.exe", scriptPath: "C:\\skill\\transcribe.py", modelRoot: "C:\\models", model: "large-v3-turbo" };
  const args = transcriberArgs(config, "C:\\tmp\\source.mp4", "C:\\tmp\\results");
  assert.deepEqual(args.slice(0, 4), ["run", "--python", config.pythonPath, config.scriptPath]);
  assert.deepEqual(args.slice(-2), ["--language", "en"]);
});

test("converts faster-whisper JSON segments into application captions", () => {
  assert.deepEqual(captionsFromTranscript({ segments: [
    { id: 7, start: 1.25, end: 3.5, text: " Hello " },
    { start: "bad", end: 4, text: "ignored" },
  ] }), [{ id: "en-1", start: 1.25, end: 3.5, text: "Hello" }]);
});

test("a successful yt-dlp exit without a VTT still requires automatic-caption fallback", () => {
  assert.equal(hasVtt([]), false);
  assert.equal(hasVtt(["caption.info.json"]), false);
  assert.equal(hasVtt(["caption.en-orig.vtt"]), true);
  assert.equal(chooseEnglishVtt(["caption.en.vtt", "caption.en-orig.vtt"]), "caption.en-orig.vtt");
});
