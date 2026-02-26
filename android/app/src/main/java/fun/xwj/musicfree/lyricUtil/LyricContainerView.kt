package `fun`.xwj.musicfree.lyricUtil

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.LinearLayout
import kotlin.math.sqrt

/**
 * 桌面歌词容器 View（垂直 LinearLayout）
 * - 子 View 1: DesktopLyricView（歌词绘制）
 * - 子 View 2: ControlBarView（控制条：锁定/颜色圆点/字体-/字体+/关闭）
 * - 触摸状态机：tap(8dp 阈值) vs drag
 * - 控制条 3 秒自动隐藏，位于歌词下方
 */
class LyricContainerView(
    context: Context,
    private val callbacks: Callbacks,
) : LinearLayout(context) {

    interface Callbacks {
        fun onRequestLockStateChange(locked: Boolean)
        fun onRequestClose()
        fun onRequestColorPresetChange(nextIndex: Int)
        fun onRequestFontSizeChange(newFontSp: Float)
        fun onDragPercentChanged(leftPercent: Double, topPercent: Double)
        fun onLayoutChanged()
    }

    // ==================== 子 View ====================

    val lyricView: DesktopLyricView = DesktopLyricView(context)
    private val controlBar: ControlBarView

    // ==================== 状态 ====================

    private val tapSlopPx = 8f * resources.displayMetrics.density
    private var downRawX = 0f
    private var downRawY = 0f
    private var dragging = false
    private var locked = false
    var currentPresetIndex = 0
    var currentFontSp = 24f

    // 窗口尺寸（由 LyricView 注入，用于换算 percent）
    var windowWidthPx = 1080
    var windowHeightPx = 1920
    var viewWidthPx = 540

    private val hideHandler = Handler(Looper.getMainLooper())
    private val autoHideTask = Runnable { hideControlBar() }

    // ==================== 初始化 ====================

    init {
        orientation = VERTICAL

        // 歌词 View 铺满宽度
        addView(lyricView, LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.WRAP_CONTENT,
        ))

        // 控制条在歌词下方居中
        controlBar = ControlBarView(context)
        val barParams = LayoutParams(
            LayoutParams.WRAP_CONTENT,
            LayoutParams.WRAP_CONTENT,
        ).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            topMargin = (2 * resources.displayMetrics.density).toInt()
        }
        addView(controlBar, barParams)
        controlBar.visibility = View.GONE

        // 按钮点击
        controlBar.onLockClick = { onLockClick() }
        controlBar.onColorPresetClick = { index -> onColorPresetClick(index) }
        controlBar.onMinusClick = { onMinusClick() }
        controlBar.onPlusClick = { onPlusClick() }
        controlBar.onCloseClick = { callbacks.onRequestClose() }
    }

    // ==================== 公开方法 ====================

    fun setLocked(newLocked: Boolean) {
        locked = newLocked
        controlBar.setLocked(newLocked)
        if (newLocked) hideControlBar()
    }

    fun setPresetColors(colors: List<Int>) {
        controlBar.setPresetColors(colors, currentPresetIndex)
    }

    fun updateActivePreset(index: Int) {
        currentPresetIndex = index
        controlBar.setActivePreset(index)
    }

    fun showControlBar() {
        if (locked) return
        controlBar.visibility = View.VISIBLE
        scheduleAutoHide()
        // Post to let layout settle before notifying WindowManager
        post { callbacks.onLayoutChanged() }
    }

    fun hideControlBar() {
        hideHandler.removeCallbacks(autoHideTask)
        controlBar.visibility = View.GONE
        post { callbacks.onLayoutChanged() }
    }

    // ==================== 触摸处理 ====================

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        if (locked) return false
        return when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                // 记录起点，不拦截，让子 View（控制栏按钮）先处理
                downRawX = ev.rawX
                downRawY = ev.rawY
                dragging = false
                false
            }
            MotionEvent.ACTION_MOVE -> {
                // 超过阈值才拦截（变为拖拽）
                if (!dragging) {
                    val dx = ev.rawX - downRawX
                    val dy = ev.rawY - downRawY
                    if (sqrt(dx * dx + dy * dy) > tapSlopPx) {
                        dragging = true
                        hideControlBar()
                    }
                }
                dragging
            }
            else -> false
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (locked) return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                // 子 View 未消费时才到这里（空白区域点击）
                downRawX = event.rawX
                downRawY = event.rawY
                dragging = false
            }
            MotionEvent.ACTION_MOVE -> {
                if (dragging) {
                    val dx = event.rawX - downRawX
                    val dy = event.rawY - downRawY
                    val newLeft = (downRawX + dx - viewWidthPx / 2f)
                        .coerceIn(0f, (windowWidthPx - viewWidthPx).toFloat())
                    val newTop = (downRawY + dy - height / 2f)
                        .coerceIn(0f, (windowHeightPx - height).toFloat())
                    val leftPct = if (windowWidthPx > viewWidthPx)
                        newLeft / (windowWidthPx - viewWidthPx).toDouble() else 0.0
                    val topPct = if (windowHeightPx > height)
                        newTop / (windowHeightPx - height).toDouble() else 0.0
                    callbacks.onDragPercentChanged(
                        leftPct.coerceIn(0.0, 1.0),
                        topPct.coerceIn(0.0, 1.0),
                    )
                }
            }
            MotionEvent.ACTION_UP -> {
                if (!dragging) {
                    if (controlBar.visibility == View.VISIBLE) hideControlBar()
                    else showControlBar()
                }
                dragging = false
            }
            MotionEvent.ACTION_CANCEL -> {
                dragging = false
            }
        }
        return true
    }

    // ==================== 按钮回调 ====================

    private fun onLockClick() {
        callbacks.onRequestLockStateChange(!locked)
    }

    private fun onColorPresetClick(index: Int) {
        callbacks.onRequestColorPresetChange(index)
        scheduleAutoHide()
    }

    private fun onMinusClick() {
        callbacks.onRequestFontSizeChange((currentFontSp - 1f).coerceAtLeast(12f))
        scheduleAutoHide()
    }

    private fun onPlusClick() {
        callbacks.onRequestFontSizeChange((currentFontSp + 1f).coerceAtMost(56f))
        scheduleAutoHide()
    }

    private fun scheduleAutoHide() {
        hideHandler.removeCallbacks(autoHideTask)
        hideHandler.postDelayed(autoHideTask, 3000L)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        hideHandler.removeCallbacks(autoHideTask)
    }
}

// ==================== 控制条 View ====================

class ControlBarView(context: Context) : LinearLayout(context) {

    var onLockClick: (() -> Unit)? = null
    var onColorPresetClick: ((Int) -> Unit)? = null
    var onMinusClick: (() -> Unit)? = null
    var onPlusClick: (() -> Unit)? = null
    var onCloseClick: (() -> Unit)? = null

    private val lockBtn: LockIconButton
    private val minusBtn: ControlButton
    private val plusBtn: ControlButton
    private val closeBtn: ControlButton
    private val colorDotsContainer: LinearLayout

    private val dp = context.resources.displayMetrics.density
    private val dotSize = (18 * dp).toInt()
    private val dotMargin = (4 * dp).toInt()
    private val dotBorderWidth = (2 * dp)
    private var activePresetIndex = 0
    private val colorDots = mutableListOf<ColorDotView>()

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xCC1A1A1A.toInt()
        style = Paint.Style.FILL
    }
    private val bgRect = RectF()

    init {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setWillNotDraw(false)

        val btnSize = (36 * dp).toInt()
        val padding = (6 * dp).toInt()
        setPadding(padding, padding, padding, padding)

        lockBtn  = LockIconButton(context, btnSize) { onLockClick?.invoke() }
        minusBtn = ControlButton(context, "A-", btnSize) { onMinusClick?.invoke() }
        plusBtn  = ControlButton(context, "A+", btnSize) { onPlusClick?.invoke() }
        closeBtn = ControlButton(context, "✕", btnSize)  { onCloseClick?.invoke() }

        // Color dots container between lock and A-
        colorDotsContainer = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val lp = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
            lp.setMargins((4 * dp).toInt(), 0, (4 * dp).toInt(), 0)
            layoutParams = lp
        }

        addView(lockBtn)
        addView(colorDotsContainer)
        addView(minusBtn)
        addView(plusBtn)
        addView(closeBtn)
    }

    fun setLocked(locked: Boolean) {
        lockBtn.setLocked(locked)
    }

    fun setPresetColors(sungColors: List<Int>, activeIndex: Int) {
        colorDotsContainer.removeAllViews()
        colorDots.clear()
        activePresetIndex = activeIndex
        sungColors.forEachIndexed { idx, color ->
            val dot = ColorDotView(context, color, dotSize, idx == activeIndex, dotBorderWidth) {
                onColorPresetClick?.invoke(idx)
            }
            val lp = LayoutParams(dotSize, dotSize)
            lp.setMargins(dotMargin, 0, dotMargin, 0)
            colorDotsContainer.addView(dot, lp)
            colorDots.add(dot)
        }
    }

    fun setActivePreset(index: Int) {
        activePresetIndex = index
        colorDots.forEachIndexed { idx, dot ->
            dot.setActive(idx == index)
        }
    }

    override fun onDraw(canvas: Canvas) {
        bgRect.set(0f, 0f, width.toFloat(), height.toFloat())
        canvas.drawRoundRect(bgRect, 20f, 20f, bgPaint)
        super.onDraw(canvas)
    }
}

// ==================== 颜色圆点 View ====================

class ColorDotView(
    context: Context,
    private val dotColor: Int,
    size: Int,
    private var active: Boolean,
    private val borderWidth: Float,
    private val onClick: () -> Unit,
) : View(context) {

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = dotColor
        style = Paint.Style.FILL
    }
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = borderWidth
    }

    init {
        setOnClickListener { onClick() }
    }

    fun setActive(isActive: Boolean) {
        active = isActive
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        val radius = (width.coerceAtMost(height) / 2f) - borderWidth
        canvas.drawCircle(cx, cy, radius, fillPaint)
        if (active) {
            canvas.drawCircle(cx, cy, radius, borderPaint)
        }
    }
}

// ==================== 单个控制按钮 ====================

class ControlButton(
    context: Context,
    private var label: String,
    size: Int,
    private val onClick: () -> Unit,
) : View(context) {

    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = size * 0.45f
        textAlign = Paint.Align.CENTER
    }

    init {
        val lp = LinearLayout.LayoutParams(size, size)
        lp.setMargins(4, 0, 4, 0)
        layoutParams = lp
        setOnClickListener { onClick() }
    }

    fun setLabel(newLabel: String) {
        label = newLabel
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f - (textPaint.descent() + textPaint.ascent()) / 2f
        canvas.drawText(label, cx, cy, textPaint)
    }
}

// ==================== 锁定图标按钮 ====================

class LockIconButton(
    context: Context,
    size: Int,
    private val onClick: () -> Unit,
) : View(context) {

    private var locked = false

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = size * 0.07f
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.FILL
    }

    init {
        val lp = LinearLayout.LayoutParams(size, size)
        lp.setMargins(4, 0, 4, 0)
        layoutParams = lp
        setOnClickListener { onClick() }
    }

    fun setLocked(isLocked: Boolean) {
        locked = isLocked
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()

        // 缩小绘制区域，与文字按钮视觉大小一致
        val scale = 0.55f
        val ox = w * (1f - scale) / 2f
        val oy = h * (1f - scale) / 2f
        canvas.save()
        canvas.translate(ox, oy)
        val sw = w * scale
        val sh = h * scale

        // 锁体（圆角矩形）
        val bodyLeft = sw * 0.18f
        val bodyRight = sw * 0.82f
        val bodyTop = sh * 0.46f
        val bodyBottom = sh * 0.88f
        val bodyRadius = sw * 0.08f
        val bodyRect = RectF(bodyLeft, bodyTop, bodyRight, bodyBottom)
        canvas.drawRoundRect(bodyRect, bodyRadius, bodyRadius, paint)

        // 锁孔
        canvas.drawCircle(sw * 0.5f, (bodyTop + bodyBottom) * 0.48f, sw * 0.05f, fillPaint)

        // 锁环
        val shackleRect = RectF(sw * 0.28f, sh * 0.12f, sw * 0.72f, sh * 0.58f)
        if (locked) {
            canvas.drawArc(shackleRect, 180f, 180f, false, paint)
        } else {
            val openRect = RectF(sw * 0.28f, sh * 0.04f, sw * 0.72f, sh * 0.50f)
            canvas.drawArc(openRect, 180f, 150f, false, paint)
        }

        canvas.restore()
    }
}
