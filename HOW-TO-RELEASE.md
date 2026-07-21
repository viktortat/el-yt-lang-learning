# Как выпустить релиз

## 1. Подготовить токен GitHub

Создай в корне проекта файл `.env` по образцу `.env.example`:

```dotenv
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

Для classic personal access token нужна область доступа `repo`. Создать токен можно на странице [GitHub Personal Access Tokens](https://github.com/settings/tokens/new).

Не добавляй `.env` в Git. Файл исключён и из репозитория, и из упакованного приложения. Если токен попал в лог, коммит или опубликованный установщик, отзови его и создай новый.

## 2. Проверить состояние проекта

Релиз нужно запускать из чистой, синхронизированной ветки `main`:

```powershell
git status --short --branch
git pull --ff-only
```

Перед продолжением `git status --short --branch` должен показывать только:

```text
## main...origin/main
```

Это важно: установщик собирается из текущих файлов, а release-скрипт добавляет в релизный коммит только `package.json`. Незакоммиченные изменения могут попасть в `.exe`, но не попасть в Git.

## 3. Проверить сборку и содержимое пакета

```powershell
bun run test
bun run package

$asar = & .\node_modules\.bin\asar.exe list .\out\yt-lang-learning-win32-x64\resources\app.asar
$asar | Select-String '\\(app|main|preload|player-controls|player-layout)\.js$|\\index\.html$'
$asar | Select-String '(^|\\)\.env$'
```

Первая проверка должна вывести `app.js`, `index.html`, `main.js`, `player-controls.js`, `player-layout.js` и `preload.js`. Вторая не должна вывести ничего: `.env` не должен находиться внутри `app.asar`.

## 4. Запустить релиз

Перед публикацией подготовь украинское описание релиза по изменениям от более старой из двух предыдущих версий до текущего `HEAD`. Пиши кратко и понятно для обычного пользователя: обычно достаточно 3-6 пунктов без имён внутренних файлов и функций. Сохрани итоговый Markdown вне репозитория, например в `$env:TEMP`, чтобы рабочее дерево осталось чистым.

```powershell
bun run release --notes $env:TEMP\yt-lang-learning-release-notes-v0.0.32.md          # patch: 0.0.31 -> 0.0.32
bun run release patch --notes $env:TEMP\yt-lang-learning-release-notes-v0.0.32.md    # то же самое
bun run release minor --notes $env:TEMP\yt-lang-learning-release-notes-v0.1.0.md     # 0.0.31 -> 0.1.0
bun run release major --notes $env:TEMP\yt-lang-learning-release-notes-v1.0.0.md     # 0.0.31 -> 1.0.0
```

Скрипт последовательно:

1. увеличит версию в `package.json`;
2. запустит тесты;
3. соберёт Windows-установщик;
4. создаст релизный коммит и тег;
5. отправит ветку и тег в GitHub;
6. создаст GitHub Release с описанием из `--notes` и загрузит `yt-lang-learning-setup.exe`.

После завершения проверь ссылку, которую напечатает скрипт, и наличие установщика в Assets.

## Если релиз завершился с ошибкой

Не запускай `bun run release` повторно вслепую: каждый запуск снова увеличивает версию.

- Если ошибка произошла до релизного коммита и тега, верни изменение версии командой `git restore package.json`, устрани причину и запусти релиз заново.
- Если уже появились коммит, тег или GitHub Release, сначала проверь `git status`, `git log -1`, `git tag --points-at HEAD` и страницу релизов. Затем либо заверши публикацию этой же версии вручную, либо удали неполный релиз и тег перед повторной попыткой.
- Если Squirrel сообщает `Can not access a closed Stream`, удали только сгенерированный каталог `out/make/squirrel.windows/x64`, затем повтори сборку. Каталоги `out/` и `node_modules/` вручную не редактируй.

После релиза итоговая проверка должна подтвердить чистый репозиторий и тег на текущем коммите:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse vX.Y.Z
```

Последние две команды должны вывести один и тот же хеш.
