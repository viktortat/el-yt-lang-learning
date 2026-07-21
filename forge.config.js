module.exports = {
  packagerConfig: {
    asar: { unpack: "**/assets/bin/yt-dlp.exe" },
    executableName: "yt-lang-learning",
    icon: "./assets/yt-lang-learning.ico",
    ignore: [
      /node_modules\/electron\/dist/,
      /\.git/,
      /(^|[\\/])out([\\/]|$)/,
      /(^|[\\/])\.electron-user-data([\\/]|$)/,
      /(^|[\\/])\.bun-tmp([\\/]|$)/,
      /(^|[\\/])\.env$/,
      /bun\.lock/,
      /\.gitignore/
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "yt_lang_learning",
        setupExe: "yt-lang-learning-setup.exe",
        setupIcon: "./assets/yt-lang-learning.ico",
        loadingGif: "./assets/installer/installer-loading.gif"
      }
    },
    { name: "@electron-forge/maker-zip", platforms: ["win32", "darwin"] }
  ]
};
