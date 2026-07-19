# Сборка YT Lang Learning в Windows

Выполнить из папки `el-yt-lang-learning`:

```powershell
bun install
bun run package
bun run make
```

| Команда | Результат |
| --- | --- |
| `bun run package` | `out\yt-lang-learning-win32-x64\yt-lang-learning.exe` |
| `bun run make` | `out\make\squirrel.windows\x64\yt-lang-learning-setup.exe` и ZIP-архив |

Проверка установщика:

```powershell
Test-Path '.\out\make\squirrel.windows\x64\yt-lang-learning-setup.exe'
```

Приложение содержит исправления, проверенные в шаблоне:

- `@electron/packager 18.4.4` и override `yauzl 3.4.0` для корректной распаковки Electron при `bun run package`;
- зарегистрированный `@electron-forge/maker-squirrel`, поэтому `bun run make` создаёт установщик, а не только ZIP;
- пользовательские данные хранятся в `%LOCALAPPDATA%\YT Lang Learning`, а не в папке проекта;
- служебные каталоги и результаты сборки исключены из пакета.

Главная страница пока пуста. Разработку интерфейса ведите с `index.html`, добавляя необходимые приложению файлы и API в `preload.js`.
