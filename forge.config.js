module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "yt-lang-learning",
    icon: "./assets/yt-lang-learning.ico",
    ignore: [
      /node_modules\/electron\/dist/,
      /\.git/,
      /(^|[\\/])out([\\/]|$)/,
      /(^|[\\/])\.electron-user-data([\\/]|$)/,
      /(^|[\\/])\.bun-tmp([\\/]|$)/,
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
        setupIcon: "./assets/yt-lang-learning.ico"
      }
    },
    { name: "@electron-forge/maker-zip", platforms: ["win32", "darwin"] }
  ]
};
