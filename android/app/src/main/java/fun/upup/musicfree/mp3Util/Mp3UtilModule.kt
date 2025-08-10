package `fun`.upup.musicfree.mp3Util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import com.facebook.react.bridge.*
import org.jaudiotagger.audio.AudioFileIO
import org.jaudiotagger.tag.FieldKey
import org.jaudiotagger.tag.images.ArtworkFactory
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.URL
import java.io.ByteArrayOutputStream

class Mp3UtilModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "Mp3Util"

    private fun isContentUri(uri: Uri?): Boolean {
        return uri?.scheme?.equals("content", ignoreCase = true) == true
    }

    @ReactMethod
    fun getBasicMeta(filePath: String, promise: Promise) {
        try {
            val uri = Uri.parse(filePath)
            val mmr = MediaMetadataRetriever()
            if (isContentUri(uri)) {
                mmr.setDataSource(reactApplicationContext, uri)
            } else {
                mmr.setDataSource(filePath)
            }

            val properties = Arguments.createMap().apply {
                putString("duration", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION))
                putString("bitrate", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE))
                putString("artist", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST))
                putString("author", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_AUTHOR))
                putString("album", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM))
                putString("title", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE))
                putString("date", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE))
                putString("year", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_YEAR))
            }
            promise.resolve(properties)
        } catch (e: Exception) {
            promise.reject("Exception", e.message)
        }
    }

    @ReactMethod
    fun getMediaMeta(filePaths: ReadableArray, promise: Promise) {
        val metas = Arguments.createArray()
        val mmr = MediaMetadataRetriever()
        for (i in 0 until filePaths.size()) {
            try {
                val filePath = filePaths.getString(i)
                val uri = Uri.parse(filePath)

                if (isContentUri(uri)) {
                    mmr.setDataSource(reactApplicationContext, uri)
                } else {
                    mmr.setDataSource(filePath)
                }

                val properties = Arguments.createMap().apply {
                    putString("duration", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION))
                    putString("bitrate", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE))
                    putString("artist", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST))
                    putString("author", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_AUTHOR))
                    putString("album", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM))
                    putString("title", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE))
                    putString("date", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE))
                    putString("year", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_YEAR))
                }
                metas.pushMap(properties)
            } catch (e: Exception) {
                metas.pushNull()
            }
        }
        try {
            mmr.release()
        } catch (ignored: Exception) {
        }
        promise.resolve(metas)
    }


    @ReactMethod
    fun getMediaCoverImg(filePath: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (!file.exists()) {
                promise.reject("File not exist", "File not exist")
                return
            }

            val pathHashCode = file.hashCode()
            if (pathHashCode == 0) {
                promise.resolve(null)
                return
            }

            val cacheDir = reactContext.cacheDir
            val coverFile = File(cacheDir, "image_manager_disk_cache/$pathHashCode.jpg")
            if (coverFile.exists()) {
                promise.resolve(coverFile.toURI().toString())
                return
            }

            val mmr = MediaMetadataRetriever()
            mmr.setDataSource(filePath)
            val coverImg = mmr.embeddedPicture
            if (coverImg != null) {
                val bitmap = BitmapFactory.decodeByteArray(coverImg, 0, coverImg.size)
                FileOutputStream(coverFile).use { outputStream ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 100, outputStream)
                    outputStream.flush()
                }
                promise.resolve(coverFile.toURI().toString())
            } else {
                promise.resolve(null)
            }
            mmr.release()
        } catch (ignored: Exception) {
            promise.reject("Error", "Got error")
        }
    }

    @ReactMethod
    fun getLyric(filePath: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (file.exists()) {
                val audioFile = AudioFileIO.read(file)
                val tag = audioFile.tag
                val lrc = tag.getFirst(FieldKey.LYRICS)
                promise.resolve(lrc)
            } else {
                throw IOException("File not found")
            }
        } catch (e: Exception) {
            promise.reject("Error", e.message)
        }
    }

    @ReactMethod
    fun setMediaTag(filePath: String, meta: ReadableMap, promise: Promise) {
        try {
            val file = File(filePath)
            if (file.exists()) {
                val audioFile = AudioFileIO.read(file)
                val tag = audioFile.tag
                
                // 基本信息
                meta.getString("title")?.let { tag.setField(FieldKey.TITLE, it) }
                meta.getString("artist")?.let { tag.setField(FieldKey.ARTIST, it) }
                meta.getString("album")?.let { tag.setField(FieldKey.ALBUM, it) }
                meta.getString("lyric")?.let { tag.setField(FieldKey.LYRICS, it) }
                meta.getString("comment")?.let { tag.setField(FieldKey.COMMENT, it) }
                
                // 扩展字段
                meta.getString("albumArtist")?.let { tag.setField(FieldKey.ALBUM_ARTIST, it) }
                meta.getString("composer")?.let { tag.setField(FieldKey.COMPOSER, it) }
                meta.getString("year")?.let { tag.setField(FieldKey.YEAR, it) }
                meta.getString("genre")?.let { tag.setField(FieldKey.GENRE, it) }
                meta.getString("trackNumber")?.let { tag.setField(FieldKey.TRACK, it) }
                meta.getString("totalTracks")?.let { tag.setField(FieldKey.TRACK_TOTAL, it) }
                meta.getString("discNumber")?.let { tag.setField(FieldKey.DISC_NO, it) }
                meta.getString("totalDiscs")?.let { tag.setField(FieldKey.DISC_TOTAL, it) }
                meta.getString("isrc")?.let { tag.setField(FieldKey.ISRC, it) }
                meta.getString("language")?.let { tag.setField(FieldKey.LANGUAGE, it) }
                meta.getString("encoder")?.let { tag.setField(FieldKey.ENCODER, it) }
                meta.getString("bpm")?.let { tag.setField(FieldKey.BPM, it) }
                meta.getString("mood")?.let { tag.setField(FieldKey.MOOD, it) }
                meta.getString("rating")?.let { tag.setField(FieldKey.RATING, it) }
                meta.getString("publisher")?.let { tag.setField(FieldKey.RECORD_LABEL, it) }
                meta.getString("originalArtist")?.let { tag.setField(FieldKey.ORIGINAL_ARTIST, it) }
                meta.getString("originalAlbum")?.let { tag.setField(FieldKey.ORIGINAL_ALBUM, it) }
                meta.getString("originalYear")?.let { tag.setField(FieldKey.ORIGINAL_YEAR, it) }
                meta.getString("url")?.let { tag.setField(FieldKey.URL_OFFICIAL_RELEASE_SITE, it) }
                
                // 布尔字段
                if (meta.hasKey("compilation")) {
                    val isCompilation = meta.getBoolean("compilation")
                    tag.setField(FieldKey.IS_COMPILATION, if (isCompilation) "1" else "0")
                }
                
                audioFile.commit()
                promise.resolve(true)
            } else {
                promise.reject("Error", "File Not Exist")
            }
        } catch (e: Exception) {
            promise.reject("Error", e.message)
        }
    }

    @ReactMethod
    fun getMediaTag(filePath: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (file.exists()) {
                val audioFile = AudioFileIO.read(file)
                val tag = audioFile.tag

                val properties = Arguments.createMap().apply {
                    // 基本信息
                    putString("title", tag.getFirst(FieldKey.TITLE))
                    putString("artist", tag.getFirst(FieldKey.ARTIST))
                    putString("album", tag.getFirst(FieldKey.ALBUM))
                    putString("lyric", tag.getFirst(FieldKey.LYRICS))
                    putString("comment", tag.getFirst(FieldKey.COMMENT))
                    
                    // 扩展字段
                    putString("albumArtist", tag.getFirst(FieldKey.ALBUM_ARTIST))
                    putString("composer", tag.getFirst(FieldKey.COMPOSER))
                    putString("year", tag.getFirst(FieldKey.YEAR))
                    putString("genre", tag.getFirst(FieldKey.GENRE))
                    putString("trackNumber", tag.getFirst(FieldKey.TRACK))
                    putString("totalTracks", tag.getFirst(FieldKey.TRACK_TOTAL))
                    putString("discNumber", tag.getFirst(FieldKey.DISC_NO))
                    putString("totalDiscs", tag.getFirst(FieldKey.DISC_TOTAL))
                    putString("isrc", tag.getFirst(FieldKey.ISRC))
                    putString("language", tag.getFirst(FieldKey.LANGUAGE))
                    putString("encoder", tag.getFirst(FieldKey.ENCODER))
                    putString("bpm", tag.getFirst(FieldKey.BPM))
                    putString("mood", tag.getFirst(FieldKey.MOOD))
                    putString("rating", tag.getFirst(FieldKey.RATING))
                    putString("publisher", tag.getFirst(FieldKey.RECORD_LABEL))
                    putString("originalArtist", tag.getFirst(FieldKey.ORIGINAL_ARTIST))
                    putString("originalAlbum", tag.getFirst(FieldKey.ORIGINAL_ALBUM))
                    putString("originalYear", tag.getFirst(FieldKey.ORIGINAL_YEAR))
                    putString("url", tag.getFirst(FieldKey.URL_OFFICIAL_RELEASE_SITE))
                    
                    // 布尔字段
                    val compilationValue = tag.getFirst(FieldKey.IS_COMPILATION)
                    putBoolean("compilation", compilationValue == "1" || compilationValue?.lowercase() == "true")
                }
                promise.resolve(properties)
            } else {
                promise.reject("Error", "File Not Found")
            }
        } catch (e: Exception) {
            promise.reject("Error", e.message)
        }
    }
    
    @ReactMethod
    fun setMediaCover(filePath: String, coverPath: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (!file.exists()) {
                promise.reject("Error", "Music file not found")
                return
            }
            
            // 读取封面图片
            val coverBytes = when {
                // 本地文件路径
                coverPath.startsWith("/") || coverPath.startsWith("file://") -> {
                    val coverFile = File(if (coverPath.startsWith("file://")) {
                        Uri.parse(coverPath).path ?: coverPath
                    } else {
                        coverPath
                    })
                    if (!coverFile.exists()) {
                        promise.reject("Error", "Cover image file not found")
                        return
                    }
                    coverFile.readBytes()
                }
                // 网络URL
                coverPath.startsWith("http://") || coverPath.startsWith("https://") -> {
                    try {
                        URL(coverPath).openStream().use { it.readBytes() }
                    } catch (e: Exception) {
                        promise.reject("Error", "Failed to download cover image: ${e.message}")
                        return
                    }
                }
                else -> {
                    promise.reject("Error", "Invalid cover path")
                    return
                }
            }
            
            // 写入封面到音频文件
            val audioFile = AudioFileIO.read(file)
            val tag = audioFile.tag
            
            // 删除现有封面
            tag.deleteArtworkField()
            
            // 创建并设置新封面
            val artwork = ArtworkFactory.createArtworkFromFile(File.createTempFile("cover", ".jpg").apply {
                writeBytes(coverBytes)
                deleteOnExit()
            })
            tag.setField(artwork)
            
            // 保存文件
            audioFile.commit()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Error", "Failed to set cover: ${e.message}")
        }
    }
    
    @ReactMethod
    fun setMediaTagWithCover(filePath: String, meta: ReadableMap, coverPath: String?, promise: Promise) {
        try {
            val file = File(filePath)
            if (!file.exists()) {
                promise.reject("Error", "File Not Exist")
                return
            }
            
            val audioFile = AudioFileIO.read(file)
            val tag = audioFile.tag
            
            // 基本标签
            meta.getString("title")?.let { tag.setField(FieldKey.TITLE, it) }
            meta.getString("artist")?.let { tag.setField(FieldKey.ARTIST, it) }
            meta.getString("album")?.let { tag.setField(FieldKey.ALBUM, it) }
            meta.getString("lyric")?.let { tag.setField(FieldKey.LYRICS, it) }
            meta.getString("comment")?.let { tag.setField(FieldKey.COMMENT, it) }
            
            // 扩展字段
            meta.getString("albumArtist")?.let { tag.setField(FieldKey.ALBUM_ARTIST, it) }
            meta.getString("composer")?.let { tag.setField(FieldKey.COMPOSER, it) }
            meta.getString("year")?.let { tag.setField(FieldKey.YEAR, it) }
            meta.getString("genre")?.let { tag.setField(FieldKey.GENRE, it) }
            meta.getString("trackNumber")?.let { tag.setField(FieldKey.TRACK, it) }
            meta.getString("totalTracks")?.let { tag.setField(FieldKey.TRACK_TOTAL, it) }
            meta.getString("discNumber")?.let { tag.setField(FieldKey.DISC_NO, it) }
            meta.getString("totalDiscs")?.let { tag.setField(FieldKey.DISC_TOTAL, it) }
            meta.getString("isrc")?.let { tag.setField(FieldKey.ISRC, it) }
            meta.getString("language")?.let { tag.setField(FieldKey.LANGUAGE, it) }
            meta.getString("encoder")?.let { tag.setField(FieldKey.ENCODER, it) }
            meta.getString("bpm")?.let { tag.setField(FieldKey.BPM, it) }
            meta.getString("mood")?.let { tag.setField(FieldKey.MOOD, it) }
            meta.getString("rating")?.let { tag.setField(FieldKey.RATING, it) }
            meta.getString("publisher")?.let { tag.setField(FieldKey.RECORD_LABEL, it) }
            meta.getString("originalArtist")?.let { tag.setField(FieldKey.ORIGINAL_ARTIST, it) }
            meta.getString("originalAlbum")?.let { tag.setField(FieldKey.ORIGINAL_ALBUM, it) }
            meta.getString("originalYear")?.let { tag.setField(FieldKey.ORIGINAL_YEAR, it) }
            meta.getString("url")?.let { tag.setField(FieldKey.URL_OFFICIAL_RELEASE_SITE, it) }
            
            // 布尔字段
            if (meta.hasKey("compilation")) {
                val isCompilation = meta.getBoolean("compilation")
                tag.setField(FieldKey.IS_COMPILATION, if (isCompilation) "1" else "0")
            }
            
            // 如果有封面路径，设置封面
            if (!coverPath.isNullOrEmpty()) {
                try {
                    val coverBytes = when {
                        // 本地文件
                        coverPath.startsWith("/") || coverPath.startsWith("file://") -> {
                            val coverFile = File(if (coverPath.startsWith("file://")) {
                                Uri.parse(coverPath).path ?: coverPath
                            } else {
                                coverPath
                            })
                            if (coverFile.exists()) {
                                coverFile.readBytes()
                            } else null
                        }
                        // 网络URL - 需要下载
                        coverPath.startsWith("http://") || coverPath.startsWith("https://") -> {
                            try {
                                URL(coverPath).openStream().use { it.readBytes() }
                            } catch (e: Exception) {
                                null // 下载失败不影响其他标签写入
                            }
                        }
                        else -> null
                    }
                    
                    if (coverBytes != null) {
                        // 删除现有封面
                        tag.deleteArtworkField()
                        
                        // 创建临时文件并设置封面
                        val tempFile = File.createTempFile("cover", ".jpg")
                        tempFile.writeBytes(coverBytes)
                        val artwork = ArtworkFactory.createArtworkFromFile(tempFile)
                        tag.setField(artwork)
                        tempFile.delete()
                    }
                } catch (e: Exception) {
                    // 封面设置失败不影响其他标签
                }
            }
            
            audioFile.commit()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("Error", e.message)
        }
    }
}