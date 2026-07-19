(function exposeTranscriptionPlan(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TranscriptionPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function downloadVideoArgs(outputTemplate, url) {
    return [
      "--no-playlist",
      "-f", "worst[ext=mp4]/worst",
      "--merge-output-format", "mp4",
      "-o", outputTemplate,
      url,
    ];
  }

  function transcriberArgs(config, inputPath, outputDirectory) {
    return [
      "run", "--python", config.pythonPath,
      config.scriptPath,
      inputPath,
      "--output-dir", outputDirectory,
      "--model-root", config.modelRoot,
      "--model", config.model,
      "--language", "en",
    ];
  }

  function captionsFromTranscript(payload) {
    return (payload?.segments || []).map((segment, index) => ({
      id: `en-${index + 1}`,
      start: Number(segment.start),
      end: Number(segment.end),
      text: String(segment.text || "").trim(),
    })).filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.text);
  }

  function hasVtt(files) {
    return files.some(file => file.endsWith(".vtt"));
  }

  function chooseEnglishVtt(files) {
    return files.find(file => file.endsWith(".en-orig.vtt"))
      || files.find(file => file.endsWith(".en.vtt"))
      || files.find(file => file.endsWith(".vtt"));
  }

  return { downloadVideoArgs, transcriberArgs, captionsFromTranscript, hasVtt, chooseEnglishVtt };
});
