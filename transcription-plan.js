(function exposeTranscriptionPlan(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TranscriptionPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function downloadVideoArgs(outputTemplate, url) {
    return [
      "--no-playlist",
      "--newline",
      "-f", "worst[ext=mp4]/worst",
      "--merge-output-format", "mp4",
      "-o", outputTemplate,
      url,
    ];
  }

  function transcriberArgs(config, inputPath, outputDirectory, language = "") {
    const args = [
      "run", "--python", config.pythonPath,
      config.scriptPath,
      inputPath,
      "--output-dir", outputDirectory,
      "--model-root", config.modelRoot,
      "--model", config.model,
    ];
    if (language) args.push("--language", language);
    return args;
  }

  function captionsFromTranscript(payload, language = "") {
    const prefix = String(language || payload?.language || payload?.info?.language || payload?.metadata?.language || "seg").toLowerCase();
    return (payload?.segments || []).map((segment, index) => ({
      id: `${prefix}-${index + 1}`,
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

  function createProgressParser(kind) {
    const pattern = kind === "download"
      ? /\[download\]\s+([\d.]+)%/g
      // Процент остаётся ASCII даже при несовпадении кодировок Python и Node.js.
      : /([\d.]+)%/g;
    let buffer = "";
    let lastPercent = -1;
    return output => {
      buffer = `${buffer}${output}`;
      const percentages = [];
      for (const match of buffer.matchAll(pattern)) {
        const percent = Math.min(100, Math.round(Number(match[1])));
        if (Number.isFinite(percent) && percent !== lastPercent) percentages.push(percent);
        lastPercent = percent;
      }
      // Сохраняем хвост на случай, если метка и число разделены между chunks stdout.
      buffer = buffer.slice(-64);
      return percentages;
    };
  }

  return { downloadVideoArgs, transcriberArgs, captionsFromTranscript, hasVtt, chooseEnglishVtt, createProgressParser };
});
