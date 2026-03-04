package `fun`.xwj.musicfree.download

data class DownloadTask(
    val taskId: String,
    val url: String,
    val destinationPath: String,
    val headers: Map<String, String> = emptyMap(),
    val title: String = "MusicFree",
    val description: String = "正在下载音乐文件...",
    val coverUrl: String? = null,
    val extraJson: String? = null,
    var status: DownloadTaskStatus = DownloadTaskStatus.PENDING,
    var downloadedBytes: Long = 0L,
    var totalBytes: Long = -1L,
    var errorMessage: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    var updatedAt: Long = System.currentTimeMillis(),
)

enum class DownloadTaskStatus {
    PENDING,
    PREPARING,
    DOWNLOADING,
    PAUSED,
    COMPLETED,
    CANCELED,
    ERROR,
}

data class ProgressSnapshot(
    val taskId: String,
    val downloaded: Long,
    val total: Long,
    val percent: Int,
    val progressText: String,
)
