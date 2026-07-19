# YT Lang Learning

English | [Русский](README.ru.md)

Turn YouTube videos into focused language lessons. YT Lang Learning keeps the video, English captions, and Russian translation in one window, so you can follow real speech without jumping between a player and a translator.

![YT Lang Learning study player with English and Russian captions](Docs/screens/study-player.png)

## What you can do

- Organise YouTube lessons into folders and move them as your study plan changes.
- Click any caption to seek to that line, repeat the current phrase, skip five seconds, or change playback speed.
- Load available English captions, create a Russian translation through OpenRouter, or use local faster-whisper transcription when YouTube has no English track.

The app remembers the playback position for each YouTube video. Caption files, settings, and the library stay on the local machine.

## Install and run

Release builds created by this repository use the installer name `yt-lang-learning-setup.exe` and also provide a ZIP package.

### Installer

1. Run `yt-lang-learning-setup.exe`.
2. Complete the installer and open YT Lang Learning.

### ZIP package

1. Extract the whole archive into its own folder.
2. Run `yt-lang-learning.exe` from that folder.

Do not copy the executable away from the rest of the package. See the [technical documentation](Docs/README.md) if you need to run or build the app from source.

## Start your first lesson

1. Open **БИБЛИОТЕКА**.
2. Select **＋ РОЛИК**, paste a full YouTube URL, and give the lesson a clear name.
3. Double-click the saved video to open it in the player.
4. Select **ЗАГРУЗИТЬ EN** and confirm the request to YouTube.
5. Add an OpenRouter API key in settings if you want a Russian translation, then select **ПЕРЕВЕСТИ RU**.

You can also paste a URL directly into **ПЛЕЕР** and watch it before adding it to the library.

![YT Lang Learning library](Docs/screens/library.png)

## Study modes

**КОЛОНКИ** places English captions on the left and Russian captions on the right. The active line is highlighted in both panels.

**ЦЕНТР** puts the current English line and translation near the video. The EN and RU controls can hide either side panel when you want more space for playback.

## Translation and transcription

Russian translation requires an OpenRouter API key. The app sends the English caption text to the selected OpenRouter model; it does not send the video for translation. Windows stores the key only when system encryption is available.

If YouTube does not provide an English caption track, the app can offer local speech recognition. This requires an existing faster-whisper model, `uv`, and `yt-dlp`. The temporary video download starts only after confirmation and is removed after processing.

![YT Lang Learning settings](Docs/screens/settings.png)

## Limits

- YouTube playback and caption downloads require an internet connection.
- Videos may fail to play when their owner blocks embedding.
- English captions depend on the tracks YouTube makes available. Local transcription needs separate tools and a downloaded model.
- Russian translation needs an OpenRouter account, API key, and access to the selected model.

## Documentation and licence

- [User guide in Russian](Docs/guide-users.md)
- [Technical documentation](Docs/README.md)
- Licence: MIT
