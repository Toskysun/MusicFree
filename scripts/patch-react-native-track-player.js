const fs = require("fs");
const path = require("path");

const servicePath = path.join(
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

const modulePath = path.join(
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
    "module",
    "MusicModule.kt",
);

function patchOnBind() {
    const candidates = [
        {
            oldSnippet: "override fun onBind(intent: Intent?): IBinder {",
            newSnippet: "override fun onBind(intent: Intent): IBinder? {",
        },
        {
            // RNTP 4.1.2+
            oldSnippet: "override fun onBind(intent: Intent): IBinder {",
            newSnippet: "override fun onBind(intent: Intent): IBinder? {",
        },
    ];

    if (!fs.existsSync(servicePath)) {
        console.log("[patch-track-player] MusicService.kt not found, skipping onBind");
        return;
    }

    const source = fs.readFileSync(servicePath, "utf8");
    if (source.includes("override fun onBind(intent: Intent): IBinder? {")) {
        console.log("[patch-track-player] onBind already patched");
        return;
    }

    const matched = candidates.find(item => source.includes(item.oldSnippet));
    if (!matched) {
        console.warn("[patch-track-player] expected onBind signature not found");
        return;
    }

    fs.writeFileSync(servicePath, source.replace(matched.oldSnippet, matched.newSnippet));
    console.log("[patch-track-player] patched MusicService.onBind signature");
}

function patchBundleNullability() {
    if (!fs.existsSync(modulePath)) {
        console.log("[patch-track-player] MusicModule.kt not found, skipping Bundle patch");
        return;
    }

    let source = fs.readFileSync(modulePath, "utf8");
    const marker = "/* musicfree-bundle-null-safe */";
    if (source.includes(marker)) {
        console.log("[patch-track-player] Bundle nullability already patched");
        return;
    }

    const replacements = [
        [
            "callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem))",
            `${marker}\n            callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem!!))`,
        ],
        [
            "else Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n            )",
            `else Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem!!\n            )`,
        ],
    ];

    let changed = false;
    for (const [from, to] of replacements) {
        if (source.includes(from)) {
            source = source.replace(from, to);
            changed = true;
        }
    }

    if (!changed) {
        console.warn("[patch-track-player] expected Bundle fromBundle call sites not found");
        return;
    }

    fs.writeFileSync(modulePath, source);
    console.log("[patch-track-player] patched MusicModule Bundle nullability for RN 0.86");
}

patchOnBind();
patchBundleNullability();
