package `fun`.xwj.musicfree.cenc

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.util.concurrent.Executors

class CencModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val executor = Executors.newCachedThreadPool()

    override fun getName(): String = "Cenc"

    @ReactMethod
    fun registerStream(
        src: String,
        cek: String,
        headers: ReadableMap?,
        promise: Promise,
    ) {
        val copiedHeaders = readableMapToStringMap(headers)
        executor.execute {
            try {
                promise.resolve(CencProxy.register(src, cek, copiedHeaders))
            } catch (error: Throwable) {
                promise.reject("CencRegistrationError", error)
            }
        }
    }

    override fun invalidate() {
        executor.shutdownNow()
        super.invalidate()
    }

    private fun readableMapToStringMap(map: ReadableMap?): Map<String, String> {
        if (map == null) return emptyMap()
        val result = mutableMapOf<String, String>()
        val iterator = map.keySetIterator()
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            map.getString(key)?.let { result[key] = it }
        }
        return result
    }
}
