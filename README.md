# YT Lang Learning

Десктопное приложение для изучения языков по роликам YouTube. Оно позволяет вести библиотеку роликов, смотреть видео с английскими и русскими субтитрами, отмечать изученные фразы, сохранять позицию воспроизведения и получать или создавать субтитры.

## Требования

- Windows
- [Bun](https://bun.sh/)
- Node.js — используется для запуска тестов

Для функций транскрибации дополнительно настраиваются пути к `uv`, `yt-dlp`, Python и скрипту транскрибации в разделе «Настройки» приложения.

## Запуск

```powershell
bun install
bun run start
```

## Проверка

```powershell
bun run test
```

## Сборка Windows

```powershell
bun run package
bun run make
```

После упаковки исполняемый файл находится в `out\yt-lang-learning-win32-x64\yt-lang-learning.exe`. Установщик создаётся в `out\make\squirrel.windows\x64\yt-lang-learning-setup.exe`.

Подробности — в [BUILDING-WINDOWS.md](BUILDING-WINDOWS.md).

## Структура проекта

- `main.js` — главный процесс Electron, IPC и работа с библиотекой, настройками и субтитрами.
- `preload.js` — безопасный API, доступный интерфейсу.
- `index.html`, `app.js`, `app.css` — интерфейс приложения.
- `caption-*.js`, `player-*.js`, `playback-position.js`, `transcription-plan.js` — изолированная логика и её тесты.
- `library.json`, `settings.json`, `captions/` — начальные или переносимые данные приложения.
- `assets/` — иконки и другие ресурсы.

В режиме разработки данные читаются из папки проекта. В собранном приложении они размещаются рядом с исполняемым файлом.
