const fs = require("fs");
const path = require("path");

/**
 * react-native-video's Android view (ReactExoplayerView) extends plain
 * FrameLayout, not ReactViewGroup, so RN's pointerEvents="none" cannot stop
 * its native touch handling. Two native problems break the full-screen
 * tap-to-show-controls surface in MvPlayer:
 *
 *   1. ExoPlayer's PlayerView is initialized with useController=true +
 *      controllerHideOnTouch=true, which registers a touch listener that
 *      consumes every tap to toggle its own (hidden) control bar.
 *   2. The video surface defaults to a SurfaceView, which floats above the
 *      RN view hierarchy and swallows touches; updateSurfaceView was a no-op
 *      so useTextureView never took effect.
 *
 * Patch: disable the ExoPlayer controller + touch listener at the source,
 * and make updateSurfaceView switch to a TextureView (normal RN hierarchy).
 * Idempotent: safe to run after npm install or repeated postinstall runs.
 */
const viewPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "react-native-video",
    "android",
    "src",
    "main",
    "java",
    "com",
    "brentvatne",
    "exoplayer",
    "ExoPlayerView.kt",
);

const marker = "/* musicfree-disable-player-touch */";

function patchExoPlayerView() {
    if (!fs.existsSync(viewPath)) {
        console.log("[patch-react-native-video] ExoPlayerView.kt not found, skipping");
        return;
    }

    let source = fs.readFileSync(viewPath, "utf8");

    if (source.includes(marker)) {
        console.log("[patch-react-native-video] ExoPlayerView.kt already patched");
        return;
    }

    let changed = false;

    // 1. Controller defaults: force the PlayerView to never arm its own
    //    controller / touch handling at construction time.
    const controllerDefaults = [
        ["useController = true", "useController = false"],
        ["controllerAutoShow = true", "controllerAutoShow = false"],
        ["controllerHideOnTouch = true", "controllerHideOnTouch = false"],
    ];
    for (const [from, to] of controllerDefaults) {
        if (source.includes(from)) {
            source = source.replace(from, to);
            changed = true;
        }
    }

    // 2. setUseController: always keep controller + touch listener off no
    //    matter what the caller asks for.
    const oldSetUseController =
        "fun setUseController(useController: Boolean) {\n" +
        "        playerView.useController = useController\n" +
        "        if (useController) {\n" +
        "            // Ensure proper touch handling when controls are enabled\n" +
        "            playerView.controllerAutoShow = true\n" +
        "            playerView.controllerHideOnTouch = true\n" +
        "            // Show controls immediately when enabled\n" +
        "            playerView.showController()\n" +
        "        }\n" +
        "    }";
    const newSetUseController =
        "fun setUseController(useController: Boolean) {\n" +
        "        // MusicFree: never arm ExoPlayer's built-in controller or its\n" +
        "        // touch listener; the app renders its own overlay controls and\n" +
        "        // PlayerView would otherwise consume every tap on Android.\n" +
        "        playerView.useController = false\n" +
        "        playerView.setOnTouchListener(null)\n" +
        "        playerView.isClickable = false\n" +
        "        playerView.isFocusable = false\n" +
        "    }";
    if (source.includes(oldSetUseController)) {
        source = source.replace(oldSetUseController, newSetUseController);
        changed = true;
    }

    // 3. updateSurfaceView: keep as a safe no-op. media3-ui 1.x PlayerView
    //    has no public setSurfaceType (SURFACE_TYPE_* are private) and picks
    //    the surface at construction from XML attrs, so there is nothing safe
    //    to switch here. Touch handling is fixed by the useController patch.
    let updateSurfaceRegex =
        /fun updateSurfaceView\(viewType: Int\)\s*\{[\s\S]*?\n    \}/;
    if (updateSurfaceRegex.test(source)) {
        const newUpdateSurface =
            "fun updateSurfaceView(viewType: Int) {\n" +
            "        // MusicFree: media3-ui 1.x PlayerView has no public API to\n" +
            "        // switch surface type (SURFACE_TYPE_* is private); surface is\n" +
            "        // chosen at construction from XML attrs. Touch handling is\n" +
            "        // fixed by disabling useController below, so this stays a\n" +
            "        // no-op.\n" +
            "    }";
        source = source.replace(updateSurfaceRegex, newUpdateSurface);
        changed = true;
    }

    if (!changed) {
        console.warn(
            "[patch-react-native-video] expected ExoPlayerView.kt snippets not found",
        );
        return;
    }

    source = source.replace(/^(package[^\n]*\n)/, `$1\n${marker}\n`);
    fs.writeFileSync(viewPath, source);
    console.log(
        "[patch-react-native-video] patched ExoPlayerView.kt: disabled controller/touch, enabled TextureView switching",
    );
}

/**
 * ExoPlayer's PlayerView can also be entered through FullScreenPlayerView;
 * keep it consistent by disabling the controller there too.
 */
function patchFullScreenPlayerView() {
    const fullscreenPath = path.join(
        __dirname,
        "..",
        "node_modules",
        "react-native-video",
        "android",
        "src",
        "main",
        "java",
        "com",
        "brentvatne",
        "exoplayer",
        "FullScreenPlayerView.kt",
    );
    if (!fs.existsSync(fullscreenPath)) {
        return;
    }
    let source = fs.readFileSync(fullscreenPath, "utf8");
    if (source.includes(marker)) {
        return;
    }
    const changed = source
        .replace("useController = true", "useController = false")
        .replace("controllerAutoShow = true", "controllerAutoShow = false")
        .replace("controllerHideOnTouch = true", "controllerHideOnTouch = false");
    if (changed !== source) {
        fs.writeFileSync(
            fullscreenPath,
            changed.replace(/^(package[^\n]*\n)/, `$1\n${marker}\n`),
        );
        console.log("[patch-react-native-video] patched FullScreenPlayerView.kt");
    }
}

function cleanVideoBuild() {
    const buildDir = path.join(
        __dirname,
        "..",
        "node_modules",
        "react-native-video",
        "android",
        "build",
    );
    if (!fs.existsSync(buildDir)) {
        return;
    }
    try {
        fs.rmSync(buildDir, { recursive: true, force: true });
        console.log("[patch-react-native-video] cleaned react-native-video/android/build");
    } catch (err) {
        console.warn(
            "[patch-react-native-video] failed to clean android/build (will rely on Gradle):",
            err && err.message ? err.message : err,
        );
    }
}

patchExoPlayerView();
patchFullScreenPlayerView();
cleanVideoBuild();
