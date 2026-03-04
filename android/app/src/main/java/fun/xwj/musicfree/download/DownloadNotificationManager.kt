package `fun`.xwj.musicfree.download

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import `fun`.xwj.musicfree.R
import java.util.concurrent.ConcurrentHashMap

class DownloadNotificationManager(
    context: Context,
) {
    private val appContext = context.applicationContext
    private val notificationManagerCompat = NotificationManagerCompat.from(appContext)
    private val activeDownloadingIds = ConcurrentHashMap.newKeySet<String>()
    private val progressSnapshots = ConcurrentHashMap<String, ProgressSnapshot>()
    private val taskTitles = ConcurrentHashMap<String, String>()

    init {
        ensureChannel()
    }

    fun onTaskStatusChanged(task: DownloadTask) {
        val title = if (task.title.isBlank()) "MusicFree" else task.title
        taskTitles[task.taskId] = title
        when (task.status) {
            DownloadTaskStatus.PENDING,
            DownloadTaskStatus.PREPARING,
            DownloadTaskStatus.DOWNLOADING,
            -> activeDownloadingIds.add(task.taskId)
            DownloadTaskStatus.COMPLETED -> {
                activeDownloadingIds.remove(task.taskId)
                progressSnapshots.remove(task.taskId)
                postCompleted(task)
            }
            DownloadTaskStatus.ERROR -> {
                activeDownloadingIds.remove(task.taskId)
                progressSnapshots.remove(task.taskId)
                postError(task)
            }
            DownloadTaskStatus.PAUSED,
            DownloadTaskStatus.CANCELED,
            -> {
                activeDownloadingIds.remove(task.taskId)
                progressSnapshots.remove(task.taskId)
                cancelTaskNotification(task.taskId)
            }
        }
        updateSummaryNotification()
    }

    fun onProgressBatch(
        items: List<ProgressSnapshot>,
        taskById: Map<String, DownloadTask>,
    ) {
        if (items.isEmpty()) return
        for (item in items) {
            val task = taskById[item.taskId] ?: continue
            if (task.status != DownloadTaskStatus.DOWNLOADING && task.status != DownloadTaskStatus.PREPARING) {
                continue
            }
            val title = if (task.title.isBlank()) "MusicFree" else task.title
            taskTitles[item.taskId] = title
            activeDownloadingIds.add(item.taskId)
            progressSnapshots[item.taskId] = item
            postProgress(task, item)
        }
        updateSummaryNotification()
    }

    fun onQueueDrained() {
        updateSummaryNotification()
    }

    fun shutdown() {
        activeDownloadingIds.forEach { taskId ->
            cancelTaskNotification(taskId)
        }
        activeDownloadingIds.clear()
        progressSnapshots.clear()
        taskTitles.clear()
        cancelSummaryNotification()
    }

    private fun postProgress(task: DownloadTask, snapshot: ProgressSnapshot) {
        if (!canPostNotifications()) return
        val title = taskTitles[task.taskId] ?: task.title.ifBlank { "MusicFree" }
        val builder = baseBuilder(
            icon = R.drawable.ic_download,
            title = "正在下载: $title",
            text = snapshot.progressText.ifBlank { "正在准备下载..." },
        )
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setAutoCancel(false)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)

        if (snapshot.total > 0L) {
            val max = snapshot.total.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
            val progress = snapshot.downloaded.coerceAtMost(max.toLong()).toInt()
            builder.setProgress(max, progress, false)
            builder.setSubText("${snapshot.percent.coerceIn(0, 100)}%")
        } else {
            builder.setProgress(0, 0, true)
        }

        notify(taskNotificationId(task.taskId), builder)
    }

    private fun postCompleted(task: DownloadTask) {
        if (!canPostNotifications()) return
        val title = taskTitles[task.taskId] ?: task.title.ifBlank { "MusicFree" }
        val builder = baseBuilder(
            icon = R.drawable.ic_download_done,
            title = "下载完成",
            text = title,
        )
            .setOnlyAlertOnce(true)
            .setOngoing(false)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setProgress(0, 0, false)
        notify(taskNotificationId(task.taskId), builder)
    }

    private fun postError(task: DownloadTask) {
        if (!canPostNotifications()) return
        val title = taskTitles[task.taskId] ?: task.title.ifBlank { "MusicFree" }
        val reason = task.errorMessage?.takeIf { it.isNotBlank() } ?: "未知错误"
        val builder = baseBuilder(
            icon = R.drawable.ic_error,
            title = "下载失败",
            text = "$title · $reason",
        )
            .setOnlyAlertOnce(true)
            .setOngoing(false)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_ERROR)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setProgress(0, 0, false)
        notify(taskNotificationId(task.taskId), builder)
    }

    private fun updateSummaryNotification() {
        if (!canPostNotifications()) return
        val activeTaskIds = activeDownloadingIds.toList()
        if (activeTaskIds.size <= 1) {
            cancelSummaryNotification()
            return
        }

        var downloadedSum = 0L
        var totalSum = 0L
        var hasAllTotals = true
        for (taskId in activeTaskIds) {
            val snapshot = progressSnapshots[taskId] ?: continue
            downloadedSum += snapshot.downloaded.coerceAtLeast(0L)
            if (snapshot.total > 0L) {
                totalSum += snapshot.total
            } else {
                hasAllTotals = false
            }
        }

        val count = activeTaskIds.size
        val summaryTitle = "正在下载 $count 首歌曲"
        val summaryText = if (hasAllTotals && totalSum > 0L) {
            "${formatFileSize(downloadedSum)} / ${formatFileSize(totalSum)}"
        } else {
            "批量下载进行中"
        }

        val builder = baseBuilder(
            icon = R.drawable.ic_download,
            title = summaryTitle,
            text = summaryText,
        )
            .setOnlyAlertOnce(true)
            .setGroupSummary(true)
            .setOngoing(true)
            .setAutoCancel(false)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)

        if (hasAllTotals && totalSum > 0L) {
            val percent = ((downloadedSum * 100L) / totalSum).toInt().coerceIn(0, 100)
            builder.setProgress(100, percent, false)
            builder.setSubText("$percent%")
        } else {
            builder.setProgress(0, 0, true)
        }

        notify(SUMMARY_NOTIFICATION_ID, builder)
    }

    private fun cancelTaskNotification(taskId: String) {
        if (!canPostNotifications()) return
        try {
            notificationManagerCompat.cancel(taskNotificationId(taskId))
        } catch (_: Exception) {
        }
    }

    private fun cancelSummaryNotification() {
        if (!canPostNotifications()) return
        try {
            notificationManagerCompat.cancel(SUMMARY_NOTIFICATION_ID)
        } catch (_: Exception) {
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "下载通知",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "MusicFree 下载进度与结果通知"
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun canPostNotifications(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            appContext,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun baseBuilder(icon: Int, title: String, text: String): NotificationCompat.Builder {
        val builder = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(icon)
            .setContentTitle(title)
            .setContentText(text)
            .setGroup(NOTIFICATION_GROUP)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        val pendingIntent = buildLaunchPendingIntent()
        if (pendingIntent != null) {
            builder.setContentIntent(pendingIntent)
        }
        return builder
    }

    private fun buildLaunchPendingIntent(): PendingIntent? {
        val launchIntent = appContext.packageManager.getLaunchIntentForPackage(appContext.packageName)
            ?: return null
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
            )
        return PendingIntent.getActivity(appContext, 0, launchIntent, flags)
    }

    private fun notify(notificationId: Int, builder: NotificationCompat.Builder) {
        try {
            notificationManagerCompat.notify(notificationId, builder.build())
        } catch (_: SecurityException) {
        } catch (_: Exception) {
        }
    }

    private fun taskNotificationId(taskId: String): Int {
        val hash = taskId.hashCode() and Int.MAX_VALUE
        return TASK_NOTIFICATION_BASE + (hash % 1_000_000)
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
        private const val CHANNEL_ID = "musicfree_download_channel"
        private const val NOTIFICATION_GROUP = "musicfree_download_group"
        private const val TASK_NOTIFICATION_BASE = 310_000
        private const val SUMMARY_NOTIFICATION_ID = 2_000_000_001
    }
}
