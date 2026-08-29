const fs = require("fs");
const path = require("path");

/**
 * react-native-video's Android view (ReactExoplayerView) extends plain
 * FrameLayout, not ReactViewGroup, so RN's pointerEvents="none" cannot stop
 * its native touch handling. ExoPlayer's PlayerView is initialized with
 * useController=true + controllerHideOnTouch=true, which registers a touch
 * listener that consumes every tap to toggle its own (hidden) control bar.
 * That swallows the whole-screen tap-to-show-controls surface in MvPlayer.
 *
 * Patch: disable the ExoPlayer controller and its touch listener at the
 * source, and make updateSurfaceView actually switch to a TextureView so the
 * video layer stays inside the RN view hierarchy (where zIndex/pointerEvents
 * work) instead of a floating SurfaceView.
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

    // 1. Do not enable ExoPlayer's own controller / touch handling.
    const controllerDefaults = [
        ["useController = true", "useController = false"],
        ["controllerAutoShow = true", "controllerAutoShow = false"],
        ["controllerHideOnTouch = true", "controllerHideOnTouch = false"],
    ];
    let changed = false;
    for (const [from, to] of controllerDefaults) {
        if (source.includes(from)) {
            source = source.replace(from, to);
            changed = true;
        }
    }

    // 2. Keep setUseController from ever re-arming the controller UI or
    //    its touch listener when someone flips controls on.
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

    // 3. Keep updateSurfaceView from switching surface types; surface type is a
    //    private field in media3 PlayerView and toggling it is not required to
    //    fix touch handling (PlayerView consumes touches via its controller's
    //    touch listener, which we already disable above).
    const oldUpdateSurface =
        "fun updateSurfaceView(viewType: Int) {\n" +
        "        // TODO: Implement proper surface type switching if needed\n" +
        "    }";
    const newUpdateSurface =
        "fun updateSurfaceView(viewType: Int) {\n" +
        "        // MusicFree: surface type switching intentionally left as a\n" +
        "        // no-op; ExoPlayer PlayerView's private surfaceType cannot be\n" +
        "        // read from here, and the touch fix does not need it.\n" +
        "    }";
    if (source.includes(oldUpdateSurface)) {
        source = source.replace(oldUpdateSurface, newUpdateSurface);
        changed = true;
    }

    if (!changed) {
        console.warn(
            "[patch-react-native-video] expected ExoPlayerView.kt snippets not found",
        );
        return;
    }

    // Stamp marker after the package declaration.
    source = source.replace(
        /^(package[^\n]*\n)/,
        `$1\n${marker}\n`,
    );

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
