package `fun`.xwj.musicfree.lyricUtil

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.SystemClock
import android.text.TextPaint
import android.view.Choreographer
import android.view.Gravity
import android.view.View

/**
 * 桌面逐字歌词自绘 View
 * - 有逐字数据时：按 word 时间戳从左到右平滑变色扫过
 * - 无逐字数据时：降级为整行纯文本
 * - 翻译/罗马音行始终纯文本
 */
class DesktopLyricView(context: Context) : View(context) {

    // ==================== 数据模型 ====================

    data class WordData(
        val text: String,
        val startTime: Long,   // 绝对毫秒
        val duration: Long,
        val space: Boolean = false,
    )

    data class SecondaryLine(
        val type: String,      // "translation" | "romanization"
        val text: String,
    )

    data class LyricLine(
        val lineId: String,
        val primaryText: String,
        val primaryWords: List<WordData>?,
        val secondaryLines: List<SecondaryLine>,
        val lineStartMs: Long,
        val lineDurationMs: Long?,
    )

    enum class PlaybackStatus { PLAYING, PAUSED, STOPPED }

    data class PlaybackSnapshot(
        val status: PlaybackStatus,
        val positionMs: Long,
        val speed: Float = 1f,
        val updatedAtElapsed: Long = SystemClock.elapsedRealtime(),
        val isSeek: Boolean = false,
    )

    // ==================== 绘制状态 ====================

    private var currentLine: LyricLine? = null
    private var previousLine: LyricLine? = null
    private var transitionStartMs: Long = 0L
    private var playbackSnapshot: PlaybackSnapshot = PlaybackSnapshot(
        PlaybackStatus.STOPPED, 0L
    )

    // 预计算的词位置缓存
    private var wordPositions: FloatArray? = null  // [startX, endX, startX, endX, ...]
    private var primaryTextWidth: Float = 0f
    private var primaryTextHeight: Float = 0f

    // ==================== 画笔 ====================

    private val strokePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x99000000.toInt()
        textSize = 48f
        isFakeBoldText = true
        style = Paint.Style.STROKE
        strokeWidth = 3f
        strokeJoin = Paint.Join.ROUND
    }

    private val unsungPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#FFE9D2")
        textSize = 48f
        isFakeBoldText = true
        style = Paint.Style.FILL
    }

    private val sungPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 48f
        isFakeBoldText = true
        style = Paint.Style.FILL
    }

    private val secondaryPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#FFE9D2")
        textSize = 38f
        alpha = 180
        isFakeBoldText = true
        style = Paint.Style.FILL
    }

    private val secondaryStrokePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x99000000.toInt()
        textSize = 38f
        isFakeBoldText = true
        style = Paint.Style.STROKE
        strokeWidth = 2.5f
        strokeJoin = Paint.Join.ROUND
    }

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#54848881")
        style = Paint.Style.FILL
    }

    private val bgRect = RectF()
    private val bgCornerRadius = 16f

    // ==================== 配置 ====================

    private var textAlign: Int = Gravity.CENTER
    private var transitionDuration: Long = 160L

    // ==================== Choreographer ====================

    private var framePosted = false

    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            framePosted = false
            if (isAnimating()) {
                invalidate()
                ensureFrameLoop()
            }
        }
    }

    private fun ensureFrameLoop() {
        if (!framePosted) {
            framePosted = true
            Choreographer.getInstance().postFrameCallback(frameCallback)
        }
    }

    private fun stopFrameLoop() {
        if (framePosted) {
            Choreographer.getInstance().removeFrameCallback(frameCallback)
            framePosted = false
        }
    }

    private fun isAnimating(): Boolean {
        if (playbackSnapshot.status != PlaybackStatus.PLAYING) return false
        val line = currentLine ?: return false
        // 有逐字数据或正在过渡时需要动画
        return !line.primaryWords.isNullOrEmpty() || isInTransition()
    }

    private fun isInTransition(): Boolean {
        if (previousLine == null) return false
        val elapsed = SystemClock.elapsedRealtime() - transitionStartMs
        return elapsed < transitionDuration
    }

    // ==================== 公开方法 ====================

    fun setLine(line: LyricLine) {
        if (currentLine?.lineId == line.lineId) return

        previousLine = currentLine
        currentLine = line
        transitionStartMs = SystemClock.elapsedRealtime()

        // 预计算词位置
        computeWordPositions(line)

        if (playbackSnapshot.status == PlaybackStatus.PLAYING) {
            ensureFrameLoop()
        }
        invalidate()
    }

    fun syncPlaybackState(snapshot: PlaybackSnapshot) {
        playbackSnapshot = snapshot
        when (snapshot.status) {
            PlaybackStatus.PLAYING -> ensureFrameLoop()
            PlaybackStatus.PAUSED, PlaybackStatus.STOPPED -> stopFrameLoop()
        }
        invalidate()
    }

    fun setUnsungColor(color: Int) {
        unsungPaint.color = color
        secondaryPaint.color = color
        secondaryPaint.alpha = 180
        invalidate()
    }

    fun setSungColor(color: Int) {
        sungPaint.color = color
        invalidate()
    }

    fun setStrokeColor(color: Int) {
        strokePaint.color = color
        invalidate()
    }

    fun setLyricBackgroundColor(color: Int) {
        bgPaint.color = color
        invalidate()
    }

    fun setTextSize(sizePx: Float) {
        unsungPaint.textSize = sizePx
        sungPaint.textSize = sizePx
        strokePaint.textSize = sizePx
        strokePaint.strokeWidth = (sizePx * 0.06f).coerceIn(2f, 5f)
        secondaryPaint.textSize = sizePx * 0.8f
        secondaryStrokePaint.textSize = sizePx * 0.8f
        secondaryStrokePaint.strokeWidth = (sizePx * 0.8f * 0.06f).coerceIn(1.5f, 4f)
        // 重新计算词位置
        currentLine?.let { computeWordPositions(it) }
        invalidate()
    }

    fun setTextAlign(gravity: Int) {
        textAlign = gravity
        invalidate()
    }

    /**
     * 兼容旧接口：纯文本模式
     */
    fun setText(text: String) {
        val line = LyricLine(
            lineId = "text:${text.hashCode()}:${System.currentTimeMillis()}",
            primaryText = text,
            primaryWords = null,
            secondaryLines = emptyList(),
            lineStartMs = 0L,
            lineDurationMs = null,
        )
        previousLine = currentLine
        currentLine = line
        transitionStartMs = SystemClock.elapsedRealtime()
        computeWordPositions(line)
        stopFrameLoop()
        invalidate()
    }

    // ==================== 绘制 ====================

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        // 绘制圆角背景
        bgRect.set(0f, 0f, w, h)
        canvas.drawRoundRect(bgRect, bgCornerRadius, bgCornerRadius, bgPaint)

        val transAlpha = computeTransitionAlpha()

        // 绘制前一行（淡出）
        if (previousLine != null && transAlpha < 1f) {
            drawLyricLine(canvas, previousLine!!, 1f - transAlpha, false)
        }

        // 绘制当前行
        val line = currentLine ?: return
        drawLyricLine(canvas, line, transAlpha, true)
    }

    private fun drawLyricLine(canvas: Canvas, line: LyricLine, alpha: Float, isCurrent: Boolean) {
        val paddingH = 24f
        val paddingV = 12f
        val availableWidth = width.toFloat() - paddingH * 2

        val intAlpha = (alpha * 255).toInt().coerceIn(0, 255)

        // 计算主文本位置
        val textWidth = unsungPaint.measureText(line.primaryText)
        val textX = computeTextX(paddingH, availableWidth, textWidth)
        val fm = unsungPaint.fontMetrics
        val textHeight = fm.descent - fm.ascent
        val textY = paddingV - fm.ascent

        // 计算已唱进度
        val progressX = if (isCurrent && !line.primaryWords.isNullOrEmpty()) {
            computeProgressX(line, textX)
        } else textX

        // 绘制未唱层：先描边再填充
        strokePaint.alpha = (intAlpha * 0.6f).toInt().coerceIn(0, 255)
        unsungPaint.alpha = intAlpha
        canvas.drawText(line.primaryText, textX, textY, strokePaint)
        canvas.drawText(line.primaryText, textX, textY, unsungPaint)

        // 绘制已唱层（clip 区域内：先描边再填充）
        if (isCurrent && !line.primaryWords.isNullOrEmpty() && progressX > textX) {
            canvas.save()
            canvas.clipRect(textX, 0f, progressX, height.toFloat())
            strokePaint.alpha = (intAlpha * 0.6f).toInt().coerceIn(0, 255)
            sungPaint.alpha = intAlpha
            canvas.drawText(line.primaryText, textX, textY, strokePaint)
            canvas.drawText(line.primaryText, textX, textY, sungPaint)
            canvas.restore()
        }

        // 绘制副行（翻译/罗马音）：描边 + 填充，与主行视觉一致
        if (line.secondaryLines.isNotEmpty()) {
            var secondaryY = textY + textHeight + 8f
            val secAlpha = (intAlpha * 0.7f).toInt().coerceIn(0, 255)
            val secStrokeAlpha = (secAlpha * 0.6f).toInt().coerceIn(0, 255)
            secondaryPaint.alpha = secAlpha
            secondaryStrokePaint.alpha = secStrokeAlpha
            for (secondary in line.secondaryLines) {
                val secWidth = secondaryPaint.measureText(secondary.text)
                val secX = computeTextX(paddingH, availableWidth, secWidth)
                canvas.drawText(secondary.text, secX, secondaryY, secondaryStrokePaint)
                canvas.drawText(secondary.text, secX, secondaryY, secondaryPaint)
                val secFm = secondaryPaint.fontMetrics
                secondaryY += secFm.descent - secFm.ascent + 4f
            }
        }

        // 恢复 alpha
        unsungPaint.alpha = 255
        sungPaint.alpha = 255
        strokePaint.alpha = 255
    }

    private fun computeTextX(paddingH: Float, availableWidth: Float, textWidth: Float): Float {
        return when (textAlign) {
            Gravity.START, Gravity.LEFT, 3 -> paddingH
            Gravity.END, Gravity.RIGHT, 5 -> paddingH + availableWidth - textWidth
            else -> paddingH + (availableWidth - textWidth) / 2f  // CENTER
        }
    }

    private fun computeProgressX(line: LyricLine, textStartX: Float): Float {
        val words = line.primaryWords ?: return textStartX
        val positions = wordPositions ?: return textStartX
        if (words.isEmpty() || positions.isEmpty()) return textStartX

        val now = currentPlaybackPositionMs()

        // 二分查找当前词
        var lo = 0
        var hi = words.size - 1
        var activeIdx = -1

        // 找到最后一个 startTime <= now 的词
        while (lo <= hi) {
            val mid = (lo + hi) / 2
            if (words[mid].startTime <= now) {
                activeIdx = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }

        if (activeIdx < 0) {
            // 还没开始
            return textStartX
        }

        val word = words[activeIdx]
        val wordEnd = word.startTime + word.duration

        if (now >= wordEnd) {
            // 这个词已唱完
            val endX = if (activeIdx < words.size - 1) {
                // 返回下一个词的起始位置
                textStartX + positions[activeIdx * 2 + 1]
            } else {
                // 最后一个词，返回末尾
                textStartX + positions[activeIdx * 2 + 1]
            }
            return endX
        }

        // 词内插值
        val startX = textStartX + positions[activeIdx * 2]
        val endX = textStartX + positions[activeIdx * 2 + 1]
        val progress = ((now - word.startTime).toFloat() / word.duration.toFloat()).coerceIn(0f, 1f)
        return startX + (endX - startX) * progress
    }

    private fun currentPlaybackPositionMs(): Long {
        val snap = playbackSnapshot
        return when (snap.status) {
            PlaybackStatus.PAUSED, PlaybackStatus.STOPPED -> snap.positionMs
            PlaybackStatus.PLAYING -> {
                val elapsed = SystemClock.elapsedRealtime() - snap.updatedAtElapsed
                snap.positionMs + (elapsed * snap.speed).toLong()
            }
        }
    }

    private fun computeTransitionAlpha(): Float {
        if (previousLine == null) return 1f
        val elapsed = SystemClock.elapsedRealtime() - transitionStartMs
        if (elapsed >= transitionDuration) {
            previousLine = null
            return 1f
        }
        return (elapsed.toFloat() / transitionDuration.toFloat()).coerceIn(0f, 1f)
    }

    // ==================== 预计算 ====================

    private fun computeWordPositions(line: LyricLine) {
        val words = line.primaryWords
        if (words.isNullOrEmpty()) {
            wordPositions = null
            return
        }

        val positions = FloatArray(words.size * 2)
        var x = 0f
        for (i in words.indices) {
            val w = unsungPaint.measureText(words[i].text)
            positions[i * 2] = x       // startX
            positions[i * 2 + 1] = x + w  // endX
            x += w
        }
        wordPositions = positions
        primaryTextWidth = x
    }

    // ==================== 测量 ====================

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val paddingV = 12f

        val fm = unsungPaint.fontMetrics
        val primaryHeight = fm.descent - fm.ascent

        var totalHeight = paddingV + primaryHeight + paddingV

        // 副行高度
        val line = currentLine
        if (line != null && line.secondaryLines.isNotEmpty()) {
            val secFm = secondaryPaint.fontMetrics
            val secLineHeight = secFm.descent - secFm.ascent + 4f
            totalHeight += line.secondaryLines.size * secLineHeight + 8f
        }

        setMeasuredDimension(w, totalHeight.toInt())
    }

    // ==================== 生命周期 ====================

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopFrameLoop()
    }
}
