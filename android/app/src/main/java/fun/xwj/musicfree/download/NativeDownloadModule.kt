package `fun`.xwj.musicfree.download

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class NativeDownloadModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    private val manager: DownloadManager by lazy {
        DownloadManager(reactContext, object : DownloadManager.Listener {
            override fun onTaskStatusChanged(task: DownloadTask) {
                emitEvent(EVENT_STATUS_CHANGED, taskToWritableMap(task))
            }

            override fun onProgressBatch(items: List<ProgressSnapshot>) {
                val array = Arguments.createArray()
                items.forEach { item ->
                    val map = Arguments.createMap().apply {
                        putString("taskId", item.taskId)
                        putDouble("downloaded", item.downloaded.toDouble())
                        putDouble("total", item.total.toDouble())
                        putInt("percent", item.percent)
                        putString("progressText", item.progressText)
                    }
                    array.pushMap(map)
                }
                val payload = Arguments.createMap().apply {
                    putArray("items", array)
                }
                emitEvent(EVENT_PROGRESS_BATCH, payload)
            }

            override fun onQueueDrained() {
                emitEvent(EVENT_QUEUE_DRAINED, Arguments.createMap())
            }
        })
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun addDownloadTask(params: ReadableMap, promise: Promise) {
        try {
            val taskId = params.getString("taskId")
            val url = params.getString("url")
            val destinationPath = params.getString("destinationPath")
            if (taskId.isNullOrBlank() || url.isNullOrBlank() || destinationPath.isNullOrBlank()) {
                promise.reject("InvalidArgument", "taskId/url/destinationPath are required")
                return
            }

            val headers = readableMapToStringMap(params.getMap("headers"))
            val title = params.getString("title") ?: "MusicFree"
            val description = params.getString("description") ?: "正在下载音乐文件..."
            val coverUrl = params.getString("coverUrl")
            val extraJson = params.getString("extraJson")

            val added = manager.addTask(
                DownloadTask(
                    taskId = taskId,
                    url = url,
                    destinationPath = destinationPath,
                    headers = headers,
                    title = title,
                    description = description,
                    coverUrl = coverUrl,
                    extraJson = extraJson,
                )
            )
            promise.resolve(added)
        } catch (error: Exception) {
            promise.reject("AddTaskError", error)
        }
    }

    @ReactMethod
    fun pauseDownloadTask(taskId: String, promise: Promise) {
        try {
            promise.resolve(manager.pauseTask(taskId))
        } catch (error: Exception) {
            promise.reject("PauseTaskError", error)
        }
    }

    @ReactMethod
    fun resumeDownloadTask(taskId: String, promise: Promise) {
        try {
            promise.resolve(manager.resumeTask(taskId))
        } catch (error: Exception) {
            promise.reject("ResumeTaskError", error)
        }
    }

    @ReactMethod
    fun cancelDownloadTask(taskId: String, promise: Promise) {
        try {
            promise.resolve(manager.cancelTask(taskId))
        } catch (error: Exception) {
            promise.reject("CancelTaskError", error)
        }
    }

    @ReactMethod
    fun removeDownloadTask(taskId: String, promise: Promise) {
        try {
            promise.resolve(manager.removeTask(taskId))
        } catch (error: Exception) {
            promise.reject("RemoveTaskError", error)
        }
    }

    @ReactMethod
    fun getDownloadTaskStatus(taskId: String, promise: Promise) {
        try {
            val task = manager.getTask(taskId)
            if (task == null) {
                promise.resolve(null)
            } else {
                promise.resolve(taskToWritableMap(task))
            }
        } catch (error: Exception) {
            promise.reject("GetTaskStatusError", error)
        }
    }

    @ReactMethod
    fun getAllDownloadTasks(promise: Promise) {
        try {
            val tasks = manager.getAllTasks()
            val array = Arguments.createArray()
            tasks.forEach { array.pushMap(taskToWritableMap(it)) }
            promise.resolve(array)
        } catch (error: Exception) {
            promise.reject("GetAllTasksError", error)
        }
    }

    @ReactMethod
    fun setDownloadMaxConcurrency(max: Int, promise: Promise) {
        try {
            manager.setMaxConcurrency(max)
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("SetConcurrencyError", error)
        }
    }

    @Suppress("UNUSED_PARAMETER")
    @ReactMethod
    fun addListener(eventName: String) {
        // Keep for RN NativeEventEmitter contract.
    }

    @Suppress("UNUSED_PARAMETER")
    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep for RN NativeEventEmitter contract.
    }

    override fun invalidate() {
        super.invalidate()
        try {
            manager.shutdown()
        } catch (_: Exception) {
        }
    }

    private fun emitEvent(name: String, data: com.facebook.react.bridge.WritableMap) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, data)
        } catch (_: Exception) {
        }
    }

    private fun taskToWritableMap(task: DownloadTask): com.facebook.react.bridge.WritableMap {
        return Arguments.createMap().apply {
            putString("taskId", task.taskId)
            putString("url", task.url)
            putString("destinationPath", task.destinationPath)
            putString("title", task.title)
            putString("description", task.description)
            putString("coverUrl", task.coverUrl)
            putString("extraJson", task.extraJson)
            putString("status", task.status.name)
            putDouble("downloaded", task.downloadedBytes.toDouble())
            putDouble("total", task.totalBytes.toDouble())
            putString("error", task.errorMessage)
            putDouble("createdAt", task.createdAt.toDouble())
            putDouble("updatedAt", task.updatedAt.toDouble())
            putString("progressText", buildProgressText(task.downloadedBytes, task.totalBytes))
        }
    }

    private fun readableMapToStringMap(map: ReadableMap?): Map<String, String> {
        if (map == null) return emptyMap()
        val out = mutableMapOf<String, String>()
        val iterator = map.keySetIterator()
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            val value = map.getString(key)
            if (!value.isNullOrEmpty()) {
                out[key] = value
            }
        }
        return out
    }

    private fun buildProgressText(downloaded: Long, total: Long): String {
        return when {
            downloaded <= 0L -> "正在准备下载..."
            total > 0L -> "${formatFileSize(downloaded)} / ${formatFileSize(total)}"
            else -> "已下载 ${formatFileSize(downloaded)}"
        }
    }

    private fun formatFileSize(bytes: Long): String {
        return when {
            bytes <= 0L -> "0B"
            bytes < 1024L -> "${bytes}B"
            bytes < 1024L * 1024L -> String.format("%.1fKB", bytes / 1024.0)
            bytes < 1024L * 1024L * 1024L -> String.format("%.1fMB", bytes / (1024.0 * 1024.0))
            else -> String.format("%.1fGB", bytes / (1024.0 * 1024.0 * 1024.0))
        }
    }

    companion object {
        const val MODULE_NAME = "NativeDownload"
        const val EVENT_STATUS_CHANGED = "NativeDownloadTaskStatusChanged"
        const val EVENT_PROGRESS_BATCH = "NativeDownloadProgressBatch"
        const val EVENT_QUEUE_DRAINED = "NativeDownloadQueueDrained"
    }
}
