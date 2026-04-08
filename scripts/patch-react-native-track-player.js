const fs = require("fs");
const path = require("path");

const targetPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "react-native-track-player",
    "android",
    "src",
    "main",
    "java",
    "com",
    "doublesymmetry",
    "trackplayer",
    "service",
    "MusicService.kt",
);

const oldSnippet = "override fun onBind(intent: Intent?): IBinder {";
const newSnippet = "override fun onBind(intent: Intent): IBinder? {";

if (!fs.existsSync(targetPath)) {
    console.log("[patch-track-player] MusicService.kt not found, skipping");
    process.exit(0);
}

const source = fs.readFileSync(targetPath, "utf8");

if (source.includes(newSnippet)) {
    console.log("[patch-track-player] already patched");
    process.exit(0);
}

if (!source.includes(oldSnippet)) {
    console.warn("[patch-track-player] expected onBind signature not found");
    process.exit(0);
}

fs.writeFileSync(targetPath, source.replace(oldSnippet, newSnippet));
console.log("[patch-track-player] patched MusicService.onBind signature");
