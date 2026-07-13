package `fun`.xwj.musicfree.utils

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.util.TypedValue
// Build is used for elevation API checks
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.PopupWindow
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
 * Global floating debug FAB via [PopupWindow].
 *
 * Why PopupWindow (not RN absolute, not Dialog WindowManager remove/add):
 * - Separate from Yoga/flex → never shoves the music bar
 * - WRAP_CONTENT + not focusable → only the button steals touches
 * - [PopupWindow.update] moves it without tearing down surfaces
 *   (avoids EGL_BAD_ACCESS from Dialog removeView/addView)
 * - Drawn above the activity content (native-stack, absolute sheets)
 */
class DebugFloatModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var popup: PopupWindow? = null
    private var label: TextView? = null
    private var anchor: View? = null

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
                val p = popup ?: return@runOnUiThread
                val a = anchor ?: return@runOnUiThread
                if (!p.isShowing) {
                    // Post so decor is laid out (token ready).
                    a.post {
                        try {
                            if (!p.isShowing && !activity.isFinishing) {
                                p.showAtLocation(
                                    a,
                                    Gravity.TOP or Gravity.START,
                                    posX.coerceAtLeast(0),
                                    posY.coerceAtLeast(0),
                                )
                            }
                        } catch (_: Exception) {
                        }
                    }
                } else {
                    p.update(posX.coerceAtLeast(0), posY.coerceAtLeast(0), -1, -1)
                }
            } catch (_: Exception) {
            }
        }
    }

    @ReactMethod
    fun bringToFront() {
        // PopupWindow is already above content; re-show if dismissed.
        show()
    }

    @ReactMethod
    fun hide() {
        UiThreadUtil.runOnUiThread {
            try {
                persistPosition()
                popup?.dismiss()
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
            posX = x.toInt().coerceIn(0, metrics.widthPixels)
            posY = y.toInt().coerceIn(0, metrics.heightPixels)
            persistPosition()
            try {
                popup?.takeIf { it.isShowing }?.update(posX, posY, -1, -1)
            } catch (_: Exception) {
            }
        }
    }

    @ReactMethod
    fun addListener(eventName: String?) {
    }

    @ReactMethod
    fun removeListeners(count: Int) {
    }

    private fun ensure(activity: Activity) {
        if (popup != null && label?.context === activity) {
            return
        }
        try {
            popup?.dismiss()
        } catch (_: Exception) {
        }
        popup = null
        label = null

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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                elevation = 24f
            }
        }

        // Measure once for clamp bounds
        tv.measure(
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        btnW = tv.measuredWidth.coerceAtLeast(dp(56))
        btnH = tv.measuredHeight.coerceAtLeast(dp(36))

        var downRawX = 0f
        var downRawY = 0f
        var originX = 0
        var originY = 0
        var moved = false
        val touchSlop = dp(4)

        tv.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downRawX = event.rawX
                    downRawY = event.rawY
                    originX = posX
                    originY = posY
                    moved = false
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
                    try {
                        popup?.update(posX, posY, -1, -1)
                    } catch (_: Exception) {
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (moved) {
                        persistPosition()
                        try {
                            popup?.update(posX, posY, -1, -1)
                        } catch (_: Exception) {
                        }
                    } else if (event.actionMasked == MotionEvent.ACTION_UP) {
                        emitPress()
                    }
                    true
                }
                else -> false
            }
        }

        val pw = PopupWindow(
            tv,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            false, // not focusable → won't steal keys / soft input
        ).apply {
            isOutsideTouchable = false
            isTouchable = true
            isClippingEnabled = false
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                elevation = 100_000f
            }
            // Soft input shouldn't resize the app when this is up
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
            animationStyle = 0
        }

        label = tv
        popup = pw
        anchor = activity.window?.decorView
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
                popup?.dismiss()
            } catch (_: Exception) {
            }
            popup = null
            label = null
            anchor = null
        }
        super.invalidate()
    }

    companion object {
        private const val PREFS = "debug_float"
        private const val KEY_X = "x"
        private const val KEY_Y = "y"
    }
}
