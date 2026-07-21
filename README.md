# YT Lang Learning

[Українська](README.uk.md) | English

Study foreign languages with YouTube: captions in your target language and translation side by side, in one window.

![YT Lang Learning study player with side-by-side captions](Docs/screens/study-player.png)

## Screenshots

<table>
  <tr>
    <td><img src="Docs/screens/library.png" alt="YT Lang Learning library with folders and videos"></td>
    <td><img src="Docs/screens/settings.png" alt="Translation and transcription settings"></td>
  </tr>
  <tr>
    <td colspan="2"><img src="Docs/screens/library-overview.png" alt="Library management with multiple libraries and language pairs"></td>
  </tr>
</table>

## What you can do

- **Organise lessons** into folders and drag them around as your study plan changes.
- **Pick your own language pair** for each library. The study language and translation language are separate settings. Whisper supports 99 languages.
- **Multiple libraries** keep separate video sets, progress, and captions. Each library has its own language pair. Switch between them from the library overview screen.
- **Click any caption** to jump to that moment. Repeat the current phrase, skip five seconds, or change playback speed from 0.5x to 2x.
- **Load captions** from YouTube when a track is available. If YouTube returns none, the app offers OpenRouter translation or local faster-whisper transcription.
- **Quick select** with "My Languages" in settings. Pick your usual set and keep the full catalog one click away through "Another language...".
- **Import from a YouTube playlist** – the app finds every video, skips duplicates, and asks before adding new ones.
- **Export your library** as JSON, import another one, or restore the latest automatic backup.
- **Transcribe local media** – audio or video files on your machine, not just YouTube videos.
- **Switch between dark and light themes** and choose your OpenRouter translation model.

The app remembers the playback position for each video. Caption files, settings, and the library stay on your machine.

## Install and run

Release builds from this repository produce `yt-lang-learning-setup.exe` and a ZIP package.

### Installer

1. Run `yt-lang-learning-setup.exe`.
2. Complete the installer and open YT Lang Learning.

### ZIP package

1. Extract the whole archive into its own folder.
2. Run `yt-lang-learning.exe` from that folder.

Do not copy the executable away from the rest of the package. See the [technical documentation](Docs/README.md) if you need to run or build from source.

## Start your first lesson

1. Open the library.
2. Click **＋ РОЛИК**, paste a full YouTube URL, and give it a name.
3. Double-click the saved video to open it in the player.
4. Select a study language in the left caption header and click the download button.
5. Pick a translation language on the right. The app checks YouTube first, then offers OpenRouter or Whisper when no track is available.

You can also paste a URL directly into the player and watch before saving to the library.

## Study modes

**КОЛОНКИ** places the study caption on the left and translation on the right. The active line is highlighted in both panels. A swap button exchanges their positions without swapping the study and translation roles.

**ЦЕНТР** puts the current caption line and translation near the video. The EN and RU buttons collapse either side panel when you need more room.

## Keyboard shortcuts

With the player focused:

- **Space** plays or pauses the video.
- **Left/Right arrow** skips five seconds back or forward.
- **[ / ]** sets playback speed to 0.75 or 1.25.
- **R** repeats the current caption line.

## Translation and transcription

Translation requires an OpenRouter API key. The app sends the caption text to the selected model, not the video. Windows encrypts the key when system encryption is available. Old translations are marked stale when you redownload the source track.

If the caption track is not available on YouTube, the app can use local speech recognition. It needs a faster-whisper model, `uv`, and `yt-dlp`. The video downloads only after confirmation and is cleaned up after processing. Local media files need `ffmpeg` as well.

## Limits

- YouTube playback and caption downloads need an internet connection.
- Some videos may not play when the owner blocks embedding.
- Caption availability depends on what YouTube provides for each video.
- Translation needs an OpenRouter account, API key, and access to the selected model.
- Local transcription requires separate tools and a downloaded model.

## Documentation and licence

- [User guide in Ukrainian](Docs/guide-users.md)
- [Technical documentation](Docs/README.md)
- Licence: MIT
