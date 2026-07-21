// scripts/release.js
//
// Автоматический выпуск релиза:
//   1. читает GITHUB_TOKEN из .env
//   2. увеличивает версию в package.json (по умолчанию patch)
//   3. прогоняет тесты
//   4. собирает установщик
//   5. создаёт GitHub release и загружает .exe
//   6. коммитит, тегирует и пушит
//
// Запуск:
//   node scripts/release.js           # +0.0.1
//   node scripts/release.js patch     # +0.0.1
//   node scripts/release.js minor     # +0.1.0
//   node scripts/release.js major     # +1.0.0
//   node scripts/release.js patch --notes release-notes.md

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = "viktortat/el-yt-lang-learning";
const GITHUB_API = "https://api.github.com";
const EXE_NAME = "yt-lang-learning-setup.exe";
const EXE_PATH = "out/make/squirrel.windows/x64";
const ENV_FILE = ".env";

// ── helpers ──────────────────────────────────────────────────────────

function loadDotenv() {
  const p = path.join(__dirname, "..", ENV_FILE);
  if (!fs.existsSync(p)) {
    console.error("Файл " + ENV_FILE + " не найден. Создай его по образцу .env.example:");
    console.error('  GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx');
    process.exit(1);
  }
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.trim().match(/^GITHUB_TOKEN\s*=\s*(\S+)/);
    if (m) return m[1];
  }
  console.error("В " + ENV_FILE + " нет строки GITHUB_TOKEN=...");
  process.exit(1);
}

function run(cmd, opts = {}) {
  console.log("$ " + cmd);
  return execSync(cmd, { cwd: path.join(__dirname, ".."), stdio: "inherit", ...opts });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function parseArgs(argv) {
  let type = "patch";
  let notesFile = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--notes") {
      if (!argv[i + 1] || argv[i + 1].startsWith("-")) {
        console.error("  После --notes укажи путь к Markdown-файлу с описанием релиза.");
        process.exit(1);
      }
      notesFile = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith("--notes=")) {
      notesFile = arg.slice("--notes=".length);
      continue;
    }

    if (!arg.startsWith("-")) {
      type = arg.toLowerCase();
      continue;
    }

    console.error("  Неизвестный аргумент: " + arg);
    process.exit(1);
  }

  if (!["patch", "minor", "major"].includes(type)) {
    console.error("  Аргумент должен быть: patch | minor | major");
    process.exit(1);
  }

  if (notesFile === "") {
    console.error("  После --notes укажи путь к Markdown-файлу с описанием релиза.");
    process.exit(1);
  }

  return { type, notesFile };
}

function readReleaseBody(notesFile, tag) {
  if (!notesFile) {
    return "Обновление " + tag + "\n\n```powershell\nbun run make\n```";
  }

  const notesPath = path.resolve(path.join(__dirname, ".."), notesFile);
  if (!fs.existsSync(notesPath)) {
    console.error("  Файл с описанием релиза не найден: " + notesPath);
    process.exit(1);
  }

  const body = fs.readFileSync(notesPath, "utf8").trim();
  if (!body) {
    console.error("  Файл с описанием релиза пуст: " + notesPath);
    process.exit(1);
  }

  return body;
}

function bumpVersion(current, type) {
  const parts = current.split(".").map(Number);
  if (type === "major") { parts[0] += 1; parts[1] = 0; parts[2] = 0; }
  else if (type === "minor") { parts[1] += 1; parts[2] = 0; }
  else { parts[2] += 1; }
  return parts.join(".");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── main ─────────────────────────────────────────────────────────────

async function main() {
  const token = loadDotenv();
  const { type, notesFile } = parseArgs(process.argv.slice(2));

  // 1. Версия
  const pkgPath = path.join(__dirname, "..", "package.json");
  const pkg = readJson(pkgPath);
  const currentVersion = pkg.version;
  const newVersion = bumpVersion(currentVersion, type);
  const tag = "v" + newVersion;
  const releaseBody = readReleaseBody(notesFile, tag);

  console.log("\n  Текущая версия: " + currentVersion);
  console.log("  Новая версия:   " + newVersion);
  console.log("  Тэг:            " + tag + "\n");
  if (notesFile) {
    console.log("  Описание релиза: " + notesFile + "\n");
  }

  // 2. Обновить package.json
  pkg.version = newVersion;
  writeJson(pkgPath, pkg);
  console.log("  package.json -> " + newVersion + "\n");

  // 3. Тесты
  console.log("  Запуск тестов...");
  run("bun run test");

  // 4. Сборка
  console.log("\n  Сборка установщика...");
  run("bun run make");

  // 5. Проверить, что .exe существует
  const exeFull = path.join(__dirname, "..", EXE_PATH, EXE_NAME);
  if (!fs.existsSync(exeFull)) {
    console.error("\n  Файл " + exeFull + " не найден. Сборка могла не создать установщик.");
    process.exit(1);
  }
  const exeStats = fs.statSync(exeFull);
  console.log("  Найден: " + EXE_NAME + " (" + (exeStats.size / 1024 / 1024).toFixed(1) + " MB)\n");

  // 6. Коммит + тэг + пуш
  console.log("  Коммит изменений...");
  run("git add package.json");
  run("git commit -m \"v" + newVersion + "\"");
  run("git tag " + tag);
  run("git push");
  run("git push origin " + tag);

  // 7. Создать GitHub release
  console.log("  Создание релиза на GitHub...");
  const createRes = await fetch(GITHUB_API + "/repos/" + REPO + "/releases", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tag_name: tag,
      name: tag,
      body: releaseBody,
      draft: false,
      prerelease: false,
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    console.error("  Ошибка при создании релиза: " + createRes.status + " " + err);
    process.exit(1);
  }
  const release = await createRes.json();
  const releaseId = release.id;
  console.log("  Релиз создан: " + release.html_url + "\n");

  // 8. Загрузить .exe как asset
  console.log("  Загрузка установщика...");
  const fileBuf = fs.readFileSync(exeFull);
  const uploadUrl = "https://uploads.github.com/repos/" + REPO + "/releases/" + releaseId + "/assets?name=" + encodeURIComponent(EXE_NAME);
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/x-msdownload",
      "Content-Length": fileBuf.length,
    },
    body: fileBuf,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error("  Ошибка загрузки asset: " + uploadRes.status + " " + err);
    process.exit(1);
  }
  console.log("  Установщик загружен.\n");

  console.log("\n  Готово! Релиз: " + release.html_url);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
