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

/**
 * New Architecture / bridgeless: ReactApplication.reactNativeHost throws.
 * MusicService.emit() used reactNativeHost.reactInstanceManager.currentReactContext,
 * which crashes (or silently drops events). HeadlessJsTaskService already exposes
 * reactContext that branches correctly for bridgeless vs bridge.
 *
 * See: doublesymmetry/react-native-track-player#2593
 */
function patchReactContextEmit() {
    if (!fs.existsSync(servicePath)) {
        console.log("[patch-track-player] MusicService.kt not found, skipping emit patch");
        return;
    }

    let source = fs.readFileSync(servicePath, "utf8");
    const marker = "musicfree-react-context-emit";
    if (source.includes(marker)) {
        console.log("[patch-track-player] MusicService emit already uses reactContext");
        return;
    }

    if (!source.includes("reactNativeHost.reactInstanceManager.currentReactContext")) {
        console.log(
            "[patch-track-player] MusicService emit does not use reactNativeHost (already fixed upstream?)",
        );
        return;
    }

    const countBefore = (
        source.match(/reactNativeHost\.reactInstanceManager\.currentReactContext/g) || []
    ).length;
    source = source.replace(
        /reactNativeHost\.reactInstanceManager\.currentReactContext/g,
        "reactContext",
    );
    // Stamp marker above first emit method
    source = source.replace(
        /(@MainThread\r?\n\s*private fun emit\(event: String, data: Bundle\? = null\))/,
        `// ${marker}: New Arch / bridgeless-safe event emit\n    $1`,
    );

    fs.writeFileSync(servicePath, source);
    console.log(
        `[patch-track-player] patched MusicService emit/emitList to use reactContext (${countBefore} sites)`,
    );
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

/**
 * RN New Arch / TurboModule interop requires async @ReactMethod methods to return void.
 * Kotlin expression-body `fun foo() = scope.launch { ... }` infers return type Job (non-void),
 * which crashes at runtime with:
 *   TurboModule system assumes returnType == void iff the method is synchronous
 *
 * Rewrite to block body with explicit Unit so the method returns void in bytecode:
 *   fun foo(...): Unit { scope.launch { ... } }
 *
 * See: doublesymmetry/react-native-track-player#2489, #2603
 */
function patchTurboModuleVoidReturn() {
    if (!fs.existsSync(modulePath)) {
        console.log("[patch-track-player] MusicModule.kt not found, skipping TurboModule void patch");
        return;
    }

    let source = fs.readFileSync(modulePath, "utf8");
    const marker = "/* musicfree-turbomodule-void-return */";
    const unitMarker = "/* musicfree-turbomodule-unit */";
    let changed = false;

    // Phase 1: convert expression-body `= scope.launch` to block body (idempotent via marker)
    if (!source.includes(marker)) {
        // Match: fun name(...) = scope.launch {
        //    or: fun name(...) =\n        scope.launch {
        const re =
            /(\n[ \t]*)(fun \w+\([^)]*\)\s*)=\s*(?:\r?\n[ \t]*)?scope\.launch\s*\{/g;

        let result = "";
        let lastIndex = 0;
        let match;
        let count = 0;

        while ((match = re.exec(source)) !== null) {
            const indent = match[1]; // includes leading newline + spaces
            const funSig = match[2]; // "fun name(...) "
            const openBraceIndex = match.index + match[0].length - 1; // position of '{'
            const bodyStart = openBraceIndex + 1;

            // Find matching closing brace of the launch lambda
            let depth = 1;
            let i = bodyStart;
            while (i < source.length && depth > 0) {
                const ch = source[i];
                // Skip string/char literals so braces inside them are ignored
                if (ch === '"' || ch === "'") {
                    const quote = ch;
                    i++;
                    while (i < source.length) {
                        if (source[i] === "\\") {
                            i += 2;
                            continue;
                        }
                        if (source[i] === quote) {
                            i++;
                            break;
                        }
                        i++;
                    }
                    continue;
                }
                if (ch === "{") depth++;
                else if (ch === "}") depth--;
                i++;
            }

            // Rebuild: fun name(...): Unit { scope.launch { ... } }
            result += source.slice(lastIndex, match.index);
            result += indent + funSig.replace(/\s*$/, "") + ": Unit {";
            result += indent + "    scope.launch {";
            result += source.slice(bodyStart, i); // body + closing '}' of launch
            result += indent + "}"; // close the method
            lastIndex = i;
            count++;
        }

        result += source.slice(lastIndex);

        if (count === 0) {
            console.warn(
                "[patch-track-player] no `= scope.launch` ReactMethods found for TurboModule void patch",
            );
        } else {
            result = result.replace(/^(package[^\n]*\n)/, `$1\n${marker}\n`);
            if (!result.includes(unitMarker)) {
                result = result.replace(marker, `${marker}\n${unitMarker}`);
            }
            source = result;
            changed = true;
            console.log(
                `[patch-track-player] patched ${count} MusicModule methods for TurboModule void return (RN New Arch)`,
            );
        }
    } else {
        console.log("[patch-track-player] TurboModule void return already patched");
    }

    // Phase 2: ensure explicit `: Unit` on already-converted block-body methods.
    // Block-body without `: Unit` should still compile to void, but explicit Unit
    // prevents any future inference footguns and is easy to verify in bytecode.
    if (!source.includes(unitMarker)) {
        let unitCount = 0;
        source = source.replace(
            /(\n[ \t]*fun \w+\([^)]*\))(?!\s*:\s*Unit)\s*\{\s*(\r?\n[ \t]*scope\.launch\s*\{)/g,
            (full, sig, rest) => {
                unitCount++;
                return `${sig}: Unit {${rest}`;
            },
        );
        if (unitCount > 0) {
            source = source.replace(
                /^(package[^\n]*\n(?:\n\/\* musicfree[^\n]*\*\/\n)*)/m,
                match =>
                    match.includes(unitMarker)
                        ? match
                        : match.replace(/\n$/, `\n${unitMarker}\n`),
            );
            if (!source.includes(unitMarker)) {
                source = source.replace(
                    /^(package[^\n]*\n)/,
                    `$1\n${unitMarker}\n`,
                );
            }
            changed = true;
            console.log(
                `[patch-track-player] added explicit : Unit to ${unitCount} MusicModule methods`,
            );
        } else {
            // Mark done even if nothing to change (methods may already have : Unit from phase 1)
            if (!source.includes(unitMarker)) {
                source = source.replace(
                    /^(package[^\n]*\n)/,
                    `$1\n${unitMarker}\n`,
                );
                changed = true;
            }
            console.log("[patch-track-player] explicit : Unit already present or N/A");
        }
    } else {
        console.log("[patch-track-player] explicit : Unit already applied");
    }

    if (changed) {
        fs.writeFileSync(modulePath, source);
    }
}

/**
 * Stale kotlin-classes under node_modules keep returning Job at runtime even after
 * source is patched. Delete the library build dir so the next Gradle run recompiles.
 */
function cleanTrackPlayerAndroidBuild() {
    const buildDir = path.join(
        __dirname,
        "..",
        "node_modules",
        "react-native-track-player",
        "android",
        "build",
    );
    if (!fs.existsSync(buildDir)) {
        return;
    }
    try {
        fs.rmSync(buildDir, { recursive: true, force: true });
        console.log("[patch-track-player] cleaned react-native-track-player/android/build");
    } catch (err) {
        console.warn(
            "[patch-track-player] failed to clean android/build (will rely on Gradle):",
            err && err.message ? err.message : err,
        );
    }
}

patchOnBind();
patchReactContextEmit();
patchBundleNullability();
patchTurboModuleVoidReturn();
cleanTrackPlayerAndroidBuild();
