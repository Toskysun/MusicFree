package `fun`.xwj.musicfree.download

import okhttp3.OkHttpClient
import okhttp3.Request
import org.jaudiotagger.audio.AudioFileIO
import org.jaudiotagger.tag.FieldKey
import java.io.File

object MetadataService {
    fun writeMetadata(
        filePath: String,
        metadata: Map<String, String>,
    ): Boolean {
        return try {
            val file = File(filePath)
            if (!file.exists()) return false
            val audioFile = AudioFileIO.read(file)
            val tag = audioFile.tag ?: audioFile.createDefaultTag()

            metadata["title"]?.let { tag.setField(FieldKey.TITLE, it) }
            metadata["artist"]?.let { tag.setField(FieldKey.ARTIST, it) }
            metadata["album"]?.let { tag.setField(FieldKey.ALBUM, it) }
            metadata["lyric"]?.let { tag.setField(FieldKey.LYRICS, it) }
            metadata["comment"]?.let { tag.setField(FieldKey.COMMENT, it) }

            audioFile.commit()
            true
        } catch (_: Exception) {
            false
        }
    }

    fun downloadLyric(
        lyricUrl: String,
        outputPath: String,
        headers: Map<String, String> = emptyMap(),
    ): Boolean {
        return try {
            val client = OkHttpClient.Builder().build()
            val reqBuilder = Request.Builder().url(lyricUrl).get()
            headers.forEach { (k, v) ->
                reqBuilder.addHeader(k, v)
            }
            client.newCall(reqBuilder.build()).execute().use { response ->
                if (!response.isSuccessful) return false
                val content = response.body?.string() ?: return false
                val file = File(outputPath)
                val parent = file.parentFile
                if (parent != null && !parent.exists()) {
                    parent.mkdirs()
                }
                file.writeText(content, Charsets.UTF_8)
            }
            true
        } catch (_: Exception) {
            false
        }
    }
}
