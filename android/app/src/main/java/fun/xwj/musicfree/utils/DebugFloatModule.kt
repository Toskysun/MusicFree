package `fun`.xwj.musicfree.utils

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.abs

/**
 * Debug FAB as a single child of the Activity [decorView].
 *
 * Critical for Xiaomi / Android 16 stability:
 * - Do NOT use PopupWindow / Dialog / WindowManager secondary windows.
 *   Those create extra HWUI surfaces; dismiss/update races abort RenderThread
 *   with EGL_BAD_ACCESS ("Failed to set damage region on surface").
 * - Attach once; move with layout params only; never remove+re-add for z-order.
 * - WRAP_CONTENT so only the button receives touches.
 */
class DebugFloatModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var floatView: TextView? = null
    private var host: ViewGroup? = null
    private var attachedActivityHash: Int = 0

    private var posX = -1
    private var posY = -1
    private var btnW = 0
    private var btnH = 0

    private val prefs by lazy {
        reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    override fun getName() = "DebugFloat"

    @ReactMethod
    fun show() {
        UiThreadUtil.runOnUiThread {
            try {
                val activity = reactContext.currentActivity ?: return@runOnUiThread
                if (activity.isFinishing) return@runOnUiThread
                ensure(activity)
                val view = floatView ?: return@runOnUiThread
                val parent = host ?: return@runOnUiThread
                if (view.parent == null) {
                    parent.addView(view)
                }
                applyPosition()
                // Reorder only — no removeView (surface-safe).
                view.bringToFront()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    view.elevation = 100_000f
                    view.translationZ = 100_000f
                }
            } catch (_: Exception) {
            }
        }
    }

    @ReactMethod
    fun bringToFront() {
        UiThreadUtil.runOnUiThread {
            try {
                val view = floatView ?: return@runOnUiThread
                if (view.parent == null) {
                    show()
                    return@runOnUiThread
                }
                view.bringToFront()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    view.elevation = 100_000f
                    view.translationZ = 100_000f
                }
            } catch (_: Exception) {
            }
        }
    }

    @ReactMethod
    fun hide() {
        UiThreadUtil.runOnUiThread {
            try {
                persistPosition()
                val view = floatView
                val parent = view?.parent as? ViewGroup
                if (view != null && parent != null) {
                    parent.removeView(view)
                }
            } catch (_: Exception) {
            }
        }
    }

    @ReactMethod
    fun getPosition(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                loadPositionIfNeeded()
                promise.resolve(
                    Arguments.createMap().apply {
                        putDouble("x", posX.toDouble())
                        putDouble("y", posY.toDouble())
                    },
                )
            } catch (e: Exception) {
                promise.reject("E_POS", e)
            }
        }
    }

    @ReactMethod
    fun setPosition(x: Double, y: Double) {
        UiThreadUtil.runOnUiThread {
            val metrics = reactContext.resources.displayMetrics
            val maxX = (metrics.widthPixels - btnW.coerceAtLeast(1)).coerceAtLeast(0)
            val maxY = (metrics.heightPixels - btnH.coerceAtLeast(1)).coerceAtLeast(0)
            posX = x.toInt().coerceIn(0, maxX)
            posY = y.toInt().coerceIn(0, maxY)
            persistPosition()
            applyPosition()
        }
    }

    @ReactMethod
    fun addListener(eventName: String?) {
    }

    @ReactMethod
    fun removeListeners(count: Int) {
    }

    private fun ensure(activity: Activity) {
        val decor = activity.window?.decorView as? ViewGroup ?: return
        val activityHash = System.identityHashCode(activity)

        if (floatView != null && attachedActivityHash == activityHash && floatView?.context === activity) {
            host = decor
            return
        }

        // Activity recreated — drop old view reference (do not touch old window).
        try {
            (floatView?.parent as? ViewGroup)?.removeView(floatView)
        } catch (_: Exception) {
        }
        floatView = null
        host = decor
        attachedActivityHash = activityHash

        val density = activity.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()
        val metrics = activity.resources.displayMetrics

        loadPositionIfNeeded()
        if (posX < 0 || posY < 0) {
            posX = metrics.widthPixels - dp(72)
            posY = metrics.heightPixels / 2
            persistPosition()
        }

        val tv = TextView(activity).apply {
            text = "调试"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(8), dp(12), dp(8))
            minWidth = dp(56)
            minHeight = dp(36)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#04BE02"))
                cornerRadius = dp(4).toFloat()
            }
            isClickable = true
            isFocusable = false
            // Software layer avoids HWUI secondary-surface damage paths on some OEMs.
            setLayerType(View.LAYER_TYPE_SOFTWARE, null)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                elevation = 100_000f
                translationZ = 100_000f
            }
        }

        tv.measure(
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        btnW = tv.measuredWidth.coerceAtLeast(dp(56))
        btnH = tv.measuredHeight.coerceAtLeast(dp(36))

        tv.layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.START,
        ).apply {
            leftMargin = posX.coerceAtLeast(0)
            topMargin = posY.coerceAtLeast(0)
        }

        var downRawX = 0f
        var downRawY = 0f
        var originX = 0
        var originY = 0
        var moved = false
        val touchSlop = dp(4)

        tv.setOnTouchListener { v, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downRawX = event.rawX
                    downRawY = event.rawY
                    originX = posX
                    originY = posY
                    moved = false
                    (v.parent as? ViewGroup)?.requestDisallowInterceptTouchEvent(true)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - downRawX).toInt()
                    val dy = (event.rawY - downRawY).toInt()
                    if (abs(dx) > touchSlop || abs(dy) > touchSlop) {
                        moved = true
                    }
                    val maxX = (metrics.widthPixels - btnW).coerceAtLeast(0)
                    val maxY = (metrics.heightPixels - btnH).coerceAtLeast(0)
                    posX = (originX + dx).coerceIn(0, maxX)
                    posY = (originY + dy).coerceIn(0, maxY)
                    moveView(v, posX, posY)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    (v.parent as? ViewGroup)?.requestDisallowInterceptTouchEvent(false)
                    if (moved) {
                        persistPosition()
                        moveView(v, posX, posY)
                    } else if (event.actionMasked == MotionEvent.ACTION_UP) {
                        emitPress()
                    }
                    true
                }
                else -> false
            }
        }

        floatView = tv
    }

    private fun moveView(view: View, x: Int, y: Int) {
        val lp = view.layoutParams as? FrameLayout.LayoutParams ?: return
        lp.gravity = Gravity.TOP or Gravity.START
        lp.leftMargin = x
        lp.topMargin = y
        val parent = view.parent as? ViewGroup
        if (parent != null) {
            try {
                parent.updateViewLayout(view, lp)
            } catch (_: Exception) {
                view.layoutParams = lp
                view.requestLayout()
            }
        } else {
            view.layoutParams = lp
        }
    }

    private fun applyPosition() {
        loadPositionIfNeeded()
        val view = floatView ?: return
        if (posX < 0 || posY < 0) return
        moveView(view, posX, posY)
    }

    private fun loadPositionIfNeeded() {
        if (posX >= 0 && posY >= 0) return
        posX = prefs.getInt(KEY_X, -1)
        posY = prefs.getInt(KEY_Y, -1)
    }

    private fun persistPosition() {
        if (posX < 0 || posY < 0) return
        prefs.edit().putInt(KEY_X, posX).putInt(KEY_Y, posY).apply()
    }

    private fun emitPress() {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("DebugFloatPress", null)
    }

    override fun invalidate() {
        UiThreadUtil.runOnUiThread {
            try {
                persistPosition()
                val view = floatView
                val parent = view?.parent as? ViewGroup
                if (view != null && parent != null) {
                    parent.removeView(view)
                }
            } catch (_: Exception) {
            }
            floatView = null
            host = null
            attachedActivityHash = 0
        }
        super.invalidate()
    }

    companion object {
        private const val PREFS = "debug_float"
        private const val KEY_X = "x"
        private const val KEY_Y = "y"
    }
}
