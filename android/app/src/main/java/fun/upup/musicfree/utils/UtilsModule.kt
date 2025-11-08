package `fun`.upup.musicfree.utils; // replace your-apps-package-name with your app's package name
import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.WindowInsets
import android.view.WindowManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.ReadableArray
import kotlin.system.exitProcess
import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec

class UtilsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    private val reactContext: ReactApplicationContext = context;

    override fun getName() = "NativeUtils"

    @ReactMethod
    fun exitApp() {
        val activity = reactContext.currentActivity
        activity?.finishAndRemoveTask()
        android.os.Process.killProcess(android.os.Process.myPid())
        exitProcess(0)
    }

    @ReactMethod
    fun checkStoragePermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            promise.resolve(Environment.isExternalStorageManager())
        } else {
            val readPermission = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
            val writePermission = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
            promise.resolve(readPermission && writePermission)
        }
    }

    @ReactMethod
    fun requestStoragePermission() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                data = Uri.parse("package:${reactContext.packageName}")
            }
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
            }
        }
        reactContext.currentActivity?.startActivity(intent)
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getWindowDimensions(): WritableMap {
        val windowManager = reactApplicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val displayMetrics: DisplayMetrics = reactApplicationContext.resources.displayMetrics
        val density = displayMetrics.density

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11 (API 30) 及以上使用新 API
            val windowMetrics = windowManager.currentWindowMetrics
            val insets = windowMetrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars())
            val bounds = windowMetrics.bounds

            val totalWidthPx = bounds.width()
            val totalHeightPx = bounds.height()

            val leftInsetPx = insets.left
            val rightInsetPx = insets.right
            val topInsetPx = insets.top
            val bottomInsetPx = insets.bottom

            val usableWidthPx = totalWidthPx - leftInsetPx - rightInsetPx
            val usableHeightPx = totalHeightPx - topInsetPx - bottomInsetPx

            val usableWidthDp = usableWidthPx / density
            val usableHeightDp = usableHeightPx / density

            Arguments.createMap().apply {
                putDouble("width", usableWidthDp.toDouble())
                putDouble("height", usableHeightDp.toDouble())
            }
        } else {
            // Android 10 及以下使用旧 API
            val display = windowManager.defaultDisplay
            val realSize = android.graphics.Point()
            display.getRealSize(realSize)

            // 获取状态栏和导航栏高度
            val resources = reactApplicationContext.resources
            var statusBarHeight = 0
            var navigationBarHeight = 0

            // 状态栏高度
            val statusBarResourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
            if (statusBarResourceId > 0) {
                statusBarHeight = resources.getDimensionPixelSize(statusBarResourceId)
            }

            // 导航栏高度
            val navigationBarResourceId = resources.getIdentifier("navigation_bar_height", "dimen", "android")
            if (navigationBarResourceId > 0) {
                navigationBarHeight = resources.getDimensionPixelSize(navigationBarResourceId)
            }

            val usableWidthPx = realSize.x
            val usableHeightPx = realSize.y - statusBarHeight - navigationBarHeight

            val usableWidthDp = usableWidthPx / density
            val usableHeightDp = usableHeightPx / density

            Arguments.createMap().apply {
                putDouble("width", usableWidthDp.toDouble())
                putDouble("height", usableHeightDp.toDouble())
            }
        }
    }

    /**
     * DES decrypt data in ECB mode
     * @param data - Data to decrypt as byte array (ReadableArray of integers 0-255)
     * @param key - DES key string (first 8 bytes used)
     * @param promise - Promise that resolves with decrypted data as ReadableArray
     */
    @ReactMethod
    fun desDecrypt(data: ReadableArray, key: String, promise: Promise) {
        try {
            // Convert ReadableArray to ByteArray
            val dataBytes = ByteArray(data.size()) { i ->
                data.getInt(i).toByte()
            }

            // 验证数据长度必须是8的倍数
            if (dataBytes.size % 8 != 0) {
                promise.reject("DES_DECRYPT_ERROR",
                    "Data length must be multiple of 8, got ${dataBytes.size}", null)
                return
            }

            // Use first 8 bytes of key for DES
            val keyBytes = key.toByteArray(Charsets.UTF_8).copyOf(8)
            val keySpec = SecretKeySpec(keyBytes, "DES")

            // Create DES cipher in ECB mode with no padding
            val cipher = Cipher.getInstance("DES/ECB/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, keySpec)

            // Decrypt data
            val decryptedBytes = cipher.doFinal(dataBytes)

            // 验证输出长度应该等于输入长度
            if (decryptedBytes.size != dataBytes.size) {
                promise.reject("DES_DECRYPT_ERROR",
                    "Output size mismatch: input=${dataBytes.size}, output=${decryptedBytes.size}", null)
                return
            }

            // Convert result to WritableArray
            val result = Arguments.createArray()
            for (byte in decryptedBytes) {
                result.pushInt(byte.toInt() and 0xFF)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DES_DECRYPT_ERROR", "DES decryption failed: ${e.message}", e)
        }
    }

    /**
     * DES encrypt data in ECB mode
     * @param data - Data to encrypt as byte array (ReadableArray of integers 0-255)
     * @param key - DES key string (first 8 bytes used)
     * @param promise - Promise that resolves with encrypted data as ReadableArray
     */
    @ReactMethod
    fun desEncrypt(data: ReadableArray, key: String, promise: Promise) {
        try {
            // Convert ReadableArray to ByteArray
            val dataBytes = ByteArray(data.size()) { i ->
                data.getInt(i).toByte()
            }

            // 验证数据长度必须是8的倍数
            if (dataBytes.size % 8 != 0) {
                promise.reject("DES_ENCRYPT_ERROR",
                    "Data length must be multiple of 8, got ${dataBytes.size}", null)
                return
            }

            // Use first 8 bytes of key for DES
            val keyBytes = key.toByteArray(Charsets.UTF_8).copyOf(8)
            val keySpec = SecretKeySpec(keyBytes, "DES")

            // Create DES cipher in ECB mode with no padding
            val cipher = Cipher.getInstance("DES/ECB/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, keySpec)

            // Encrypt data
            val encryptedBytes = cipher.doFinal(dataBytes)

            // 验证输出长度应该等于输入长度
            if (encryptedBytes.size != dataBytes.size) {
                promise.reject("DES_ENCRYPT_ERROR",
                    "Output size mismatch: input=${dataBytes.size}, output=${encryptedBytes.size}", null)
                return
            }

            // Convert result to WritableArray
            val result = Arguments.createArray()
            for (byte in encryptedBytes) {
                result.pushInt(byte.toInt() and 0xFF)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DES_ENCRYPT_ERROR", "DES encryption failed: ${e.message}", e)
        }
    }

    /**
     * DES encrypt zero buffer to generate XOR key block
     * @param key - DES key string (first 8 bytes used)
     * @param promise - Promise that resolves with encrypted 8-byte block as ReadableArray
     */
    @ReactMethod
    fun desEncryptZeroBlock(key: String, promise: Promise) {
        try {
            // Create 8-byte zero buffer
            val zeroBuffer = ByteArray(8) { 0 }

            // Use first 8 bytes of key for DES
            val keyBytes = key.toByteArray(Charsets.UTF_8).copyOf(8)
            val keySpec = SecretKeySpec(keyBytes, "DES")

            // Create DES cipher in ECB mode with no padding
            val cipher = Cipher.getInstance("DES/ECB/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, keySpec)

            // Encrypt zero buffer
            val encryptedBytes = cipher.doFinal(zeroBuffer)

            // Convert result to WritableArray
            val result = Arguments.createArray()
            for (byte in encryptedBytes) {
                result.pushInt(byte.toInt() and 0xFF)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DES_ENCRYPT_ERROR", "DES encryption failed: ${e.message}", e)
        }
    }
}
