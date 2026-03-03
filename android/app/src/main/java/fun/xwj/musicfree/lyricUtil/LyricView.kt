package `fun`.xwj.musicfree.lyricUtil

import android.app.Activity
import android.graphics.PixelFormat
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.OrientationEventListener
import android.view.WindowManager
import android.graphics.Color
import com.facebook.react.bridge.ReactContext


class LyricView(private val reactContext: ReactContext) : Activity() {

    private var windowManager: WindowManager? = null
    private var orientationEventListener: OrientationEventListener? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var container: LyricContainerView? = null

    // 独立控制条悬浮窗
    private var controlBar: ControlBarView? = null
    private var controlBarParams: WindowManager.LayoutParams? = null
    private var controlBarVisible = false
    private val hideHandler = Handler(Looper.getMainLooper())
    private val autoHideTask = Runnable { hideControlBar() }

    // 窗口信息
    private val controlBarGapPx = (10 * reactContext.resources.displayMetrics.density).toInt()
    private var windowWidth = 0.0
    private var windowHeight = 0.0
    private var widthPercent = 0.0
    private var leftPercent = 0.0
    private var topPercent = 0.0

    // 锁定状态
    private var isLocked = false

    // 预设颜色缓存（由 JS 传入）
    private var presets: List<Triple<Int, Int, Int>> = emptyList()
    private var currentPresetIndex = 0
    private var currentFontSp = 24f

    // 事件回调（由 LyricUtilModule 注入）
    var onLockStateChanged: ((Boolean) -> Unit)? = null
    var onPresetChanged: ((Int) -> Unit)? = null
    var onPresetLongPressed: ((Int) -> Unit)? = null
    var onFontSizeChanged: ((Float) -> Unit)? = null
    var onPositionChanged: ((Double, Double) -> Unit)? = null
    var onClose: (() -> Unit)? = null

    // 基础 flags（不含 NOT_TOUCHABLE）
    private val baseFlags = (WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
            or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)

    // 展示歌词窗口
    fun showLyricWindow(initText: String?, options: Map<String, Any>) {
        try {
            if (windowManager == null) {
                windowManager = reactContext.getSystemService(WINDOW_SERVICE) as WindowManager
                layoutParams = WindowManager.LayoutParams()

                val outMetrics = DisplayMetrics()
                @Suppress("DEPRECATION")
                windowManager?.defaultDisplay?.getMetrics(outMetrics)
                windowWidth = outMetrics.widthPixels.toDouble()
                windowHeight = outMetrics.heightPixels.toDouble()

                layoutParams?.type = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O)
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
                else
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY

                val topPct = options["topPercent"]
                val leftPct = options["leftPercent"]
                val align = options["align"]
                val color = options["color"]
                val backgroundColor = options["backgroundColor"]
                val sungColor = options["sungColor"]
                val widthPct = options["widthPercent"]
                val fontSize = options["fontSize"]
                val presetIndex = options["presetIndex"]?.toString()?.toIntOrNull() ?: 0
                val presetsRaw = options["presets"] as? List<*>

                this.widthPercent = widthPct?.toString()?.toDouble() ?: 0.5
                this.currentPresetIndex = presetIndex

                if (presetsRaw != null) {
                    presets = presetsRaw.mapNotNull { item ->
                        (item as? Map<*, *>)?.let { m ->
                            Triple(
                                parseColor(m["unsungColor"]?.toString(), "#FFE9D2"),
                                parseColor(m["sungColor"]?.toString(), "#FFFFFFFF"),
                                parseColor(m["backgroundColor"]?.toString(), "#84888153"),
                            )
                        }
                    }
                }

                layoutParams?.width = (this.widthPercent * windowWidth).toInt()
                layoutParams?.height = WindowManager.LayoutParams.WRAP_CONTENT
                layoutParams?.gravity = Gravity.TOP or Gravity.START

                this.leftPercent = leftPct?.toString()?.toDouble() ?: 0.5
                layoutParams?.let { params ->
                    params.x = (this.leftPercent * (windowWidth - params.width)).toInt()
                }
                layoutParams?.y = 0
                layoutParams?.flags = baseFlags
                layoutParams?.format = PixelFormat.TRANSPARENT

                val textSizePx = (fontSize?.toString()?.toFloat() ?: 14f) * reactContext.resources.displayMetrics.scaledDensity
                val secondaryFontRatio = options["secondaryFontRatio"]?.toString()?.toFloat() ?: 0.85f
                val secondaryAlphaRatio = options["secondaryAlphaRatio"]?.toString()?.toFloat() ?: 0.90f
                val unsungColorParsed = parseColor(color?.toString(), "#FFE9D2")
                val bgColorParsed = parseColor(backgroundColor?.toString(), "#84888153")
                val sungColorParsed = parseColor(sungColor?.toString(), "#FFFFFFFF")
                val alignGravity = align?.toString()?.toInt() ?: Gravity.CENTER
                this.currentFontSp = fontSize?.toString()?.toFloat() ?: 14f

                container = LyricContainerView(reactContext, object : LyricContainerView.Callbacks {
                    override fun onRequestLockStateChange(locked: Boolean) {
                        updateTouchableFlag(locked)
                        onLockStateChanged?.invoke(locked)
                    }
                    override fun onRequestClose() {
                        hideLyricWindow()
                        onClose?.invoke()
                    }
                    override fun onRequestColorPresetChange(nextIndex: Int) {
                        val idx = if (presets.isEmpty()) 0 else nextIndex % presets.size
                        applyPreset(idx)
                        onPresetChanged?.invoke(idx)
                    }
                    override fun onRequestColorPresetLongPress(index: Int) {
                        onPresetLongPressed?.invoke(index)
                    }
                    override fun onRequestFontSizeChange(newFontSp: Float) {
                        setFontSize(newFontSp)
                        onFontSizeChanged?.invoke(newFontSp)
                    }
                    override fun onDragPercentChanged(leftPercent: Double, topPercent: Double) {
                        setLeftPercent(leftPercent)
                        setTopPercent(topPercent)
                    }
                    override fun onDragFinished(leftPercent: Double, topPercent: Double) {
                        onPositionChanged?.invoke(leftPercent, topPercent)
                    }
                    override fun onDragStarted() {
                        hideControlBar()  // 拖动开始时隐藏控制条
                    }
                    override fun onLayoutChanged() {
                        refreshWindowLayout()
                    }
                    override fun onTapToggleControlBar() {
                        if (controlBarVisible) hideControlBar() else showControlBar()
                    }
                }).also { c ->
                    c.lyricView.setText(initText ?: "")
                    c.lyricView.setTextSize(textSizePx)
                    c.lyricView.setSecondaryFontRatio(secondaryFontRatio)
                    c.lyricView.setSecondaryAlphaRatio(secondaryAlphaRatio)
                    c.lyricView.setUnsungColor(unsungColorParsed)
                    c.lyricView.setLyricBackgroundColor(bgColorParsed)
                    c.lyricView.setSungColor(sungColorParsed)
                    c.lyricView.setTextAlign(alignGravity)
                    c.currentFontSp = this.currentFontSp
                    c.currentPresetIndex = presetIndex
                    c.windowWidthPx = windowWidth.toInt()
                    c.windowHeightPx = windowHeight.toInt()
                    c.viewWidthPx = layoutParams!!.width
                    c.viewLeftPx = layoutParams?.x ?: 0
                    c.viewTopPx = layoutParams?.y ?: 0
                }

                windowManager?.addView(container, layoutParams)
                topPct?.toString()?.toDouble()?.let { setTopPercent(it) }

                // 创建独立控制条悬浮窗（不添加到窗口，等用户点击时再显示）
                createControlBar()

                if (presets.isNotEmpty()) {
                    applyPreset(currentPresetIndex)
                }

                listenOrientationChange()
            }
        } catch (e: Exception) {
            hideLyricWindow()
            throw e
        }
    }

    // ==================== 独立控制条悬浮窗 ====================

    private fun createControlBar() {
        controlBar = ControlBarView(reactContext).apply {
            onLockClick = {
                updateTouchableFlag(!isLocked)
                onLockStateChanged?.invoke(isLocked)
            }
            onColorPresetClick = { index ->
                val idx = if (presets.isEmpty()) 0 else index % presets.size
                applyPreset(idx)
                onPresetChanged?.invoke(idx)
                scheduleAutoHide()
            }
            onColorPresetLongPress = { index ->
                onPresetLongPressed?.invoke(index)
            }
            onMinusClick = {
                setFontSize((currentFontSp - 1f).coerceAtLeast(12f))
                onFontSizeChanged?.invoke(currentFontSp)
                scheduleAutoHide()
            }
            onPlusClick = {
                setFontSize((currentFontSp + 1f).coerceAtMost(56f))
                onFontSizeChanged?.invoke(currentFontSp)
                scheduleAutoHide()
            }
            onCloseClick = {
                hideLyricWindow()
                onClose?.invoke()
            }
        }

        // 设置预设颜色
        if (presets.isNotEmpty()) {
            controlBar?.setPresetColors(presets.map { it.second }, currentPresetIndex)
        }

        // 创建控制条的 WindowManager.LayoutParams
        controlBarParams = WindowManager.LayoutParams().apply {
            type = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O)
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
            else
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY

            width = (windowWidth * 0.85).toInt()
            height = WindowManager.LayoutParams.WRAP_CONTENT
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
            format = PixelFormat.TRANSPARENT
        }
    }

    private fun showControlBar() {
        if (isLocked || controlBar == null || controlBarVisible) return

        // 计算控制条位置：紧贴歌词窗口正下方
        updateControlBarPosition()

        try {
            windowManager?.addView(controlBar, controlBarParams)
            controlBarVisible = true
            scheduleAutoHide()
        } catch (_: Exception) {}
    }

    private fun hideControlBar() {
        hideHandler.removeCallbacks(autoHideTask)
        if (!controlBarVisible || controlBar == null) return
        try {
            windowManager?.removeView(controlBar)
        } catch (_: Exception) {}
        controlBarVisible = false
    }

    private fun scheduleAutoHide() {
        hideHandler.removeCallbacks(autoHideTask)
        hideHandler.postDelayed(autoHideTask, 3000L)
    }

    /** 更新控制条位置：紧贴歌词窗口正下方居中 */
    private fun updateControlBarPosition() {
        controlBarParams?.let { params ->
            val lyricY = layoutParams?.y ?: 0
            val lyricH = container?.let { if (it.height > 0) it.height else it.measuredHeight } ?: 0
            val gap = controlBarGapPx
            params.y = lyricY + lyricH + gap
        }
        if (controlBarVisible) {
            try { windowManager?.updateViewLayout(controlBar, controlBarParams) } catch (_: Exception) {}
        }
    }

    // ==================== 内部方法 ====================

    private fun updateTouchableFlag(locked: Boolean) {
        isLocked = locked
        container?.setLocked(locked)
        controlBar?.setLocked(locked)
        layoutParams?.flags = if (locked) {
            baseFlags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        } else {
            baseFlags
        }
        try {
            windowManager?.updateViewLayout(container, layoutParams)
        } catch (_: Exception) {}
        if (locked) hideControlBar()
    }

    private fun refreshWindowLayout() {
        try {
            windowManager?.updateViewLayout(container, layoutParams)
        } catch (_: Exception) {}
        updateControlBarPosition()
    }

    private fun applyPreset(index: Int) {
        if (presets.isEmpty()) return
        val idx = index.coerceIn(0, presets.size - 1)
        currentPresetIndex = idx
        container?.currentPresetIndex = idx
        controlBar?.setActivePreset(idx)
        val (unsungColor, sungColor, bgColor) = presets[idx]
        container?.lyricView?.setUnsungColor(unsungColor)
        container?.lyricView?.setSungColor(sungColor)
        container?.lyricView?.setLyricBackgroundColor(bgColor)
    }

    private fun listenOrientationChange() {
        if (windowManager == null) return
        if (orientationEventListener == null) {
            orientationEventListener = object : OrientationEventListener(reactContext, SensorManager.SENSOR_DELAY_NORMAL) {
                override fun onOrientationChanged(orientation: Int) {
                    if (windowManager != null) {
                        val outMetrics = DisplayMetrics()
                        @Suppress("DEPRECATION")
                        windowManager?.defaultDisplay?.getMetrics(outMetrics)
                        windowWidth = outMetrics.widthPixels.toDouble()
                        windowHeight = outMetrics.heightPixels.toDouble()
                        layoutParams?.let { params ->
                            params.width = (widthPercent * windowWidth).toInt()
                            params.x = (leftPercent * (windowWidth - params.width)).toInt()
                            container?.let { c ->
                                params.y = (topPercent * (windowHeight - c.height)).toInt()
                                c.windowWidthPx = windowWidth.toInt()
                                c.windowHeightPx = windowHeight.toInt()
                                c.viewWidthPx = params.width
                                c.viewLeftPx = params.x
                                c.viewTopPx = params.y
                            }
                        }
                        // 更新控制条宽度
                        controlBarParams?.width = (windowWidth * 0.85).toInt()
                        try {
                            windowManager?.updateViewLayout(container, layoutParams)
                            if (controlBarVisible) {
                                windowManager?.updateViewLayout(controlBar, controlBarParams)
                            }
                        } catch (_: Exception) {}
                        updateControlBarPosition()
                    }
                }
            }
        }
        if (orientationEventListener?.canDetectOrientation() == true) {
            orientationEventListener?.enable()
        }
    }

    private fun unlistenOrientationChange() {
        orientationEventListener?.disable()
    }

    private fun parseColor(colorStr: String?, fallback: String): Int {
        return try {
            Color.parseColor(rgba2argb(colorStr ?: fallback))
        } catch (e: Exception) {
            Color.parseColor(rgba2argb(fallback))
        }
    }

    private fun rgba2argb(color: String): String {
        return if (color.length == 9) {
            color[0] + color.substring(7, 9) + color.substring(1, 7)
        } else {
            color
        }
    }

    // ==================== 公开方法 ====================

    fun hideLyricWindow() {
        hideControlBar()
        if (windowManager != null) {
            container?.let {
                try { windowManager?.removeView(it) } catch (_: Exception) {}
                container = null
            }
            controlBar = null
            controlBarParams = null
            windowManager = null
            layoutParams = null
            unlistenOrientationChange()
        }
    }

    fun setText(text: String) {
        container?.lyricView?.setText(text)
        requestLayoutUpdate()
    }

    fun setDesktopLyricLine(line: DesktopLyricView.LyricLine) {
        container?.lyricView?.setLine(line)
        requestLayoutUpdate()
    }

    fun syncPlaybackState(snapshot: DesktopLyricView.PlaybackSnapshot) {
        container?.lyricView?.syncPlaybackState(snapshot)
    }

    fun setAlign(gravity: Int) {
        container?.lyricView?.setTextAlign(gravity)
    }

    fun setTopPercent(pct: Double) {
        val percent = pct.coerceIn(0.0, 1.0)
        container?.let {
            val viewHeight = (if (it.height > 0) it.height else it.measuredHeight).toDouble()
            val maxTop = (windowHeight - viewHeight).coerceAtLeast(0.0)
            layoutParams?.y = (percent * maxTop).toInt()
            it.viewTopPx = layoutParams?.y ?: it.viewTopPx
            try { windowManager?.updateViewLayout(it, layoutParams) } catch (_: Exception) {}
        }
        this.topPercent = percent
        updateControlBarPosition()
    }

    fun setLeftPercent(pct: Double) {
        val percent = pct.coerceIn(0.0, 1.0)
        container?.let {
            layoutParams?.let { params ->
                val maxLeft = (windowWidth - params.width).coerceAtLeast(0.0)
                params.x = (percent * maxLeft).toInt()
                it.viewLeftPx = params.x
            }
            try { windowManager?.updateViewLayout(it, layoutParams) } catch (_: Exception) {}
        }
        this.leftPercent = percent
    }

    fun setColors(textColor: String?, backgroundColor: String?) {
        container?.lyricView?.let { view ->
            textColor?.let { view.setUnsungColor(parseColor(it, "#FFE9D2")) }
            backgroundColor?.let { view.setLyricBackgroundColor(parseColor(it, "#84888153")) }
        }
    }

    fun setSungColor(sungColor: String?) {
        container?.lyricView?.let { view ->
            sungColor?.let { view.setSungColor(parseColor(it, "#FFFFFFFF")) }
        }
    }

    fun setWidth(pct: Double) {
        val percent = pct.coerceIn(0.3, 1.0)
        container?.let {
            val width = (percent * windowWidth).toInt()
            layoutParams?.let { params ->
                val originalWidth = params.width
                params.x = if (width <= originalWidth) {
                    params.x + (originalWidth - width) / 2
                } else {
                    params.x - (width - originalWidth) / 2
                }.coerceAtLeast(0).coerceAtMost((windowWidth - width).toInt())
                params.width = width
                it.viewWidthPx = width
                it.viewLeftPx = params.x
            }
            try { windowManager?.updateViewLayout(it, layoutParams) } catch (_: Exception) {}
        }
        this.widthPercent = percent
    }

    fun setFontSize(fontSize: Float) {
        val textSizePx = fontSize * reactContext.resources.displayMetrics.scaledDensity
        container?.lyricView?.setTextSize(textSizePx)
        container?.currentFontSp = fontSize
        this.currentFontSp = fontSize
        requestLayoutUpdate()
    }

    fun lockDesktopLyric() = updateTouchableFlag(true)
    fun unlockDesktopLyric() = updateTouchableFlag(false)

    fun setColorPreset(index: Int) {
        applyPreset(index)
    }

    fun setSecondaryFontRatio(ratio: Float) {
        container?.lyricView?.setSecondaryFontRatio(ratio)
        requestLayoutUpdate()
    }

    fun setSecondaryAlphaRatio(ratio: Float) {
        container?.lyricView?.setSecondaryAlphaRatio(ratio)
    }

    fun setPresetColors(colors: List<Int>) {
        controlBar?.setPresetColors(colors, currentPresetIndex)
    }

    private fun requestLayoutUpdate() {
        container?.let { view ->
            view.requestLayout()
            view.post {
                try { windowManager?.updateViewLayout(view, layoutParams) } catch (_: Exception) {}
                updateControlBarPosition()
            }
        }
    }
}
