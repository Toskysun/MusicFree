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
 * and recreate PlayerView with the requested surface type. media3's PlayerView
 * chooses its surface in the constructor, so updateSurfaceView must replace
 * the view rather than call a non-existent setter.
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

const marker = "/* musicfree-player-touch-v2 */";

const textureLayoutPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "react-native-video",
    "android",
    "src",
    "main",
    "res",
    "layout",
    "musicfree_texture_player_view.xml",
);

const textureLayout = `<?xml version="1.0" encoding="utf-8"?>
<androidx.media3.ui.PlayerView
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    app:surface_type="texture_view" />
`;

function ensureTexturePlayerViewResource() {
    const layoutDirectory = path.dirname(textureLayoutPath);
    fs.mkdirSync(layoutDirectory, { recursive: true });
    if (!fs.existsSync(textureLayoutPath) || fs.readFileSync(textureLayoutPath, "utf8") !== textureLayout) {
        fs.writeFileSync(textureLayoutPath, textureLayout);
    }
}

function patchExoPlayerView() {
    if (!fs.existsSync(viewPath)) {
        console.log("[patch-react-native-video] ExoPlayerView.kt not found, skipping");
        return;
    }

    ensureTexturePlayerViewResource();

    let source = fs.readFileSync(viewPath, "utf8");

    let changed = false;

    // Upgrade the marker on a worktree that still has the previous patch. It
    // is important to continue below so the surface replacement is applied.
    const previousMarker = "/* musicfree-disable-player-touch */";
    if (source.includes(previousMarker) && !source.includes(marker)) {
        source = source.replace(previousMarker, marker);
        changed = true;
    }

    // The previous marker is upgraded in-place; these imports/state changes
    // are then applied below to keep existing worktrees compatible.

    // PlayerView chooses its surface in the constructor. Use a real XML
    // resource so Android can provide the parser implementation expected by
    // Context.obtainStyledAttributes.
    const imports = [
        [
            "import android.util.AttributeSet\n",
            "import android.util.AttributeSet\nimport android.view.LayoutInflater\n",
        ],
        [
            "import com.brentvatne.common.api.SubtitleStyle\n",
            "import com.brentvatne.common.api.SubtitleStyle\nimport com.brentvatne.common.api.ViewType\n",
        ],
    ];
    for (const [from, to] of imports) {
        if (source.includes(from) && !source.includes(to.trim())) {
            source = source.replace(from, to);
            changed = true;
        }
    }
    for (const obsoleteImport of ["import android.util.Xml\n", "import java.io.StringReader\n"]) {
        if (source.includes(obsoleteImport)) {
            source = source.replace(obsoleteImport, "");
            changed = true;
        }
    }

    const stateFields =
        "    private var currentViewType = ViewType.VIEW_TYPE_SURFACE\n" +
        "    private var controllerVisibilityListener: PlayerView.ControllerVisibilityListener? = null\n" +
        "    private var fullscreenButtonClickListener: PlayerView.FullscreenButtonClickListener? = null\n" +
        "    private var controllerShowTimeoutMs = 5000\n" +
        "    private var controllerAutoShow = false\n" +
        "    private var controllerHideOnTouch = false\n" +
        "    private var subtitleButtonVisible = false\n" +
        "    private var shutterColor = Color.TRANSPARENT\n" +
        "    private var focusable = true\n" +
        "    private val layoutChangeListeners = mutableListOf<View.OnLayoutChangeListener>()\n";
    if (!source.includes("private var currentViewType")) {
        source = source.replace(
            "    private var pendingResizeMode: Int? = null\n",
            "    private var pendingResizeMode: Int? = null\n" + stateFields,
        );
        changed = true;
    }

    const playerViewDeclaration =
        /    private (?:val|var) playerView = PlayerView\(context\)\.apply \{/;
    if (playerViewDeclaration.test(source)) {
        source = source.replace(
            playerViewDeclaration,
            "    private var playerView = createPlayerView(context, currentViewType).apply {",
        );
        changed = true;
    }

    const createPlayerViewHelper =
        "    private fun createPlayerView(context: Context, viewType: Int): PlayerView {\n" +
        "        if (viewType != ViewType.VIEW_TYPE_TEXTURE) {\n" +
        "            return PlayerView(context)\n" +
        "        }\n\n" +
        "        return LayoutInflater.from(context).inflate(\n" +
        "            com.brentvatne.react.R.layout.musicfree_texture_player_view,\n" +
        "            null,\n" +
        "            false,\n" +
        "        ) as PlayerView\n" +
        "    }\n\n";
    if (!source.includes("musicfree_texture_player_view")) {
        const helperStart = source.indexOf("    private fun createPlayerView");
        const nextMethodStart = source.indexOf("    fun setPlayer", helperStart);
        if (helperStart >= 0 && nextMethodStart > helperStart) {
            source = source.slice(0, helperStart) + createPlayerViewHelper + source.slice(nextMethodStart);
        } else {
            source = source.replace("    init {\n", createPlayerViewHelper + "    init {\n");
        }
        changed = true;
    }

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

    const setterReplacements = [
        [
            "fun setShutterColor(color: Int) {\n" +
                "        playerView.setShutterBackgroundColor(color)\n" +
                "    }",
            "fun setShutterColor(color: Int) {\n" +
                "        shutterColor = color\n" +
                "        playerView.setShutterBackgroundColor(color)\n" +
                "    }",
        ],
        [
            "fun setControllerShowTimeoutMs(showTimeoutMs: Int) {\n" +
                "        playerView.controllerShowTimeoutMs = showTimeoutMs\n" +
                "    }",
            "fun setControllerShowTimeoutMs(showTimeoutMs: Int) {\n" +
                "        controllerShowTimeoutMs = showTimeoutMs\n" +
                "        playerView.controllerShowTimeoutMs = showTimeoutMs\n" +
                "    }",
        ],
        [
            "fun setControllerAutoShow(autoShow: Boolean) {\n" +
                "        playerView.controllerAutoShow = autoShow\n" +
                "    }",
            "fun setControllerAutoShow(autoShow: Boolean) {\n" +
                "        controllerAutoShow = autoShow\n" +
                "        playerView.controllerAutoShow = autoShow\n" +
                "    }",
        ],
        [
            "fun setControllerHideOnTouch(hideOnTouch: Boolean) {\n" +
                "        playerView.controllerHideOnTouch = hideOnTouch\n" +
                "    }",
            "fun setControllerHideOnTouch(hideOnTouch: Boolean) {\n" +
                "        controllerHideOnTouch = hideOnTouch\n" +
                "        playerView.controllerHideOnTouch = hideOnTouch\n" +
                "    }",
        ],
        [
            "fun setFullscreenButtonClickListener(listener: PlayerView.FullscreenButtonClickListener?) {\n" +
                "        playerView.setFullscreenButtonClickListener(listener)\n" +
                "    }",
            "fun setFullscreenButtonClickListener(listener: PlayerView.FullscreenButtonClickListener?) {\n" +
                "        fullscreenButtonClickListener = listener\n" +
                "        playerView.setFullscreenButtonClickListener(listener)\n" +
                "    }",
        ],
        [
            "fun setShowSubtitleButton(show: Boolean) {\n" +
                "        playerView.setShowSubtitleButton(show)\n" +
                "    }",
            "fun setShowSubtitleButton(show: Boolean) {\n" +
                "        subtitleButtonVisible = show\n" +
                "        playerView.setShowSubtitleButton(show)\n" +
                "    }",
        ],
        [
            "fun setControllerVisibilityListener(listener: PlayerView.ControllerVisibilityListener?) {\n" +
                "        playerView.setControllerVisibilityListener(listener)\n" +
                "    }",
            "fun setControllerVisibilityListener(listener: PlayerView.ControllerVisibilityListener?) {\n" +
                "        controllerVisibilityListener = listener\n" +
                "        playerView.setControllerVisibilityListener(listener)\n" +
                "    }",
        ],
    ];
    for (const [from, to] of setterReplacements) {
        if (source.includes(from)) {
            source = source.replace(from, to);
            changed = true;
        }
    }

    const focusableMethod =
        "    override fun setFocusable(focusable: Boolean) {\n" +
        "        playerView.isFocusable = focusable\n" +
        "    }";
    const trackedFocusableMethod =
        "    override fun setFocusable(focusable: Boolean) {\n" +
        "        this.focusable = focusable\n" +
        "        playerView.isFocusable = focusable\n" +
        "    }";
    if (source.includes(focusableMethod)) {
        source = source.replace(focusableMethod, trackedFocusableMethod);
        changed = true;
    }

    const layoutListenerMethod =
        "    override fun addOnLayoutChangeListener(listener: View.OnLayoutChangeListener) {\n" +
        "        playerView.addOnLayoutChangeListener(listener)\n" +
        "    }";
    const trackedLayoutListenerMethod =
        "    override fun addOnLayoutChangeListener(listener: View.OnLayoutChangeListener) {\n" +
        "        layoutChangeListeners += listener\n" +
        "        playerView.addOnLayoutChangeListener(listener)\n" +
        "    }";
    if (source.includes(layoutListenerMethod)) {
        source = source.replace(layoutListenerMethod, trackedLayoutListenerMethod);
        changed = true;
    }

    // 3. PlayerView has no public setSurfaceType. Replace it when React Native
    //    changes viewType, preserving the player and listeners across the swap.
    let updateSurfaceRegex =
        /fun updateSurfaceView\(viewType: Int\)\s*\{[\s\S]*?\n    \}/;
    if (updateSurfaceRegex.test(source)) {
        const newUpdateSurface =
            "fun updateSurfaceView(viewType: Int) {\n" +
            "        val normalizedType = when (viewType) {\n" +
            "            ViewType.VIEW_TYPE_TEXTURE -> ViewType.VIEW_TYPE_TEXTURE\n" +
            "            else -> ViewType.VIEW_TYPE_SURFACE\n" +
            "        }\n" +
            "        if (normalizedType == currentViewType) return\n\n" +
            "        val oldPlayerView = playerView\n" +
            "        val currentPlayer = oldPlayerView.player\n" +
            "        val childIndex = indexOfChild(oldPlayerView).coerceAtLeast(0)\n" +
            "        oldPlayerView.player = null\n" +
            "        removeView(oldPlayerView)\n\n" +
            "        currentViewType = normalizedType\n" +
            "        playerView = createPlayerView(context, normalizedType).apply {\n" +
            "            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)\n" +
            "            setShutterBackgroundColor(shutterColor)\n" +
            "            useController = false\n" +
            "            controllerAutoShow = this@ExoPlayerView.controllerAutoShow\n" +
            "            controllerHideOnTouch = this@ExoPlayerView.controllerHideOnTouch\n" +
            "            controllerShowTimeoutMs = this@ExoPlayerView.controllerShowTimeoutMs\n" +
            "            setShowSubtitleButton(subtitleButtonVisible)\n" +
            "            setUseArtwork(false)\n" +
            "            setDefaultArtwork(null)\n" +
            "            pendingResizeMode?.let { resizeMode = it }\n" +
            "            setOnTouchListener(null)\n" +
            "            isClickable = false\n" +
            "            isFocusable = false\n" +
            "            controllerVisibilityListener?.let { setControllerVisibilityListener(it) }\n" +
            "            fullscreenButtonClickListener?.let { setFullscreenButtonClickListener(it) }\n" +
            "            isFocusable = this@ExoPlayerView.focusable\n" +
            "            if (currentPlayer != null) {\n" +
            "                player = currentPlayer\n" +
            "            }\n" +
            "        }\n" +
            "        addView(playerView, childIndex, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))\n" +
            "        setSubtitleStyle(localStyle)\n" +
            "        requestLayout()\n" +
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

    if (!source.includes(marker)) {
        source = source.replace(/^(package[^\n]*\n)/, `$1\n${marker}\n`);
    }
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
