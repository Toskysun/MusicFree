package `fun`.xwj.musicfree.download

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

class DownloadDatabase(context: Context) :
    SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS $TABLE_TASKS (
                task_id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                destination_path TEXT NOT NULL,
                headers_json TEXT,
                title TEXT,
                description TEXT,
                cover_url TEXT,
                extra_json TEXT,
                status TEXT NOT NULL,
                downloaded_bytes INTEGER NOT NULL DEFAULT 0,
                total_bytes INTEGER NOT NULL DEFAULT -1,
                error_message TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS idx_download_tasks_status ON $TABLE_TASKS(status)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion != newVersion) {
            db.execSQL("DROP TABLE IF EXISTS $TABLE_TASKS")
            onCreate(db)
        }
    }

    fun upsertTask(task: DownloadTask) {
        val values = ContentValues().apply {
            put("task_id", task.taskId)
            put("url", task.url)
            put("destination_path", task.destinationPath)
            put("headers_json", JSONObject(task.headers).toString())
            put("title", task.title)
            put("description", task.description)
            put("cover_url", task.coverUrl)
            put("extra_json", task.extraJson)
            put("status", task.status.name)
            put("downloaded_bytes", task.downloadedBytes)
            put("total_bytes", task.totalBytes)
            put("error_message", task.errorMessage)
            put("created_at", task.createdAt)
            put("updated_at", task.updatedAt)
        }
        writableDatabase.insertWithOnConflict(
            TABLE_TASKS,
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE,
        )
    }

    fun deleteTask(taskId: String) {
        writableDatabase.delete(TABLE_TASKS, "task_id = ?", arrayOf(taskId))
    }

    fun getTask(taskId: String): DownloadTask? {
        val cursor = readableDatabase.query(
            TABLE_TASKS,
            null,
            "task_id = ?",
            arrayOf(taskId),
            null,
            null,
            null,
        )
        cursor.use {
            if (!it.moveToFirst()) return null
            return buildTask(it)
        }
    }

    fun getAllTasks(): List<DownloadTask> {
        val cursor = readableDatabase.query(
            TABLE_TASKS,
            null,
            null,
            null,
            null,
            null,
            "created_at ASC",
        )
        cursor.use {
            val result = mutableListOf<DownloadTask>()
            while (it.moveToNext()) {
                result.add(buildTask(it))
            }
            return result
        }
    }

    private fun buildTask(cursor: android.database.Cursor): DownloadTask {
        val headersJson = cursor.getString(cursor.getColumnIndexOrThrow("headers_json")) ?: "{}"
        val headers = parseHeaders(headersJson)
        val statusRaw = cursor.getString(cursor.getColumnIndexOrThrow("status"))
        val status = try {
            DownloadTaskStatus.valueOf(statusRaw)
        } catch (_: Exception) {
            DownloadTaskStatus.ERROR
        }
        return DownloadTask(
            taskId = cursor.getString(cursor.getColumnIndexOrThrow("task_id")),
            url = cursor.getString(cursor.getColumnIndexOrThrow("url")),
            destinationPath = cursor.getString(cursor.getColumnIndexOrThrow("destination_path")),
            headers = headers,
            title = cursor.getString(cursor.getColumnIndexOrThrow("title")) ?: "MusicFree",
            description = cursor.getString(cursor.getColumnIndexOrThrow("description")) ?: "正在下载音乐文件...",
            coverUrl = cursor.getString(cursor.getColumnIndexOrThrow("cover_url")),
            extraJson = cursor.getString(cursor.getColumnIndexOrThrow("extra_json")),
            status = status,
            downloadedBytes = cursor.getLong(cursor.getColumnIndexOrThrow("downloaded_bytes")),
            totalBytes = cursor.getLong(cursor.getColumnIndexOrThrow("total_bytes")),
            errorMessage = cursor.getString(cursor.getColumnIndexOrThrow("error_message")),
            createdAt = cursor.getLong(cursor.getColumnIndexOrThrow("created_at")),
            updatedAt = cursor.getLong(cursor.getColumnIndexOrThrow("updated_at")),
        )
    }

    private fun parseHeaders(raw: String): Map<String, String> {
        return try {
            val json = JSONObject(raw)
            val iter = json.keys()
            val out = mutableMapOf<String, String>()
            while (iter.hasNext()) {
                val key = iter.next()
                out[key] = json.optString(key, "")
            }
            out
        } catch (_: Exception) {
            emptyMap()
        }
    }

    companion object {
        private const val DB_NAME = "native_downloads.db"
        private const val DB_VERSION = 1
        private const val TABLE_TASKS = "download_tasks"
    }
}
