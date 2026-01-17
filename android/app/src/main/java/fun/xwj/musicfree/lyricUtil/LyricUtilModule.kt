package `fun`.xwj.musicfree.lyricUtil

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.*
import java.util.*
import java.util.zip.Inflater
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets

class LyricUtilModule(private val reactContext: ReactApplicationContext): ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "LyricUtil"
    private var lyricView: LyricView? = null

    @ReactMethod
    fun checkSystemAlertPermission(promise: Promise) {
        try {
            promise.resolve(Settings.canDrawOverlays(reactContext))
        } catch (e: Exception) {
            promise.reject("Error", e.message)
        }
    }

    @ReactMethod
    fun requestSystemAlertPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                data = Uri.parse("package:" + reactContext.packageName)
            }
            currentActivity?.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Error", e.message)
        }
    }

    @ReactMethod
    fun showStatusBarLyric(initLyric: String?, options: ReadableMap?, promise: Promise) {
        try {
            UiThreadUtil.runOnUiThread {
                if (lyricView == null) {
                    lyricView = LyricView(reactContext)
                }

                val mapOptions = mutableMapOf<String, Any>().apply {
                    if (options == null) {
                        return@apply
                    }
                    if (options.hasKey("topPercent")) {
                        put("topPercent", options.getDouble("topPercent"))
                    }
                    if (options.hasKey("leftPercent")) {
                        put("leftPercent", options.getDouble("leftPercent"))
                    }
                    if (options.hasKey("align")) {
                        put("align", options.getInt("align"))
                    }
                    if (options.hasKey("color")) {
                        options.getString("color")?.let { put("color", it) }
                    }
                    if (options.hasKey("backgroundColor")) {
                        options.getString("backgroundColor")?.let { put("backgroundColor", it) }
                    }
                    if (options.hasKey("widthPercent")) {
                        put("widthPercent", options.getDouble("widthPercent"))
                    }
                    if (options.hasKey("fontSize")) {
                        put("fontSize", options.getDouble("fontSize"))
                    }
                }

                try {
                    lyricView?.showLyricWindow(initLyric, mapOptions)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject("Exception", e.message)
                }
            }
        } catch (e: Exception) {
            promise.reject("Exception", e.message)
        }
    }

    @ReactMethod
    fun hideStatusBarLyric(promise: Promise) {
        try {
            UiThreadUtil.runOnUiThread {
                lyricView?.hideLyricWindow()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Exception", e.message)
        }
    }

    @ReactMethod
    fun setStatusBarLyricText(lyric: String, promise: Promise) {
        try {
            UiThreadUtil.runOnUiThread {
                lyricView?.setText(lyric)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Exception", e.message)
        }
    }

    @ReactMethod
    fun setStatusBarLyricAlign(alignment: Int, promise: Promise) {
        try {
            UiThreadUtil.runOnUiThread {
                lyricView?.setAlign(alignment)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Exception", e.message)
        }
    }

    @ReactMethod
    fun setStatusBarLyricTop(pct: Double, promise: Promise) {
        try {
            UiThreadUtil.runOnUiThread {
                lyricView?.setTopPercent(pct)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Exception", e.message)
        }
    }

    @ReactMethod
    fun setStatusBarLyricLeft(pct: Double, promise: Promise) {
        try {
            UiThreadUtil.runOnUiThread {
                lyricView?.setLeftPercent(pct)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Exception", e.message)
        }
    }

    @ReactMethod
    fun setStatusBarLyricWidth(pct: Double, promise: Promise) {
        try {
            UiThreadUtil.runOnUiThread {
                lyricView?.setWidth(pct)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Exception", e.message)
        }
    }

    @ReactMethod
    fun setStatusBarLyricFontSize(fontSize: Float, promise: Promise) {
        try {
            UiThreadUtil.runOnUiThread {
                lyricView?.setFontSize(fontSize)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Exception", e.message)
        }
    }

    @ReactMethod
    fun setStatusBarColors(textColor: String?, backgroundColor: String?, promise: Promise) {
        try {
            UiThreadUtil.runOnUiThread {
                lyricView?.setColors(textColor, backgroundColor)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Exception", e.message)
        }
    }

    // ==================== Kuwo Lyric Decryption ====================

    /**
     * Decrypt Kuwo lyric from base64-encoded encrypted data
     * Process: Base64 Decode -> XOR Decrypt (optional) -> Zlib Inflate -> GB18030 Decode
     */
    @ReactMethod
    fun decryptKuwoLyric(lrcBase64: String, isGetLyricx: Boolean, promise: Promise) {
        try {
            Log.d("LyricUtil", "Starting Kuwo lyric decryption, base64 length: ${lrcBase64.length}, isGetLyricx: $isGetLyricx")

            // Step 1: Base64 decode
            val lrcBuffer = android.util.Base64.decode(lrcBase64, android.util.Base64.DEFAULT)
            Log.d("LyricUtil", "Base64 decoded, buffer size: ${lrcBuffer.size}")

            // Step 2: Check if it starts with "tp=content"
            val headerCheck = String(lrcBuffer, 0, minOf(10, lrcBuffer.size), StandardCharsets.UTF_8)
            if (headerCheck != "tp=content") {
                Log.e("LyricUtil", "Invalid Kuwo lyric header: $headerCheck")
                promise.resolve("")
                return
            }

            // Step 3: Find header end marker (\r\n\r\n) and extract data
            val headerEndIndex = findHeaderEnd(lrcBuffer)
            if (headerEndIndex == -1) {
                Log.e("LyricUtil", "Header end marker not found")
                promise.reject("KW_INVALID_FORMAT", "Header end marker not found")
                return
            }

            val lrcData = lrcBuffer.copyOfRange(headerEndIndex + 4, lrcBuffer.size)
            Log.d("LyricUtil", "Header stripped, data size: ${lrcData.size}")

            // Step 4: Zlib inflate
            val inflatedData = zlibInflate(lrcData)
            Log.d("LyricUtil", "Zlib inflated, size: ${inflatedData.size}")

            // Step 5: Process based on isGetLyricx flag
            val result = if (!isGetLyricx) {
                // Directly decode as GB18030
                decodeGB18030(inflatedData)
            } else {
                // XOR decrypt then decode as GB18030
                val xorDecrypted = xorDecrypt(inflatedData)
                decodeGB18030(xorDecrypted)
            }

            Log.d("LyricUtil", "Kuwo lyric decryption successful, result length: ${result.length}")
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e("LyricUtil", "Kuwo lyric decryption error: ${e.message}", e)
            promise.reject("KW_DECRYPT_ERROR", "Failed to decrypt Kuwo lyric: ${e.message}", e)
        }
    }

    /**
     * Find header end marker (\r\n\r\n) in byte array
     */
    private fun findHeaderEnd(buffer: ByteArray): Int {
        for (i in 0 until buffer.size - 3) {
            if (buffer[i] == '\r'.code.toByte() &&
                buffer[i + 1] == '\n'.code.toByte() &&
                buffer[i + 2] == '\r'.code.toByte() &&
                buffer[i + 3] == '\n'.code.toByte()) {
                return i
            }
        }
        return -1
    }

    /**
     * XOR decrypt with "yeelion" key
     */
    private fun xorDecrypt(data: ByteArray): ByteArray {
        val key = "yeelion".toByteArray(StandardCharsets.UTF_8)
        val keyLen = key.size

        // First decode from base64 (data is base64 string bytes)
        val base64Str = String(data, StandardCharsets.UTF_8)
        val buf = android.util.Base64.decode(base64Str, android.util.Base64.DEFAULT)
        val bufLen = buf.size

        val output = ByteArray(bufLen)
        var i = 0
        while (i < bufLen) {
            var j = 0
            while (j < keyLen && i < bufLen) {
                output[i] = (buf[i].toInt() xor key[j].toInt()).toByte()
                i++
                j++
            }
        }

        return output
    }

    /**
     * Decode byte array as GB18030 (Chinese encoding)
     */
    private fun decodeGB18030(data: ByteArray): String {
        return try {
            // Try to use GB18030 charset
            val charset = java.nio.charset.Charset.forName("GB18030")
            String(data, charset)
        } catch (e: Exception) {
            Log.w("LyricUtil", "GB18030 decoding failed, fallback to GBK: ${e.message}")
            try {
                // Fallback to GBK
                val charset = java.nio.charset.Charset.forName("GBK")
                String(data, charset)
            } catch (e2: Exception) {
                Log.w("LyricUtil", "GBK decoding failed, fallback to UTF-8: ${e2.message}")
                // Final fallback to UTF-8
                String(data, StandardCharsets.UTF_8)
            }
        }
    }

    // ==================== QRC Lyric Decryption ====================

    /**
     * Decrypt QRC lyric from hex-encoded encrypted data
     * Process: Hex Decode -> Triple-DES Decrypt -> Zlib Decompress -> UTF-8 Decode
     */
    @ReactMethod
    fun decryptQRCLyric(encryptedHex: String, promise: Promise) {
        try {
            Log.d("LyricUtil", "Starting QRC decryption, hex length: ${encryptedHex.length}")

            // Step 1: Hex string to ByteArray
            val encrypted = hexToByteArray(encryptedHex)
            Log.d("LyricUtil", "Hex decoded, byte array length: ${encrypted.size}")

            // Step 2: Triple-DES decrypt (custom QQ Music algorithm)
            val decrypted = tripleDesDecrypt(encrypted)
            Log.d("LyricUtil", "Triple-DES decrypted, length: ${decrypted.size}")

            // Step 3: Zlib decompress
            val decompressed = zlibInflate(decrypted)
            Log.d("LyricUtil", "Zlib decompressed, length: ${decompressed.size}")

            // Step 4: UTF-8 decode
            val result = String(decompressed, StandardCharsets.UTF_8)
            Log.d("LyricUtil", "QRC decryption successful, result length: ${result.length}")

            promise.resolve(result)
        } catch (e: IllegalArgumentException) {
            Log.e("LyricUtil", "Invalid hex format: ${e.message}", e)
            promise.reject("QRC_INVALID_HEX", "Invalid hex string format: ${e.message}", e)
        } catch (e: Exception) {
            Log.e("LyricUtil", "QRC decryption error: ${e.message}", e)
            promise.reject("QRC_DECRYPT_ERROR", "Failed to decrypt QRC lyric: ${e.message}", e)
        }
    }

    // ==================== Helper Functions ====================

    /**
     * Convert hex string to byte array
     */
    private fun hexToByteArray(hex: String): ByteArray {
        require(hex.length % 2 == 0) { "Hex string must have even length" }
        return hex.chunked(2)
            .map { it.toInt(16).toByte() }
            .toByteArray()
    }

    /**
     * Zlib decompress (inflate)
     */
    private fun zlibInflate(data: ByteArray): ByteArray {
        val inflater = Inflater()
        try {
            inflater.setInput(data)

            val outputStream = ByteArrayOutputStream(data.size)
            val buffer = ByteArray(8192)

            while (!inflater.finished()) {
                val count = inflater.inflate(buffer)
                if (count > 0) {
                    outputStream.write(buffer, 0, count)
                }
            }

            return outputStream.toByteArray()
        } catch (e: Exception) {
            throw Exception("Zlib inflate failed: ${e.message}", e)
        } finally {
            inflater.end()
        }
    }

    // ==================== Custom DES Implementation ====================
    // NOTE: This is NOT standard DES! It's QQ Music's custom variant.
    // Must match the JavaScript implementation in customDES.ts exactly.

    // Custom S-Box tables (from QQ Music client)
    private val S_BOX1 = byteArrayOf(
        14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
        0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
        4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
        15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13
    )

    private val S_BOX2 = byteArrayOf(
        15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
        3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5,
        0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
        13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9
    )

    private val S_BOX3 = byteArrayOf(
        10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
        13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
        13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
        1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12
    )

    private val S_BOX4 = byteArrayOf(
        7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
        13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
        10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
        3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14
    )

    private val S_BOX5 = byteArrayOf(
        2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
        14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
        4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
        11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3
    )

    private val S_BOX6 = byteArrayOf(
        12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
        10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
        9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
        4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13
    )

    private val S_BOX7 = byteArrayOf(
        4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
        13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
        1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
        6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12
    )

    private val S_BOX8 = byteArrayOf(
        13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
        1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
        7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
        2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11
    )

    // Three DES keys from QQ Music client
    private val KEY1 = "!@#)(NHLiuy*$%^&".toByteArray(StandardCharsets.UTF_8)
    private val KEY2 = "123ZXC!@#)(*$%^&".toByteArray(StandardCharsets.UTF_8)
    private val KEY3 = "!@#)(*$%^&abcDEF".toByteArray(StandardCharsets.UTF_8)

    enum class DESMode {
        DES_ENCRYPT,
        DES_DECRYPT
    }

    /**
     * Triple-DES decryption: DES_DECRYPT(KEY1) -> DES_ENCRYPT(KEY2) -> DES_DECRYPT(KEY3)
     */
    private fun tripleDesDecrypt(content: ByteArray): ByteArray {
        val length = content.size

        // Step 1: DES Decrypt with KEY1
        var result = funcDdes(content, KEY1, length)

        // Step 2: DES Encrypt with KEY2
        result = funcDes(result, KEY2, length)

        // Step 3: DES Decrypt with KEY3
        result = funcDdes(result, KEY3, length)

        return result
    }

    /**
     * DES encryption function
     */
    private fun funcDes(buff: ByteArray, key: ByteArray, length: Int): ByteArray {
        val schedule = Array(16) { ByteArray(6) }
        desKeySetup(key, schedule, DESMode.DES_ENCRYPT)

        val output = ByteArray(length)
        var i = 0
        while (i < length) {
            val block = buff.copyOfRange(i, minOf(i + 8, length))
            val encrypted = desCrypt(block, schedule)
            System.arraycopy(encrypted, 0, output, i, encrypted.size)
            i += 8
        }

        return output
    }

    /**
     * DES decryption function
     */
    private fun funcDdes(buff: ByteArray, key: ByteArray, length: Int): ByteArray {
        val schedule = Array(16) { ByteArray(6) }
        desKeySetup(key, schedule, DESMode.DES_DECRYPT)

        val output = ByteArray(length)
        var i = 0
        while (i < length) {
            val block = buff.copyOfRange(i, minOf(i + 8, length))
            val decrypted = desCrypt(block, schedule)
            System.arraycopy(decrypted, 0, output, i, decrypted.size)
            i += 8
        }

        return output
    }

    /**
     * Extract bit from byte array
     */
    private fun bitNum(a: ByteArray, b: Int, c: Int): Int {
        val byteIndex = (b / 32) * 4 + 3 - ((b % 32) / 8)
        val bitPosition = 7 - (b % 8)
        val extractedBit = (a[byteIndex].toInt() shr bitPosition) and 0x01
        return extractedBit shl c
    }

    /**
     * Extract bit from integer (right shift)
     */
    private fun bitNumIntR(a: Int, b: Int, c: Int): Int {
        val extractedBit = (a ushr (31 - b)) and 0x00000001
        return extractedBit shl c
    }

    /**
     * Extract bit from integer (left shift)
     */
    private fun bitNumIntL(a: Int, b: Int, c: Int): Int {
        val extractedBit = ((a shl b) and 0x80000000.toInt())
        return extractedBit ushr c
    }

    /**
     * S-Box bit transformation
     */
    private fun sBoxBit(a: Int): Int {
        val part1 = a and 0x20
        val part2 = (a and 0x1f) shr 1
        val part3 = (a and 0x01) shl 4
        return part1 or part2 or part3
    }

    /**
     * Initial Permutation (IP)
     */
    private fun ip(state: IntArray, inBytes: ByteArray): IntArray {
        state[0] = (
            bitNum(inBytes, 57, 31) or bitNum(inBytes, 49, 30) or bitNum(inBytes, 41, 29) or
            bitNum(inBytes, 33, 28) or bitNum(inBytes, 25, 27) or bitNum(inBytes, 17, 26) or
            bitNum(inBytes, 9, 25) or bitNum(inBytes, 1, 24) or bitNum(inBytes, 59, 23) or
            bitNum(inBytes, 51, 22) or bitNum(inBytes, 43, 21) or bitNum(inBytes, 35, 20) or
            bitNum(inBytes, 27, 19) or bitNum(inBytes, 19, 18) or bitNum(inBytes, 11, 17) or
            bitNum(inBytes, 3, 16) or bitNum(inBytes, 61, 15) or bitNum(inBytes, 53, 14) or
            bitNum(inBytes, 45, 13) or bitNum(inBytes, 37, 12) or bitNum(inBytes, 29, 11) or
            bitNum(inBytes, 21, 10) or bitNum(inBytes, 13, 9) or bitNum(inBytes, 5, 8) or
            bitNum(inBytes, 63, 7) or bitNum(inBytes, 55, 6) or bitNum(inBytes, 47, 5) or
            bitNum(inBytes, 39, 4) or bitNum(inBytes, 31, 3) or bitNum(inBytes, 23, 2) or
            bitNum(inBytes, 15, 1) or bitNum(inBytes, 7, 0)
        )

        state[1] = (
            bitNum(inBytes, 56, 31) or bitNum(inBytes, 48, 30) or bitNum(inBytes, 40, 29) or
            bitNum(inBytes, 32, 28) or bitNum(inBytes, 24, 27) or bitNum(inBytes, 16, 26) or
            bitNum(inBytes, 8, 25) or bitNum(inBytes, 0, 24) or bitNum(inBytes, 58, 23) or
            bitNum(inBytes, 50, 22) or bitNum(inBytes, 42, 21) or bitNum(inBytes, 34, 20) or
            bitNum(inBytes, 26, 19) or bitNum(inBytes, 18, 18) or bitNum(inBytes, 10, 17) or
            bitNum(inBytes, 2, 16) or bitNum(inBytes, 60, 15) or bitNum(inBytes, 52, 14) or
            bitNum(inBytes, 44, 13) or bitNum(inBytes, 36, 12) or bitNum(inBytes, 28, 11) or
            bitNum(inBytes, 20, 10) or bitNum(inBytes, 12, 9) or bitNum(inBytes, 4, 8) or
            bitNum(inBytes, 62, 7) or bitNum(inBytes, 54, 6) or bitNum(inBytes, 46, 5) or
            bitNum(inBytes, 38, 4) or bitNum(inBytes, 30, 3) or bitNum(inBytes, 22, 2) or
            bitNum(inBytes, 14, 1) or bitNum(inBytes, 6, 0)
        )

        return state
    }

    /**
     * Inverse Initial Permutation (IP^-1)
     */
    private fun invIp(state: IntArray, inBytes: ByteArray): ByteArray {
        inBytes[3] = (
            bitNumIntR(state[1], 7, 7) or bitNumIntR(state[0], 7, 6) or
            bitNumIntR(state[1], 15, 5) or bitNumIntR(state[0], 15, 4) or
            bitNumIntR(state[1], 23, 3) or bitNumIntR(state[0], 23, 2) or
            bitNumIntR(state[1], 31, 1) or bitNumIntR(state[0], 31, 0)
        ).toByte()

        inBytes[2] = (
            bitNumIntR(state[1], 6, 7) or bitNumIntR(state[0], 6, 6) or
            bitNumIntR(state[1], 14, 5) or bitNumIntR(state[0], 14, 4) or
            bitNumIntR(state[1], 22, 3) or bitNumIntR(state[0], 22, 2) or
            bitNumIntR(state[1], 30, 1) or bitNumIntR(state[0], 30, 0)
        ).toByte()

        inBytes[1] = (
            bitNumIntR(state[1], 5, 7) or bitNumIntR(state[0], 5, 6) or
            bitNumIntR(state[1], 13, 5) or bitNumIntR(state[0], 13, 4) or
            bitNumIntR(state[1], 21, 3) or bitNumIntR(state[0], 21, 2) or
            bitNumIntR(state[1], 29, 1) or bitNumIntR(state[0], 29, 0)
        ).toByte()

        inBytes[0] = (
            bitNumIntR(state[1], 4, 7) or bitNumIntR(state[0], 4, 6) or
            bitNumIntR(state[1], 12, 5) or bitNumIntR(state[0], 12, 4) or
            bitNumIntR(state[1], 20, 3) or bitNumIntR(state[0], 20, 2) or
            bitNumIntR(state[1], 28, 1) or bitNumIntR(state[0], 28, 0)
        ).toByte()

        inBytes[7] = (
            bitNumIntR(state[1], 3, 7) or bitNumIntR(state[0], 3, 6) or
            bitNumIntR(state[1], 11, 5) or bitNumIntR(state[0], 11, 4) or
            bitNumIntR(state[1], 19, 3) or bitNumIntR(state[0], 19, 2) or
            bitNumIntR(state[1], 27, 1) or bitNumIntR(state[0], 27, 0)
        ).toByte()

        inBytes[6] = (
            bitNumIntR(state[1], 2, 7) or bitNumIntR(state[0], 2, 6) or
            bitNumIntR(state[1], 10, 5) or bitNumIntR(state[0], 10, 4) or
            bitNumIntR(state[1], 18, 3) or bitNumIntR(state[0], 18, 2) or
            bitNumIntR(state[1], 26, 1) or bitNumIntR(state[0], 26, 0)
        ).toByte()

        inBytes[5] = (
            bitNumIntR(state[1], 1, 7) or bitNumIntR(state[0], 1, 6) or
            bitNumIntR(state[1], 9, 5) or bitNumIntR(state[0], 9, 4) or
            bitNumIntR(state[1], 17, 3) or bitNumIntR(state[0], 17, 2) or
            bitNumIntR(state[1], 25, 1) or bitNumIntR(state[0], 25, 0)
        ).toByte()

        inBytes[4] = (
            bitNumIntR(state[1], 0, 7) or bitNumIntR(state[0], 0, 6) or
            bitNumIntR(state[1], 8, 5) or bitNumIntR(state[0], 8, 4) or
            bitNumIntR(state[1], 16, 3) or bitNumIntR(state[0], 16, 2) or
            bitNumIntR(state[1], 24, 1) or bitNumIntR(state[0], 24, 0)
        ).toByte()

        return inBytes
    }

    /**
     * F function (Feistel function)
     * Includes: Expansion -> Key XOR -> S-Box -> P-Box
     */
    private fun f(state: Int, key: ByteArray): Int {
        val lrgstate = ByteArray(6)
        var s = state

        // Expansion Permutation (E)
        val t1 = (
            bitNumIntL(s, 31, 0) or ((s and 0xf0000000.toInt()) ushr 1) or bitNumIntL(s, 4, 5) or
            bitNumIntL(s, 3, 6) or ((s and 0x0f000000) ushr 3) or bitNumIntL(s, 8, 11) or
            bitNumIntL(s, 7, 12) or ((s and 0x00f00000) ushr 5) or bitNumIntL(s, 12, 17) or
            bitNumIntL(s, 11, 18) or ((s and 0x000f0000) ushr 7) or bitNumIntL(s, 16, 23)
        )

        val t2 = (
            bitNumIntL(s, 15, 0) or ((s and 0x0000f000) shl 15) or bitNumIntL(s, 20, 5) or
            bitNumIntL(s, 19, 6) or ((s and 0x00000f00) shl 13) or bitNumIntL(s, 24, 11) or
            bitNumIntL(s, 23, 12) or ((s and 0x000000f0) shl 11) or bitNumIntL(s, 28, 17) or
            bitNumIntL(s, 27, 18) or ((s and 0x0000000f) shl 9) or bitNumIntL(s, 0, 23)
        )

        lrgstate[0] = ((t1 ushr 24) and 0x000000ff).toByte()
        lrgstate[1] = ((t1 ushr 16) and 0x000000ff).toByte()
        lrgstate[2] = ((t1 ushr 8) and 0x000000ff).toByte()
        lrgstate[3] = ((t2 ushr 24) and 0x000000ff).toByte()
        lrgstate[4] = ((t2 ushr 16) and 0x000000ff).toByte()
        lrgstate[5] = ((t2 ushr 8) and 0x000000ff).toByte()

        // Key XOR
        for (i in 0 until 6) {
            lrgstate[i] = (lrgstate[i].toInt() xor key[i].toInt()).toByte()
        }

        // S-Box Permutation
        s = (
            (S_BOX1[sBoxBit(lrgstate[0].toInt() and 0xff shr 2)].toInt() shl 28) or
            (S_BOX2[sBoxBit(((lrgstate[0].toInt() and 0x03) shl 4) or (lrgstate[1].toInt() and 0xff shr 4))].toInt() shl 24) or
            (S_BOX3[sBoxBit(((lrgstate[1].toInt() and 0x0f) shl 2) or (lrgstate[2].toInt() and 0xff shr 6))].toInt() shl 20) or
            (S_BOX4[sBoxBit(lrgstate[2].toInt() and 0x3f)].toInt() shl 16) or
            (S_BOX5[sBoxBit(lrgstate[3].toInt() and 0xff shr 2)].toInt() shl 12) or
            (S_BOX6[sBoxBit(((lrgstate[3].toInt() and 0x03) shl 4) or (lrgstate[4].toInt() and 0xff shr 4))].toInt() shl 8) or
            (S_BOX7[sBoxBit(((lrgstate[4].toInt() and 0x0f) shl 2) or (lrgstate[5].toInt() and 0xff shr 6))].toInt() shl 4) or
            S_BOX8[sBoxBit(lrgstate[5].toInt() and 0x3f)].toInt()
        )

        // P-Box Permutation
        s = (
            bitNumIntL(s, 15, 0) or bitNumIntL(s, 6, 1) or bitNumIntL(s, 19, 2) or
            bitNumIntL(s, 20, 3) or bitNumIntL(s, 28, 4) or bitNumIntL(s, 11, 5) or
            bitNumIntL(s, 27, 6) or bitNumIntL(s, 16, 7) or bitNumIntL(s, 0, 8) or
            bitNumIntL(s, 14, 9) or bitNumIntL(s, 22, 10) or bitNumIntL(s, 25, 11) or
            bitNumIntL(s, 4, 12) or bitNumIntL(s, 17, 13) or bitNumIntL(s, 30, 14) or
            bitNumIntL(s, 9, 15) or bitNumIntL(s, 1, 16) or bitNumIntL(s, 7, 17) or
            bitNumIntL(s, 23, 18) or bitNumIntL(s, 13, 19) or bitNumIntL(s, 31, 20) or
            bitNumIntL(s, 26, 21) or bitNumIntL(s, 2, 22) or bitNumIntL(s, 8, 23) or
            bitNumIntL(s, 18, 24) or bitNumIntL(s, 12, 25) or bitNumIntL(s, 29, 26) or
            bitNumIntL(s, 5, 27) or bitNumIntL(s, 21, 28) or bitNumIntL(s, 10, 29) or
            bitNumIntL(s, 3, 30) or bitNumIntL(s, 24, 31)
        )

        return s
    }

    /**
     * DES key setup - generates 16 subkeys for rounds
     */
    private fun desKeySetup(key: ByteArray, schedule: Array<ByteArray>, mode: DESMode): Int {
        val keyRndShift = intArrayOf(1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1)
        val keyPermC = intArrayOf(56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17,
                                  9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35)
        val keyPermD = intArrayOf(62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21,
                                  13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3)
        val keyCompression = intArrayOf(13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9,
                                       22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1,
                                       40, 51, 30, 36, 46, 54, 29, 39, 50, 44, 32, 47,
                                       43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31)

        // Permutated Choice 1
        var c = 0
        var d = 0
        for (i in 0 until 28) {
            c = c or bitNum(key, keyPermC[i], 31 - i)
            d = d or bitNum(key, keyPermD[i], 31 - i)
        }

        // Generate 16 subkeys
        for (i in 0 until 16) {
            c = (((c shl keyRndShift[i]) or (c ushr (28 - keyRndShift[i]))) and 0xfffffff0.toInt())
            d = (((d shl keyRndShift[i]) or (d ushr (28 - keyRndShift[i]))) and 0xfffffff0.toInt())

            // Decryption subkeys are reverse order of encryption subkeys
            val toGen = if (mode == DESMode.DES_DECRYPT) 15 - i else i

            for (j in 0 until 24) {
                schedule[toGen][j / 8] = (schedule[toGen][j / 8].toInt() or
                    bitNumIntR(c, keyCompression[j], 7 - (j % 8))).toByte()
            }
            for (j in 24 until 48) {
                schedule[toGen][j / 8] = (schedule[toGen][j / 8].toInt() or
                    bitNumIntR(d, keyCompression[j] - 27, 7 - (j % 8))).toByte()
            }
        }

        return 0
    }

    /**
     * DES crypt - processes single 8-byte block
     */
    private fun desCrypt(inputBytes: ByteArray, keySchedule: Array<ByteArray>): ByteArray {
        val state = IntArray(2)
        val inBytes = inputBytes.copyOf(8)

        // Initial Permutation
        ip(state, inBytes)

        // 15 rounds
        for (idx in 0 until 15) {
            val t = state[1]
            val i = f(state[1], keySchedule[idx])
            state[1] = i xor state[0]
            state[0] = t
        }

        // Final round (doesn't switch sides)
        state[0] = f(state[1], keySchedule[15]) xor state[0]

        // Inverse Initial Permutation
        invIp(state, inBytes)

        return inBytes
    }

}
