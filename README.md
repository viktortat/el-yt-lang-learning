# YT Lang Learning

English | [Русский](README.ru.md)

Watch YouTube videos with English captions and Russian translation side by side, in one window. No more switching between a player and a translator.

![YT Lang Learning study player with English and Russian captions](Docs/screens/study-player.png)

## Screenshots

<table>
  <tr>
    <td><img src="Docs/screens/library.png" alt="YT Lang Learning library with a saved lesson"></td>
    <td><img src="Docs/screens/settings.png" alt="YT Lang Learning translation and transcription settings"></td>
  </tr>
</table>

## What you can do

- Organise YouTube lessons into folders and move them as your study plan changes.
- Click any caption to jump to that line. Repeat the current phrase, skip five seconds, or change playback speed.
- Load English captions if YouTube has them. Create a Russian translation through OpenRouter, or use local faster-whisper transcription when no English track is available.
- Import videos from a YouTube playlist. Duplicates are skipped, and the app asks before adding anything new.
- Export your library, import an existing one, or restore the latest backup.
- Switch between dark and light themes and choose your OpenRouter translation model.

The app remembers the playback position for each YouTube video. Caption files, settings, and the library stay on your machine.

## Install and run

Release builds from this repository use the installer name `yt-lang-learning-setup.exe` and also provide a ZIP package.

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
4. Select **ЗАГРУЗИТЬ EN** and confirm with YouTube.
5. Add an OpenRouter API key in settings if you want a Russian translation, then select **ПЕРЕВЕСТИ RU**.

You can also paste a URL directly into **ПЛЕЕР** and watch it before adding it to the library.

## Study modes

**КОЛОНКИ** places English captions on the left and Russian captions on the right. The active line is highlighted in both panels.

**ЦЕНТР** puts the current English line and translation near the video. The EN and RU controls let you hide either side panel when you need more room for the video.

## Keyboard shortcuts

In the player, use the keyboard to control playback:

- **Space** plays or pauses the video.
- **Left/Right arrow** skips five seconds back or forward.
- **[ / ]** sets playback speed to 0.75 or 1.25.
- **R** repeats the current caption line.

## Translation and transcription

Russian translation requires an OpenRouter API key. The app sends the English caption text to the selected OpenRouter model; it does not send the video for translation. Windows encrypts and stores the key when system encryption is available.

If YouTube has no English captions, the app can use local speech recognition. You need a faster-whisper model, `uv`, and `yt-dlp`. The video downloads only after confirmation and gets cleaned up after processing.

## Limits

- YouTube playback and caption downloads require an internet connection.
- Videos may fail to play when their owner blocks embedding.
- English captions depend on the tracks YouTube makes available. Local transcription needs separate tools and a downloaded model.
- Russian translation needs an OpenRouter account, API key, and access to the selected model.

## Documentation and licence

- [User guide in Russian](Docs/guide-users.md)
- [Technical documentation](Docs/README.md)
- Licence: MIT
