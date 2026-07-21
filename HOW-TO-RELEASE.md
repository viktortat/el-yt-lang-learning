# Как выпустить релиз

## 1. Подготовить токен

Создай файл `.env` в корне проекта, напиши туда:

```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

Токен взять [здесь](https://github.com/settings/tokens/new), нужна галочка `repo`.

## 2. Запустить скрипт

```powershell
bun run release          # следующая версия: 0.0.28 → 0.0.29
bun run release patch    # то же самое
bun run release minor    # 0.0.28 → 0.1.0
bun run release major    # 0.0.28 → 1.0.0
```

Скрипт сам сделает всё:

- увеличит версию в `package.json`
- запустит тесты
- соберёт `.exe` установщик
- создаст релиз на GitHub и прикрепит файл
- закоммитит и запушит изменения с тэгом `v0.0.29`

## 3. Написать описание релиза

После пуша скрипта зайди на [github.com/viktortat/el-yt-lang-learning/releases](https://github.com/viktortat/el-yt-lang-learning/releases), нажми ✏️ Edit у свежего релиза и напиши, что изменилось.
