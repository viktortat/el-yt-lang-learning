# Релизы и обновления

Приложение само проверяет новые версии на GitHub. Если релиз новее текущей — в статус-баре появляется бейдж !, по клику открывается окно с описанием и кнопкой скачивания.

## Как выпустить релиз

1. Обновите версию в `package.json`:

```json
"version": "0.0.28"
```

2. Соберите установщик:

```powershell
bun run make
```

В папке `out/make/squirrel.windows/x64/` появится `yt-lang-learning-setup.exe`.

3. Создайте релиз на GitHub:

- Перейдите на https://github.com/viktortat/el-yt-lang-learning/releases/new
- В Tag version укажите `v`, затем номер версии — например `v0.0.28`
- Название релиза — версия (например `v0.0.28`)
- В поле описания напишите, что изменилось
- Прикрепите `yt-lang-learning-setup.exe` из `out/make/squirrel.windows/x64/`
- Нажмите Publish release

## Как работает обновление

После публикации релиза при проверке GitHub API возвращает новый тег. Если он новее текущей версии — пользователю приходит уведомление.

Последовательность:

1. При запуске main.js отправляет GET на `https://api.github.com/repos/viktortat/el-yt-lang-learning/releases/latest`
2. Сравнивает tag_name (например v0.0.28) с app.getVersion() (например 0.0.27)
3. Если новая — ищет среди assets файл, имя которого заканчивается на -setup.exe
4. Показывает бейдж в статус-баре
5. По клику — диалог с описанием релиза
6. После нажатия «Скачать» — скачивает установщик с отображением прогресса
7. После загрузки — кнопка «Установить и перезапустить»
8. Нажатие запускает setup.exe и закрывает приложение
9. Squirrel.Windows сам подменяет файлы и запускает новую версию

## Проверка перед релизом

```powershell
bun run test
bun run package
```

Убедитесь, что `out/yt-lang-learning-win32-x64/resources/app.asar` содержит все нужные файлы.

## Автоматический релиз (скрипт)

```powershell
bun run release          # +0.0.1 (patch)
bun run release patch    # +0.0.1
bun run release minor    # +0.1.0
bun run release major    # +1.0.0
```

Скрипт:
1. читает `GITHUB_TOKEN` из файла `.env` (создай по образцу `.env.example`)
2. увеличивает версию в `package.json`
3. прогоняет тесты (`bun run test`)
4. собирает установщик (`bun run make`)
5. создаёт релиз на GitHub с тэгом `v{новая_версия}`
6. загружает `yt-lang-learning-setup.exe` в ассеты
7. коммитит `package.json`, создаёт тэг и пушит в `origin`

Перед запуском создай `.env` в корне проекта:

```ini
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

Токен создать [здесь](https://github.com/settings/tokens/new) с правами `repo`.

