package `fun`.xwj.musicfree.mp3Util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import com.facebook.react.bridge.*
import com.facebook.react.bridge.ReadableType
import org.jaudiotagger.audio.AudioFileIO
import org.jaudiotagger.tag.FieldKey
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.ByteArrayOutputStream
import android.app.DownloadManager
import android.content.Context
import android.os.Environment
import java.net.HttpURLConnection
import java.net.URL
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.UUID
import fi.iki.elonen.NanoHTTPD
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Headers
import okhttp3.Response
import java.io.BufferedInputStream
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import java.util.concurrent.TimeUnit
import java.io.BufferedOutputStream
import android.app.PendingIntent
import android.content.Intent
import android.content.BroadcastReceiver
import androidx.core.content.FileProvider
import android.webkit.MimeTypeMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class Mp3UtilModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val ACTION_CANCEL = "fun.xwj.musicfree.action.CANCEL_DOWNLOAD"
        const val EXTRA_ID = "id"
        private val httpCalls = ConcurrentHashMap<String, okhttp3.Call>()

        // Singleton OkHttpClient for all downloads to avoid resource exhaustion
        private val downloadClient: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .followRedirects(true)
                .followSslRedirects(true)
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .connectionPool(okhttp3.ConnectionPool(10, 5, TimeUnit.MINUTES))
                .build()
        }

        fun registerCall(id: String, call: okhttp3.Call) { httpCalls[id] = call }
        fun removeCall(id: String) { httpCalls.remove(id) }
        fun cancelCall(id: String) { httpCalls[id]?.cancel() }
    }

    override fun getName() = "Mp3Util"

    private fun isContentUri(uri: Uri?): Boolean {
        return uri?.scheme?.equals("content", ignoreCase = true) == true
    }

    /**
     * 使用Android原生网络请求下载图片数据，完全避免ImageIO
     */
    private fun downloadImageBytes(imageUrl: String): ByteArray? {
        return try {
            val url = URL(imageUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 15000
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Android)")
            
            val responseCode = connection.responseCode
            if (responseCode == HttpURLConnection.HTTP_OK) {
                connection.inputStream.use { inputStream ->
                    val buffer = ByteArrayOutputStream()
                    val data = ByteArray(4096)
                    var bytesRead: Int
                    while (inputStream.read(data).also { bytesRead = it } != -1) {
                        buffer.write(data, 0, bytesRead)
                    }
                    buffer.toByteArray()
                }
            } else {
                null
            }
        } catch (e: Exception) {
            android.util.Log.w("Mp3UtilModule", "Failed to download image: ${e.message}")
            null
        }
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
                var tag = audioFile.tag
                
                // 如果文件没有现有标签，创建一个新的标签
                if (tag == null) {
                    tag = audioFile.createDefaultTag()
                    android.util.Log.i("Mp3UtilModule", "Created new tag for file: $filePath")
                }
                
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
                    val downloadedBytes = downloadImageBytes(coverPath)
                    if (downloadedBytes == null) {
                        promise.reject("Error", "Failed to download cover image")
                        return
                    }
                    downloadedBytes
                }
                else -> {
                    promise.reject("Error", "Invalid cover path")
                    return
                }
            }
            
            // 写入封面到音频文件
            val audioFile = AudioFileIO.read(file)
            var tag = audioFile.tag
            
            // 如果文件没有现有标签，创建一个新的标签
            if (tag == null) {
                tag = audioFile.createDefaultTag()
                android.util.Log.i("Mp3UtilModule", "Created new tag for file: $filePath")
            }
            
            // 删除现有封面
            tag.deleteArtworkField()
            
            // 使用新的安全方法设置封面
            val success = setCoverArtImageIOFree(tag, coverBytes, file.extension.lowercase())
            if (success) {
                audioFile.commit()
                promise.resolve(true)
            } else {
                promise.reject("Error", "Failed to set cover art for this file format")
            }
        } catch (e: Exception) {
            promise.reject("Error", "Failed to set cover: ${e.message}")
        }
    }
    
    /**
     * 完全无ImageIO依赖的封面设置方法
     */
    private fun setCoverArtImageIOFree(tag: org.jaudiotagger.tag.Tag, coverBytes: ByteArray, fileExtension: String): Boolean {
        return try {
            val mimeType = detectImageMimeTypeByBytes(coverBytes)
            android.util.Log.i("Mp3UtilModule", "Setting cover for ${fileExtension} file, detected MIME: $mimeType, tag type: ${tag.javaClass.simpleName}")
            
            when (fileExtension) {
                "mp3" -> setCoverForMp3(tag, coverBytes, mimeType)
                "flac" -> setCoverForFlac(tag, coverBytes, mimeType)
                "m4a", "mp4" -> setCoverForMp4(tag, coverBytes, mimeType)
                "ogg" -> setCoverForOgg(tag, coverBytes, mimeType)
                else -> {
                    android.util.Log.w("Mp3UtilModule", "Unsupported file extension: $fileExtension")
                    false
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "Failed to set cover art: ${e.message}", e)
            false
        }
    }

    /**
     * 为MP3文件设置封面，使用最底层的ID3帧API，完全避免ImageIO
     */
    private fun setCoverForMp3(tag: org.jaudiotagger.tag.Tag, coverBytes: ByteArray, mimeType: String): Boolean {
        return try {
            when (tag) {
                is org.jaudiotagger.tag.id3.ID3v24Tag -> {
                    // 创建APIC帧体
                    val apicFrame = org.jaudiotagger.tag.id3.framebody.FrameBodyAPIC()
                    apicFrame.setObjectValue(org.jaudiotagger.tag.datatype.DataTypes.OBJ_TEXT_ENCODING, 0.toByte())
                    apicFrame.setObjectValue(org.jaudiotagger.tag.datatype.DataTypes.OBJ_MIME_TYPE, mimeType)
                    apicFrame.setObjectValue(org.jaudiotagger.tag.datatype.DataTypes.OBJ_PICTURE_TYPE, 3.toByte()) // Front cover
                    apicFrame.setObjectValue(org.jaudiotagger.tag.datatype.DataTypes.OBJ_DESCRIPTION, "")
                    apicFrame.setObjectValue(org.jaudiotagger.tag.datatype.DataTypes.OBJ_PICTURE_DATA, coverBytes)
                    
                    // 创建帧并设置
                    val frame = org.jaudiotagger.tag.id3.ID3v24Frame(org.jaudiotagger.tag.id3.ID3v24Frames.FRAME_ID_ATTACHED_PICTURE)
                    frame.body = apicFrame
                    tag.setFrame(frame)
                    
                    android.util.Log.i("Mp3UtilModule", "Successfully set MP3 cover using ID3v2.4 direct frame API")
                    true
                }
                is org.jaudiotagger.tag.id3.ID3v23Tag -> {
                    // 创建APIC帧体 
                    val apicFrame = org.jaudiotagger.tag.id3.framebody.FrameBodyAPIC()
                    apicFrame.setObjectValue(org.jaudiotagger.tag.datatype.DataTypes.OBJ_TEXT_ENCODING, 0.toByte())
                    apicFrame.setObjectValue(org.jaudiotagger.tag.datatype.DataTypes.OBJ_MIME_TYPE, mimeType)
                    apicFrame.setObjectValue(org.jaudiotagger.tag.datatype.DataTypes.OBJ_PICTURE_TYPE, 3.toByte()) // Front cover
                    apicFrame.setObjectValue(org.jaudiotagger.tag.datatype.DataTypes.OBJ_DESCRIPTION, "")
                    apicFrame.setObjectValue(org.jaudiotagger.tag.datatype.DataTypes.OBJ_PICTURE_DATA, coverBytes)
                    
                    // 创建帧并设置
                    val frame = org.jaudiotagger.tag.id3.ID3v23Frame(org.jaudiotagger.tag.id3.ID3v23Frames.FRAME_ID_V3_ATTACHED_PICTURE)
                    frame.body = apicFrame
                    tag.setFrame(frame)
                    
                    android.util.Log.i("Mp3UtilModule", "Successfully set MP3 cover using ID3v2.3 direct frame API")
                    true
                }
                else -> {
                    android.util.Log.w("Mp3UtilModule", "Unsupported MP3 tag type: ${tag.javaClass.simpleName}")
                    false
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "Failed to set MP3 cover: ${e.message}", e)
            false
        }
    }

    /**
     * 为FLAC文件设置封面，完全避免javax.imageio.ImageIO依赖
     * 使用纯Android兼容的方式处理FLAC封面设置
     */
    private fun setCoverForFlac(tag: org.jaudiotagger.tag.Tag, coverBytes: ByteArray, mimeType: String): Boolean {
        return try {
            android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] 处理开始 - 标签类型: ${tag.javaClass.simpleName}, 图像类型: $mimeType, 大小: ${coverBytes.size} bytes")
            
            when (tag) {
                is org.jaudiotagger.tag.flac.FlacTag -> {
                    android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] 使用FlacTag专用方法")
                    
                    // 删除现有的PICTURE块
                    tag.deleteArtworkField()
                    android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] 已删除现有封面")
                    
                    // 方法1：直接创建PICTURE metadata block，避免任何可能的ImageIO依赖
                    try {
                        android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] 方法1: 直接创建PICTURE metadata block")
                        
                        // 使用Android原生方式获取图像尺寸信息
                        val bitmapOptions = BitmapFactory.Options().apply {
                            inJustDecodeBounds = true
                        }
                        BitmapFactory.decodeByteArray(coverBytes, 0, coverBytes.size, bitmapOptions)
                        
                        val imageWidth = if (bitmapOptions.outWidth > 0) bitmapOptions.outWidth else 0
                        val imageHeight = if (bitmapOptions.outHeight > 0) bitmapOptions.outHeight else 0
                        val colourDepth = when (mimeType) {
                            "image/png" -> 32  // PNG通常支持alpha通道
                            "image/jpeg" -> 24 // JPEG不支持透明度
                            else -> 24
                        }
                        
                        android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] 图像信息 - 宽度: $imageWidth, 高度: $imageHeight, 颜色深度: $colourDepth")
                        
                        // 直接创建PICTURE metadata block，不依赖任何可能使用ImageIO的工厂方法
                        val pictureBlock = org.jaudiotagger.audio.flac.metadatablock.MetadataBlockDataPicture(
                            coverBytes,                    // imageData 
                            coverBytes.size,               // imageDataLength
                            mimeType,                      // mimeType
                            "",                            // description (empty)
                            imageWidth,                    // width
                            imageHeight,                   // height  
                            colourDepth,                   // colourDepth
                            0                              // indexedColoursUsed (0 for non-indexed images)
                        )
                        
                        // 通过构造函数设置图片类型为Front Cover (类型3) - 这个需要通过字段设置
                        try {
                            // 使用反射设置pictureType，因为它是val属性
                            val pictureTypeField = pictureBlock.javaClass.getDeclaredField("pictureType")
                            pictureTypeField.isAccessible = true
                            pictureTypeField.set(pictureBlock, 3) // Front cover
                            android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] PICTURE块创建成功 - 类型: Front Cover")
                        } catch (e: Exception) {
                            android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] PICTURE块创建成功 - 使用默认类型")
                        }
                        
                        // 将metadata block作为TagField添加到标签
                        tag.addField(pictureBlock)
                        android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] ✅ 方法1成功!")
                        return true
                    } catch (e: Exception) {
                        android.util.Log.w("Mp3UtilModule", "🎵[FLAC封面] ❌ 方法1失败: ${e.javaClass.simpleName}: ${e.message}")
                    }
                    
                    // 方法2：使用Base64编码方式（某些JAudiotagger版本支持）
                    try {
                        android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] 方法2: 尝试Base64编码方式")
                        
                        val base64Cover = java.util.Base64.getEncoder().encodeToString(coverBytes)
                        tag.setField(FieldKey.COVER_ART, base64Cover)
                        android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] ✅ 方法2成功!")
                        return true
                    } catch (e: Exception) {
                        android.util.Log.w("Mp3UtilModule", "🎵[FLAC封面] ❌ 方法2失败: ${e.javaClass.simpleName}: ${e.message}")
                    }
                    
                    // 方法3：通过VorbisCommentTag设置（使用Base64）
                    try {
                        android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] 方法3: VorbisCommentTag Base64方式")
                        
                        val vorbisTag = tag.vorbisCommentTag
                        if (vorbisTag != null) {
                            // 删除现有封面
                            vorbisTag.deleteArtworkField()
                            
                            // 使用Base64设置封面
                            val base64Cover = java.util.Base64.getEncoder().encodeToString(coverBytes)
                            vorbisTag.setField(FieldKey.COVER_ART, base64Cover)
                            android.util.Log.i("Mp3UtilModule", "🎵[FLAC封面] ✅ 方法3成功!")
                            return true
                        } else {
                            android.util.Log.w("Mp3UtilModule", "🎵[FLAC封面] VorbisCommentTag为空")
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("Mp3UtilModule", "🎵[FLAC封面] ❌ 方法3失败: ${e.javaClass.simpleName}: ${e.message}")
                    }
                    
                    android.util.Log.w("Mp3UtilModule", "🎵[FLAC封面] ⚠️ 所有FlacTag方法均失败，但这不会影响其他元数据写入")
                    false
                }
                else -> {
                    android.util.Log.w("Mp3UtilModule", "🎵[FLAC封面] 不支持的标签类型: ${tag.javaClass.simpleName}")
                    false
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "🎵[FLAC封面] 💥 异常: ${e.javaClass.simpleName}: ${e.message}")
            // 封面设置失败不应该影响其他标签的写入
            false
        }
    }

    /**
     * 为MP4/M4A文件设置封面
     */
    private fun setCoverForMp4(tag: org.jaudiotagger.tag.Tag, coverBytes: ByteArray, mimeType: String): Boolean {
        return try {
            // MP4使用不同的封面字段
            tag.setField(FieldKey.COVER_ART, java.util.Base64.getEncoder().encodeToString(coverBytes))
            android.util.Log.i("Mp3UtilModule", "Successfully set MP4 cover using base64 method")
            true
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "Failed to set MP4 cover: ${e.message}", e)
            false
        }
    }

    /**
     * 为OGG文件设置封面
     */
    private fun setCoverForOgg(tag: org.jaudiotagger.tag.Tag, coverBytes: ByteArray, mimeType: String): Boolean {
        return try {
            tag.setField(FieldKey.COVER_ART, java.util.Base64.getEncoder().encodeToString(coverBytes))
            android.util.Log.i("Mp3UtilModule", "Successfully set OGG cover using base64 method")
            true
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "Failed to set OGG cover: ${e.message}", e)
            false
        }
    }

    /**
     * 通过字节头检测图片MIME类型，参考ikun项目的实现
     */
    private fun detectImageMimeTypeByBytes(imageBytes: ByteArray): String {
        return when {
            // JPEG: FF D8 FF (ikun项目中的检测方式)
            imageBytes.size >= 3 && imageBytes[0] == 0xFF.toByte() && imageBytes[1] == 0xD8.toByte() && imageBytes[2] == 0xFF.toByte() -> "image/jpeg"
            // PNG: 89 50 4E 47 0D 0A 1A 0A
            imageBytes.size >= 8 && imageBytes[0] == 0x89.toByte() && imageBytes[1] == 0x50.toByte() && 
            imageBytes[2] == 0x4E.toByte() && imageBytes[3] == 0x47.toByte() -> "image/png"
            // GIF: 47 49 46 38
            imageBytes.size >= 4 && imageBytes[0] == 0x47.toByte() && imageBytes[1] == 0x49.toByte() && 
            imageBytes[2] == 0x46.toByte() && imageBytes[3] == 0x38.toByte() -> "image/gif"
            // WebP: RIFF...WEBP
            imageBytes.size >= 12 && imageBytes[0] == 0x52.toByte() && imageBytes[1] == 0x49.toByte() && 
            imageBytes[2] == 0x46.toByte() && imageBytes[3] == 0x46.toByte() &&
            imageBytes[8] == 0x57.toByte() && imageBytes[9] == 0x45.toByte() && 
            imageBytes[10] == 0x42.toByte() && imageBytes[11] == 0x50.toByte() -> "image/webp"
            else -> "image/jpeg" // 默认为JPEG
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
            var tag = audioFile.tag
            
            // 如果文件没有现有标签，创建一个新的标签
            if (tag == null) {
                tag = audioFile.createDefaultTag()
                android.util.Log.i("Mp3UtilModule", "Created new tag for file: $filePath")
            }
            
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
            
            // 如果有封面路径，使用完全无ImageIO依赖的方法设置封面
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
                        // 网络URL - 使用Android原生网络请求
                        coverPath.startsWith("http://") || coverPath.startsWith("https://") -> {
                            downloadImageBytes(coverPath)
                        }
                        else -> null
                    }
                    
                    if (coverBytes != null && coverBytes.isNotEmpty()) {
                        // 删除现有封面
                        tag.deleteArtworkField()
                        
                        // 使用完全无ImageIO依赖的封面设置方法
                        val success = setCoverArtImageIOFree(tag, coverBytes, file.extension.lowercase())
                        if (success) {
                            android.util.Log.i("Mp3UtilModule", "Successfully set cover art for ${file.name}")
                        } else {
                            android.util.Log.w("Mp3UtilModule", "Failed to set cover art for ${file.name}, but continuing with other tags")
                        }
                    } else {
                        android.util.Log.w("Mp3UtilModule", "Failed to obtain cover bytes from: $coverPath")
                    }
                } catch (e: Exception) {
                    // 封面设置失败不影响其他标签，但记录错误
                    android.util.Log.w("Mp3UtilModule", "Failed to download/process cover: ${e.message}", e)
                }
            }
            
            audioFile.commit()
            android.util.Log.i("Mp3UtilModule", "Successfully committed all changes to ${file.name}")
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "Failed to set media tag with cover: ${e.message}", e)
            promise.reject("Error", e.message)
        }
    }

    @ReactMethod
    fun downloadWithSystemManager(
        url: String,
        destinationPath: String,
        title: String,
        description: String,
        headers: ReadableMap?,
        promise: Promise
    ) {
        try {
            android.util.Log.i("Mp3UtilModule", "系统下载管理器开始下载: url=$url, path=$destinationPath, title=$title")
            
            val downloadManager = reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val request = DownloadManager.Request(Uri.parse(url))
            
            // 设置下载标题和描述
            request.setTitle(title)
            request.setDescription(description)
            
            // 设置下载目标路径
            val file = File(destinationPath)
            request.setDestinationUri(Uri.fromFile(file))
            
            // 隐藏系统下载通知，统一由应用自定义通知显示
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_HIDDEN)
            request.setAllowedOverMetered(true)
            request.setAllowedOverRoaming(true)
            
            // 设置请求头
            headers?.let { headersMap ->
                val iterator = headersMap.keySetIterator()
                while (iterator.hasNextKey()) {
                    val key = iterator.nextKey()
                    val value = headersMap.getString(key)
                    if (value != null) {
                        request.addRequestHeader(key, value)
                    }
                }
            }
            
            // 开始下载
            val downloadId = downloadManager.enqueue(request)
            android.util.Log.i("Mp3UtilModule", "✅ 系统下载任务创建成功: downloadId=$downloadId")
            promise.resolve(downloadId.toString())
            
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "❌ 系统下载任务创建失败: ${e.message}", e)
            // 提供友好的错误提示
            if (e.message?.contains("Unsupported path") == true) {
                promise.reject("UnsupportedPath", "Android系统不支持该下载路径，请在设置中更改为系统支持的路径（如Music目录）")
            } else {
                promise.reject("DownloadError", e.message)
            }
        }
    }

    // ================== Internal HTTP downloader with Notification ==================

    private val DOWNLOAD_CHANNEL_ID = "musicfree_downloads"
    private val DOWNLOAD_GROUP_KEY = "fun.xwj.musicfree.DOWNLOAD_GROUP"
    // Track active notification IDs to manage cleanup
    private val activeNotificationIds = java.util.concurrent.ConcurrentHashMap<String, Int>()

    /**
     * 格式化文件大小显示
     */
    private fun formatFileSize(bytes: Long): String {
        return when {
            bytes <= 0 -> "0B"
            bytes < 1024 -> "${bytes}B"
            bytes < 1024 * 1024 -> String.format("%.1fKB", bytes / 1024.0)
            bytes < 1024 * 1024 * 1024 -> String.format("%.1fMB", bytes / (1024.0 * 1024))
            else -> String.format("%.1fGB", bytes / (1024.0 * 1024 * 1024))
        }
    }

    private fun ensureDownloadChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (mgr.getNotificationChannel(DOWNLOAD_CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    DOWNLOAD_CHANNEL_ID,
                    "音乐下载",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "显示音乐下载进度"
                    setShowBadge(false)
                    enableVibration(false)
                    setSound(null, null)
                }
                mgr.createNotificationChannel(channel)
            }
        }
    }

    /**
     * 构建下载进度通知
     */
    private fun buildProgressNotification(
        title: String,
        progress: Int,
        indeterminate: Boolean,
        downloaded: Long = 0,
        total: Long = 0
    ): NotificationCompat.Builder {
        // 构建详细的进度文本
        val progressText = when {
            total > 0 && !indeterminate -> {
                "${formatFileSize(downloaded)} / ${formatFileSize(total)}"
            }
            downloaded > 0 -> {
                "已下载 ${formatFileSize(downloaded)}"
            }
            else -> {
                "正在准备下载..."
            }
        }

        return NotificationCompat.Builder(reactApplicationContext, DOWNLOAD_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(progressText)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setProgress(100, progress, indeterminate)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setSilent(true)
            .setGroup(DOWNLOAD_GROUP_KEY)
            .setStyle(NotificationCompat.BigPictureStyle())  // 使用BigPictureStyle以更好地显示封面
    }

    private fun emitEvent(name: String, data: WritableMap) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, data)
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun downloadWithHttp(options: ReadableMap, promise: Promise) {
        Thread {
            // Variables used across try/catch
            var titleStr: String = "MusicFree"
            var showNotificationFlag: Boolean = true
            try {
                ensureDownloadChannel()
                val notifId = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
                val notifier = NotificationManagerCompat.from(reactApplicationContext)

                // Use singleton client to avoid resource exhaustion
                val client = downloadClient

                // Parse options early and keep variables visible to catch/finally
                // url: allow string or nested map { url|uri|href }
                val url: String = when (options.getType("url")) {
                    ReadableType.String -> options.getString("url")!!
                    ReadableType.Map -> {
                        val m = options.getMap("url")
                        m?.getString("url") ?: m?.getString("uri") ?: m?.getString("href")
                        ?: throw IllegalArgumentException("url required")
                    }
                    else -> throw IllegalArgumentException("url required")
                }
                // destinationPath: allow string or nested { path }
                val destinationPath: String = when (options.getType("destinationPath")) {
                    ReadableType.String -> options.getString("destinationPath")!!
                    ReadableType.Map -> options.getMap("destinationPath")?.getString("path")
                        ?: throw IllegalArgumentException("destinationPath required")
                    else -> throw IllegalArgumentException("destinationPath required")
                }
                val titleStr = options.getString("title") ?: "MusicFree"
                val description = options.getString("description") ?: "正在下载音乐文件..."
                showNotificationFlag = if (options.hasKey("showNotification")) options.getBoolean("showNotification") else true
                val coverUrl = if (options.hasKey("coverUrl")) options.getString("coverUrl") else null
                val headers = if (options.hasKey("headers")) options.getMap("headers") else null

                val hBuilder = Headers.Builder()
                headers?.let { map ->
                    val it = map.keySetIterator()
                    while (it.hasNextKey()) {
                        val k = it.nextKey()
                        val v = map.getString(k)
                        if (v != null) hBuilder.add(k, v)
                    }
                }
                val req = Request.Builder().url(url).headers(hBuilder.build()).get().build()
                val call = client.newCall(req)
                var httpId: String = "http:$notifId"
                registerCall(httpId, call)
                // Track notification ID for cleanup
                activeNotificationIds[httpId] = notifId
                val resp = call.execute()
                if (!resp.isSuccessful) throw IOException("HTTP ${'$'}{resp.code}")

                val body = resp.body ?: throw IOException("Empty body")
                val total = body.contentLength() // -1 if unknown

                // Prepare file
                val outFile = File(destinationPath)
                val parent = outFile.parentFile
                if (parent != null && !parent.exists()) parent.mkdirs()
                if (outFile.exists()) outFile.delete()

                var lastNotify = 0L
                var lastEmit = 0L
                var downloaded = 0L
                val buffer = ByteArray(64 * 1024)
                // 取消意图
                val cancelIntent = Intent(reactApplicationContext, DownloadActionReceiver::class.java).apply {
                    action = ACTION_CANCEL
                    putExtra(EXTRA_ID, httpId)
                }
                val cancelPending = PendingIntent.getBroadcast(
                    reactApplicationContext,
                    notifId,
                    cancelIntent,
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE else PendingIntent.FLAG_UPDATE_CURRENT
                )

                // 大图标封面 - 提前加载确保通知一开始就显示
                var largeIcon: Bitmap? = null
                if (!coverUrl.isNullOrEmpty()) {
                    try {
                        val bytes = downloadImageBytes(coverUrl)
                        if (bytes != null) {
                            // 解码并缩放图片到合适大小（避免过大）
                            val options = BitmapFactory.Options()
                            options.inSampleSize = 1 // 可根据需要调整采样率
                            largeIcon = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)

                            // 如果图片太大，进行缩放
                            if (largeIcon != null) {
                                val maxSize = 256 // 最大尺寸（像素）
                                val width = largeIcon.width
                                val height = largeIcon.height

                                if (width > maxSize || height > maxSize) {
                                    val scale = Math.min(maxSize.toFloat() / width, maxSize.toFloat() / height)
                                    val newWidth = (width * scale).toInt()
                                    val newHeight = (height * scale).toInt()
                                    largeIcon = Bitmap.createScaledBitmap(largeIcon, newWidth, newHeight, true)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("Mp3UtilModule", "Failed to load cover for notification: ${e.message}")
                    }
                }

                // 初始通知（带封面）
                if (showNotificationFlag) {
                    val initialBuilder = buildProgressNotification(
                        titleStr,
                        0,
                        true,
                        0,
                        0
                    ).setLargeIcon(largeIcon)
                    try {
                        notifier.notify(notifId, initialBuilder.build())
                    } catch (_: Exception) {}
                }
                body.byteStream().use { input ->
                    BufferedInputStream(input).use { bin ->
                        FileOutputStream(outFile).use { fos ->
                            BufferedOutputStream(fos).use { bout ->
                                while (true) {
                                    val read = bin.read(buffer)
                                    if (read == -1) break
                                    bout.write(buffer, 0, read)
                                    downloaded += read

                                    val now = System.currentTimeMillis()
                                    if (showNotificationFlag && now - lastNotify > 500) {
                                        lastNotify = now
                                        val percent = if (total > 0) ((downloaded * 100 / total).toInt()) else 0
                                        val builder = buildProgressNotification(
                                            titleStr,
                                            percent,
                                            total <= 0,
                                            downloaded,
                                            total
                                        )
                                            .setLargeIcon(largeIcon)
                                            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "取消", cancelPending)
                                        try { notifier.notify(notifId, builder.build()) } catch (_: Exception) {}

                                        // 与通知同步地发送JS事件，确保进度显示一致
                                        lastEmit = now
                                        val progressText = when {
                                            total > 0 -> "${formatFileSize(downloaded)} / ${formatFileSize(total)}"
                                            downloaded > 0 -> "已下载 ${formatFileSize(downloaded)}"
                                            else -> "正在准备下载..."
                                        }
                                        val map = Arguments.createMap().apply {
                                            putString("id", httpId)
                                            putDouble("downloaded", downloaded.toDouble())
                                            putDouble("total", if (total > 0) total.toDouble() else -1.0)
                                            putString("destinationPath", outFile.absolutePath)
                                            putString("title", titleStr)
                                            putString("progressText", progressText)
                                            putInt("percent", percent)
                                        }
                                        emitEvent("Mp3UtilDownloadProgress", map)
                                    }
                                    // 当不显示通知时，仍然以较高频率向JS发送事件
                                    if (!showNotificationFlag && now - lastEmit > 300) {
                                        lastEmit = now
                                        val progressText = when {
                                            total > 0 -> "${formatFileSize(downloaded)} / ${formatFileSize(total)}"
                                            downloaded > 0 -> "已下载 ${formatFileSize(downloaded)}"
                                            else -> "正在准备下载..."
                                        }
                                        val map = Arguments.createMap().apply {
                                            putString("id", httpId)
                                            putDouble("downloaded", downloaded.toDouble())
                                            putDouble("total", if (total > 0) total.toDouble() else -1.0)
                                            putString("destinationPath", outFile.absolutePath)
                                            putString("title", titleStr)
                                            putString("progressText", progressText)
                                        }
                                        emitEvent("Mp3UtilDownloadProgress", map)
                                    }
                                }
                                bout.flush()
                            }
                        }
                    }
                }

                if (showNotificationFlag) {
                    try {
                        // 打开文件意图
                        val openIntent = Intent(Intent.ACTION_VIEW).apply {
                            val uri = try {
                                FileProvider.getUriForFile(
                                    reactApplicationContext,
                                    reactApplicationContext.packageName + ".fileprovider",
                                    outFile
                                )
                            } catch (e: Exception) {
                                Uri.fromFile(outFile)
                            }
                            val mime = try {
                                val ext = outFile.extension.lowercase()
                                MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "audio/*"
                            } catch (e: Exception) { "audio/*" }
                            setDataAndType(uri, mime)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        val openPending = PendingIntent.getActivity(
                            reactApplicationContext,
                            notifId,
                            openIntent,
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE else PendingIntent.FLAG_UPDATE_CURRENT
                        )

                        // 下载完成通知 - 保持封面显示
                        val finalSize = formatFileSize(downloaded)
                        // Use a new notification ID for completion to allow auto-dismiss
                        val completeNotifId = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
                        val done = NotificationCompat.Builder(reactApplicationContext, DOWNLOAD_CHANNEL_ID)
                            .setSmallIcon(android.R.drawable.stat_sys_download_done)
                            .setContentTitle("下载完成")
                            .setContentText(titleStr)
                            .setSubText(finalSize)
                            .setLargeIcon(largeIcon)  // 显示封面
                            .setOngoing(false)
                            .setAutoCancel(true)
                            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                            .setContentIntent(openPending)
                            .setCategory(NotificationCompat.CATEGORY_STATUS)
                            .setGroup(DOWNLOAD_GROUP_KEY)
                            .setTimeoutAfter(5000)  // Auto-dismiss after 5 seconds
                            .setStyle(NotificationCompat.BigPictureStyle()
                                .bigPicture(largeIcon)  // 大图样式显示封面
                                .bigLargeIcon(null as Bitmap?))  // 隐藏右侧小图标，让大图更突出
                            .addAction(android.R.drawable.ic_menu_view, "打开文件", openPending)
                            .build()
                        // Cancel the progress notification first
                        notifier.cancel(notifId)
                        // Show completion notification with new ID
                        notifier.notify(completeNotifId, done)
                        // Remove from tracking
                        activeNotificationIds.remove(httpId)
                    } catch (_: Exception) {}
                }

                // Resolve with a pseudo id so caller can log
                promise.resolve(httpId)
                try {
                    val map = Arguments.createMap().apply {
                        putString("id", httpId)
                        putString("destinationPath", outFile.absolutePath)
                        putString("title", titleStr)
                    }
                    emitEvent("Mp3UtilDownloadCompleted", map)
                } catch (_: Exception) {}
            } catch (e: Exception) {
                try {
                    if (showNotificationFlag) {
                        val notifier = NotificationManagerCompat.from(reactApplicationContext)
                        val fail = NotificationCompat.Builder(reactApplicationContext, DOWNLOAD_CHANNEL_ID)
                            .setSmallIcon(android.R.drawable.stat_notify_error)
                            .setContentTitle("下载失败")
                            .setContentText(titleStr)
                            .setOngoing(false)
                            .setPriority(NotificationCompat.PRIORITY_LOW)
                            .setGroup(DOWNLOAD_GROUP_KEY)
                            .setTimeoutAfter(8000)  // Auto-dismiss after 8 seconds
                            .setStyle(NotificationCompat.BigTextStyle().bigText(titleStr))
                            .build()
                        notifier.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), fail)
                    }
                } catch (_: Exception) {}
                promise.reject("HttpDownloadError", e.message)
                try {
                    val map = Arguments.createMap().apply {
                        putString("id", "http:${'$'}notifId")
                        putString("error", e.message)
                        putBoolean("canceled", (e.message ?: "").contains("Canceled", ignoreCase = true))
                    }
                    val evt = if ((e.message ?: "").contains("Canceled", ignoreCase = true)) "Mp3UtilDownloadCancelled" else "Mp3UtilDownloadError"
                    emitEvent(evt, map)
                } catch (_: Exception) {}
            } finally {
                try {
                    removeCall("http:${'$'}notifId")
                    activeNotificationIds.remove("http:${'$'}notifId")
                } catch (_: Exception) {}
            }
        }.start()
    }

    @ReactMethod
    fun cancelHttpDownload(id: String, promise: Promise) {
        try {
            cancelCall(id)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CancelError", e.message)
        }
    }

    @ReactMethod
    fun cancelSystemDownload(id: String, promise: Promise) {
        try {
            val dm = reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val longId = id.toLongOrNull()
            if (longId != null) {
                dm.remove(longId)
                promise.resolve(true)
            } else {
                promise.reject("InvalidId", "Not a numeric id")
            }
        } catch (e: Exception) {
            promise.reject("CancelError", e.message)
        }
    }

    class DownloadActionReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == ACTION_CANCEL) {
                val id = intent.getStringExtra(EXTRA_ID)
                if (id != null) {
                    try { cancelCall(id) } catch (_: Exception) {}
                    try {
                        val mgr = NotificationManagerCompat.from(context)
                        val nid = id.substringAfter("http:").toIntOrNull()
                        if (nid != null) mgr.cancel(nid)
                    } catch (_: Exception) {}
                }
            }
        }
    }

    // ================== MFLAC (QMCv2) Decrypt Support ==================

    private val ROUNDS = 16
    private val DELTA: Long = 0x9e3779b9L
    private val SALT_LEN = 2
    private val ZERO_LEN = 7
    private val FIXED_PADDING_LEN = 1 + SALT_LEN + ZERO_LEN
    private val EKEY_V2_PREFIX = "UVFNdXNpYyBFbmNWMixLZXk6" // base64("QQMusic EncV2,Key:")
    private val EKEY_V2_KEY1 = byteArrayOf(
        0x33, 0x38, 0x36, 0x5a, 0x4a, 0x59, 0x21, 0x40,
        0x23, 0x2a, 0x24, 0x25, 0x5e, 0x26, 0x29, 0x28
    ).map { it.toByte() }.toByteArray()
    private val EKEY_V2_KEY2 = byteArrayOf(
        0x2a, 0x2a, 0x23, 0x21, 0x28, 0x23, 0x24, 0x25,
        0x26, 0x5e, 0x61, 0x31, 0x63, 0x5a, 0x2c, 0x54
    ).map { it.toByte() }.toByteArray()

    private fun toUInt32(v: Long): Long = v and 0xffffffffL
    private fun readU32BE(b: ByteArray, off: Int): Long {
        return ((b[off].toLong() and 0xff) shl 24) or
                ((b[off + 1].toLong() and 0xff) shl 16) or
                ((b[off + 2].toLong() and 0xff) shl 8) or
                (b[off + 3].toLong() and 0xff)
    }
    private fun writeU32BE(b: ByteArray, off: Int, v: Long) {
        b[off] = ((v ushr 24) and 0xff).toByte()
        b[off + 1] = ((v ushr 16) and 0xff).toByte()
        b[off + 2] = ((v ushr 8) and 0xff).toByte()
        b[off + 3] = (v and 0xff).toByte()
    }

    private fun parseKey(key: ByteArray): LongArray {
        require(key.size == 16) { "Key must be 16 bytes" }
        return longArrayOf(
            readU32BE(key, 0),
            readU32BE(key, 4),
            readU32BE(key, 8),
            readU32BE(key, 12)
        )
    }

    private fun ecbSingleRound(value: Long, sum: Long, key1: Long, key2: Long): Long {
        val left = toUInt32(((value shl 4) + key1))
        val right = toUInt32(((value ushr 5) + key2))
        val mid = toUInt32(sum + value)
        return toUInt32(left xor mid xor right)
    }

    private fun decryptBlock(blockHi: Long, blockLo: Long, keyWords: LongArray): Pair<Long, Long> {
        var y = toUInt32(blockHi)
        var z = toUInt32(blockLo)
        var sum = toUInt32(DELTA * ROUNDS)
        var round = 0
        while (round < ROUNDS) {
            val tmp1 = ecbSingleRound(y, sum, keyWords[2], keyWords[3])
            z = toUInt32(z - tmp1)
            val tmp0 = ecbSingleRound(z, sum, keyWords[0], keyWords[1])
            y = toUInt32(y - tmp0)
            sum = toUInt32(sum - DELTA)
            round++
        }
        return Pair(y, z)
    }

    private fun xor64(aHi: Long, aLo: Long, bHi: Long, bLo: Long): Pair<Long, Long> {
        return Pair(toUInt32(aHi xor bHi), toUInt32(aLo xor bLo))
    }

    private fun tcTeaDecrypt(cipher: ByteArray, key: ByteArray): ByteArray {
        val keyWords = parseKey(key)
        require(cipher.size % 8 == 0 && cipher.size >= FIXED_PADDING_LEN) { "Invalid cipher length" }
        val plain = ByteArray(cipher.size)
        var iv1Hi = 0L
        var iv1Lo = 0L
        var iv2Hi = 0L
        var iv2Lo = 0L
        var off = 0
        while (off < cipher.size) {
            val cHi = readU32BE(cipher, off)
            val cLo = readU32BE(cipher, off + 4)
            val xHi = toUInt32(cHi xor iv2Hi)
            val xLo = toUInt32(cLo xor iv2Lo)
            val d = decryptBlock(xHi, xLo, keyWords)
            val p = xor64(d.first, d.second, iv1Hi, iv1Lo)
            writeU32BE(plain, off, p.first)
            writeU32BE(plain, off + 4, p.second)
            iv1Hi = cHi
            iv1Lo = cLo
            iv2Hi = d.first
            iv2Lo = d.second
            off += 8
        }
        val padSize = (plain[0].toInt() and 0x7)
        val start = 1 + padSize + SALT_LEN
        val end = cipher.size - ZERO_LEN
        // verify zero tail
        for (i in end until plain.size) {
            if (plain[i].toInt() != 0) throw RuntimeException("Invalid padding")
        }
        return plain.copyOfRange(start, end)
    }

    private fun makeSimpleKey(len: Int = 8): ByteArray {
        val result = ByteArray(len)
        var i = 0
        while (i < len) {
            val value = 106.0 + i * 0.1
            val tan = kotlin.math.tan(value)
            val scaled = kotlin.math.abs(tan) * 100.0
            result[i] = (scaled.toInt() and 0xff).toByte()
            i++
        }
        return result
    }

    private fun decryptEKeyV1(base64: String): ByteArray {
        val decoded = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
        require(decoded.size >= 12) { "EKey too short" }
        val header = decoded.copyOfRange(0, 8)
        val cipher = decoded.copyOfRange(8, decoded.size)
        val simpleKey = makeSimpleKey()
        val teaKey = ByteArray(16)
        for (i in 0 until 8) {
            teaKey[i * 2] = simpleKey[i]
            teaKey[i * 2 + 1] = header[i]
        }
        val recovered = tcTeaDecrypt(cipher, teaKey)
        return header + recovered
    }

    private fun decryptEKeyV2(base64: String): ByteArray {
        var payload = base64
        if (payload.startsWith(EKEY_V2_PREFIX)) payload = payload.substring(EKEY_V2_PREFIX.length)
        var data = android.util.Base64.decode(payload, android.util.Base64.DEFAULT)
        data = tcTeaDecrypt(data, EKEY_V2_KEY1)
        data = tcTeaDecrypt(data, EKEY_V2_KEY2)
        // trim trailing zeros
        var end = data.size
        while (end > 0 && data[end - 1].toInt() == 0) end--
        val trimmed = String(data.copyOfRange(0, end))
        return decryptEKeyV1(trimmed)
    }

    private fun decryptEKey(base64: String): ByteArray {
        return if (base64.startsWith(EKEY_V2_PREFIX)) decryptEKeyV2(base64) else decryptEKeyV1(base64)
    }

    private object QmcHelper {
        fun calculateQMCHash(key: ByteArray): Double {
            var hash = 1L // u32 logic
            for (b in key) {
                val v = (b.toInt() and 0xff)
                if (v == 0) continue
                val next = (hash * v) and 0xffffffffL
                if (next == 0L || next <= hash) break
                hash = next
            }
            return (hash and 0xffffffffL).toDouble()
        }

        fun getSegmentKey(id: Long, seed: Int, hash: Double): Long {
            if (seed == 0) return 0L
            val denominator = ((id + 1L) * seed.toLong()).toDouble()
            val result = (hash / denominator) * 100.0
            return kotlin.math.floor(result).toLong()
        }

        fun keyCompress(longKey: ByteArray): ByteArray {
            val INDEX_OFFSET = 71214
            val V1_KEY_SIZE = 128
            require(longKey.isNotEmpty()) { "Key is empty" }
            val n = longKey.size
            val result = ByteArray(V1_KEY_SIZE)
            var i = 0
            while (i < V1_KEY_SIZE) {
                val index = (i * i + INDEX_OFFSET) % n
                val key = longKey[index].toInt() and 0xff
                val shift = (index + 4) % 8
                val leftShift = (key shl shift) and 0xff
                val rightShift = (key ushr shift) and 0xff
                result[i] = (leftShift or rightShift).toByte()
                i++
            }
            return result
        }

        fun qmc1Transform(key: ByteArray, value: Int, offset: Int): Int {
            val V1_OFFSET_BOUNDARY = 0x7FFF
            val V1_KEY_SIZE = 128
            var off = offset
            if (off > V1_OFFSET_BOUNDARY) off %= V1_OFFSET_BOUNDARY
            return value xor (key[off % V1_KEY_SIZE].toInt() and 0xff)
        }
    }

    private class RC4(private val key: ByteArray) {
        private val n = key.size
        private val state = ByteArray(n)
        private var i = 0
        private var j = 0
        init {
            require(n > 0) { "RC4 requires non-empty key" }
            var idx = 0
            while (idx < n) { state[idx] = (idx and 0xff).toByte(); idx++ }
            var jj = 0
            var ii = 0
            while (ii < n) {
                jj = (jj + (state[ii].toInt() and 0xff) + (key[ii % n].toInt() and 0xff)) % n
                val tmp = state[ii]; state[ii] = state[jj]; state[jj] = tmp
                ii++
            }
            i = 0; j = 0
        }
        private fun generate(): Int {
            i = (i + 1) % n
            j = (j + (state[i].toInt() and 0xff)) % n
            val tmp = state[i]; state[i] = state[j]; state[j] = tmp
            val iVal = state[i].toInt() and 0xff
            val jVal = state[j].toInt() and 0xff
            val index = (iVal + jVal) % n
            return state[index].toInt() and 0xff
        }
        fun derive(buf: ByteArray) {
            var k = 0
            while (k < buf.size) { buf[k] = (buf[k].toInt() xor generate()).toByte(); k++ }
        }
    }

    private class QMC2Decoder(private val rawKey: ByteArray) {
        private val mode: String
        private val compressedKey: ByteArray?
        private val key: ByteArray?
        private val hash: Double
        private val keyStream: ByteArray?
        init {
            val keyLen = rawKey.size
            require(keyLen > 0) { "Key is empty" }
            if (keyLen <= 300) {
                mode = "MapL"
                compressedKey = QmcHelper.keyCompress(rawKey)
                key = null
                keyStream = null
                hash = 0.0
            } else {
                mode = "RC4"
                compressedKey = null
                key = rawKey
                hash = QmcHelper.calculateQMCHash(rawKey)
                val RC4_STREAM_CACHE_SIZE = 0x1400 + 512
                val rc4 = RC4(rawKey)
                keyStream = ByteArray(RC4_STREAM_CACHE_SIZE)
                rc4.derive(keyStream)
            }
        }

        fun decryptChunk(buf: ByteArray, startOffset: Long) {
            if (mode == "MapL") {
                val ck = compressedKey!!
                var i = 0
                val base = startOffset.toInt()
                while (i < buf.size) {
                    val v = buf[i].toInt() and 0xff
                    buf[i] = QmcHelper.qmc1Transform(ck, v, base + i).toByte()
                    i++
                }
                return
            }
            // RC4 mode
            val FIRST_SEGMENT_SIZE = 0x80
            val OTHER_SEGMENT_SIZE = 0x1400
            val k = key!!
            val ks = keyStream!!
            val n = k.size
            var offset = startOffset.toInt()
            var position = 0
            fun processFirst(data: ByteArray, off: Int) {
                var i = 0
                while (i < data.size) {
                    val current = off + i
                    val seed = k[current % n].toInt() and 0xff
                    val idx = QmcHelper.getSegmentKey(current.toLong(), seed, hash)
                    val keyIdx = (idx % n).toInt()
                    data[i] = (data[i].toInt() xor (k[keyIdx].toInt() and 0xff)).toByte()
                    i++
                }
            }
            fun processOther(data: ByteArray, off: Int) {
                val id = kotlin.math.floor(off.toDouble() / OTHER_SEGMENT_SIZE).toInt()
                val blockOffset = off % OTHER_SEGMENT_SIZE
                val seed = k[id % n].toInt() and 0xff
                val skip = (QmcHelper.getSegmentKey(id.toLong(), seed, hash) and 0x1ff).toInt()
                var i = 0
                while (i < data.size) {
                    val streamIdx = skip + blockOffset + i
                    if (streamIdx < ks.size) {
                        data[i] = (data[i].toInt() xor (ks[streamIdx].toInt() and 0xff)).toByte()
                    }
                    i++
                }
            }
            if (offset < FIRST_SEGMENT_SIZE) {
                val len = kotlin.math.min(FIRST_SEGMENT_SIZE - offset, buf.size)
                if (len > 0) {
                    val seg = buf.copyOfRange(position, position + len)
                    processFirst(seg, offset)
                    // copy back
                    System.arraycopy(seg, 0, buf, position, len)
                    position += len
                    offset += len
                }
            }
            if (offset >= FIRST_SEGMENT_SIZE && offset % OTHER_SEGMENT_SIZE != 0) {
                val excess = offset % OTHER_SEGMENT_SIZE
                val alignment = kotlin.math.min(OTHER_SEGMENT_SIZE - excess, buf.size - position)
                if (alignment > 0) {
                    val seg = buf.copyOfRange(position, position + alignment)
                    processOther(seg, offset)
                    System.arraycopy(seg, 0, buf, position, alignment)
                    position += alignment
                    offset += alignment
                }
            }
            while (position < buf.size) {
                val segment = kotlin.math.min(OTHER_SEGMENT_SIZE, buf.size - position)
                val seg = buf.copyOfRange(position, position + segment)
                processOther(seg, offset)
                System.arraycopy(seg, 0, buf, position, segment)
                position += segment
                offset += segment
            }
        }
    }

    private fun normalizeEkey(input: String): String {
        val s = input.trim()
        return if (s.length > 704) s.takeLast(704) else s
    }

    @ReactMethod
    fun decryptMflacToFlac(inputPath: String, outputPath: String, rawEkey: String, promise: Promise) {
        try {
            val inFile = File(inputPath)
            if (!inFile.exists()) {
                android.util.Log.e("Mp3UtilModule", "[Decrypt] Input not found: $inputPath")
                promise.reject("InputNotFound", "Input file not found: $inputPath")
                return
            }
            val parent = File(outputPath).parentFile
            if (parent != null && !parent.exists()) parent.mkdirs()

            val cleaned = normalizeEkey(rawEkey)
            android.util.Log.i("Mp3UtilModule", "[Decrypt] ekey length raw=${rawEkey.length} cleaned=${cleaned.length}")
            val key = decryptEKey(cleaned)
            val decoder = QMC2Decoder(key)

            val bufferSize = 128 * 1024
            var absoluteOffset = 0L
            inFile.inputStream().use { ins ->
                FileOutputStream(outputPath).use { outs ->
                    val buf = ByteArray(bufferSize)
                    while (true) {
                        val read = ins.read(buf)
                        if (read <= 0) break
                        val chunk = if (read == buf.size) buf else buf.copyOf(read)
                        decoder.decryptChunk(chunk, absoluteOffset)
                        outs.write(chunk)
                        absoluteOffset += read
                    }
                    outs.flush()
                }
            }
            android.util.Log.i("Mp3UtilModule", "[Decrypt] Done -> $outputPath")
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "[Decrypt] Error: ${e.message}", e)
            promise.reject("DecryptError", e)
        }
    }

    // ================== Local HTTP Proxy for streaming mflac ==================
    private object MflacProxy {
        private var started = false
        private var port = 17173
        private val sessions = ConcurrentHashMap<String, Session>()
        private val client: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(8, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
            .writeTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()

        data class Session(
            val token: String,
            val src: String,
            val ekey: ByteArray,
            val headers: Map<String, String> = emptyMap(),
            @Volatile var totalLength: Long? = null,
            @Volatile var supportsRange: Boolean? = null,
        )

        private class DecryptingInputStream(
            private val upstream: InputStream,
            private val decoder: QMC2Decoder,
            private var absoluteOffset: Long,
        ) : InputStream() {
            private val buf = ByteArray(128 * 1024)
            override fun read(): Int {
                val one = ByteArray(1)
                val n = read(one, 0, 1)
                return if (n == -1) -1 else (one[0].toInt() and 0xff)
            }
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                val toRead = if (len < buf.size) len else buf.size
                val n = upstream.read(buf, 0, toRead)
                if (n <= 0) return -1
                val chunk = if (n == buf.size) buf else buf.copyOf(n)
                decoder.decryptChunk(chunk, absoluteOffset)
                System.arraycopy(chunk, 0, b, off, n)
                absoluteOffset += n
                return n
            }
            override fun close() { upstream.close() }
        }

        private class Server(private val proxy: MflacProxy) : NanoHTTPD("127.0.0.1", port) {
            override fun serve(session: IHTTPSession): Response {
                try {
                    if (session.method == Method.HEAD) {
                        val t = parseToken(session.uri)
                        val s = proxy.sessions[t] ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "unknown token")
                        val total = proxy.fetchTotalLength(s) ?: -1L
                        val resp = newFixedLengthResponse(Response.Status.OK, "audio/flac", "")
                        resp.addHeader("Accept-Ranges", "bytes")
                        if (total > 0) resp.addHeader("Content-Length", total.toString())
                        return resp
                    }

                    if (session.method != Method.GET) {
                        return newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED, "text/plain", "method not allowed")
                    }
                    val token = parseToken(session.uri)
                    val s = proxy.sessions[token] ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "unknown token")

                    val rangeHeader = session.headers["range"] ?: session.headers["Range"]
                    val (start, end) = parseRange(rangeHeader)
                    val reqBuilderBase = Request.Builder().url(s.src)
                        .addHeader("Accept-Encoding", "identity")
                    s.headers.forEach { (k, v) -> reqBuilderBase.addHeader(k, v) }

                    // decide whether to send Range based on known support (if false, don't send Range)
                    val attemptRange = start != null && s.supportsRange != false
                    val reqBuilder = if (attemptRange) {
                        val rangeVal = if (end != null) "bytes=${start}-${end}" else "bytes=${start}-"
                        reqBuilderBase.addHeader("Range", rangeVal)
                    } else reqBuilderBase

                    var resp = proxy.executeWithRetry(reqBuilder.build(), 2)
                    val code = resp.code
                    val body = resp.body ?: return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "no body")
                    val contentLenHdr = resp.header("Content-Length")
                    val contentRangeHdr = resp.header("Content-Range")
                    val total = extractTotalFromContentRange(contentRangeHdr)
                    if (total != null) s.totalLength = total

                    // update supportsRange flag
                    s.supportsRange = when {
                        code == 206 -> true
                        attemptRange && code == 200 -> false
                        s.supportsRange == null -> s.supportsRange // keep unknown
                        else -> s.supportsRange
                    }

                    val effectiveStart = start ?: 0L

                    // If upstream ignored Range (code 200) but we need offset, synthesize by skipping
                    val upstreamStream = BufferedInputStream(body.byteStream())
                    val baseStream = if (attemptRange && code != 206 && effectiveStart > 0L) {
                        // Create a stream that decrypts and discards until reaching offset
                        SkippingDecryptInputStream(upstreamStream, QMC2Decoder(s.ekey), effectiveStart)
                    } else {
                        DecryptingInputStream(upstreamStream, QMC2Decoder(s.ekey), effectiveStart)
                    }

                    val length = contentLenHdr?.toLongOrNull() ?: -1L
                    val status = if ((code == 206) || (attemptRange && effectiveStart > 0L)) Response.Status.PARTIAL_CONTENT else Response.Status.OK
                    val response = if (length > 0 && code != 200) newFixedLengthResponse(status, "audio/flac", baseStream, length) else newChunkedResponse(status, "audio/flac", baseStream)
                    response.addHeader("Accept-Ranges", "bytes")
                    if (start != null && total != null && length > 0) {
                        val endPos = if (end != null) end else start + length - 1
                        response.addHeader("Content-Range", "bytes ${start}-${endPos}/${total}")
                    }
                    return response
                } catch (e: Exception) {
                    return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error")
                }
            }

            // decrypts upstream while discarding decrypted bytes until reaching target offset
            private class SkippingDecryptInputStream(
                upstream: InputStream,
                decoder: QMC2Decoder,
                private val targetOffset: Long,
            ) : InputStream() {
                private val inner = DecryptingInputStream(upstream, decoder, 0L)
                private var skipped = 0L
                private var primed = false
                private fun ensureSkip() {
                    if (primed) return
                    val buf = ByteArray(64 * 1024)
                    while (skipped < targetOffset) {
                        val need = (targetOffset - skipped).coerceAtMost(buf.size.toLong()).toInt()
                        val n = inner.read(buf, 0, need)
                        if (n <= 0) break
                        skipped += n
                    }
                    primed = true
                }
                override fun read(): Int {
                    ensureSkip()
                    return inner.read()
                }
                override fun read(b: ByteArray, off: Int, len: Int): Int {
                    ensureSkip()
                    return inner.read(b, off, len)
                }
                override fun close() { inner.close() }
            }

            private fun parseToken(uri: String): String {
                // /m/<token>
                val parts = uri.trim('/').split('/')
                if (parts.size >= 2 && parts[0] == "m") return parts[1]
                throw IllegalArgumentException("invalid path")
            }

            private fun parseRange(rangeHeader: String?): Pair<Long?, Long?> {
                if (rangeHeader == null) return Pair(null, null)
                // bytes=start-end | bytes=start-
                val m = Regex("bytes=(\\d+)-(\\d*)").find(rangeHeader) ?: return Pair(null, null)
                val start = m.groupValues[1].toLongOrNull()
                val end = m.groupValues.getOrNull(2)?.takeIf { it.isNotEmpty() }?.toLongOrNull()
                return Pair(start, end)
            }

            private fun extractTotalFromContentRange(h: String?): Long? {
                if (h == null) return null
                // bytes start-end/total
                val idx = h.lastIndexOf('/')
                if (idx == -1) return null
                return h.substring(idx + 1).toLongOrNull()
            }
        }

        fun ensureStarted(): String {
            if (!started) {
                val server = Server(this)
                server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
                started = true
            }
            return "http://127.0.0.1:${port}"
        }

        fun register(src: String, ekey: ByteArray, headers: Map<String, String>): String {
            val token = UUID.randomUUID().toString().replace("-", "")
            sessions[token] = Session(token, src, ekey, headers)
            return "/m/${token}"
        }

        private fun fetchTotalLength(s: Session): Long? {
            s.totalLength?.let { return it }
            // Try HEAD first
            try {
                val headHeaders = Headers.Builder().apply { s.headers.forEach { (k,v) -> add(k, v) } }.build()
                val headReq = Request.Builder().url(s.src).headers(headHeaders).head().build()
                client.newCall(headReq).execute().use { r ->
                    if (r.isSuccessful) {
                        val cl = r.header("Content-Length")?.toLongOrNull()
                        if (cl != null && cl > 0) { s.totalLength = cl; return cl }
                    }
                }
            } catch (_: Exception) {}
            // Fallback: GET bytes=0-0
            return try {
                val getHeaders = Headers.Builder().apply { s.headers.forEach { (k,v) -> add(k, v) } }.build()
                val req = Request.Builder().url(s.src).addHeader("Range", "bytes=0-0").headers(getHeaders).build()
                client.newCall(req).execute().use { r ->
                    val cr = r.header("Content-Range")
                    if (cr != null) {
                        val idx = cr.lastIndexOf('/')
                        if (idx != -1) {
                            val v = cr.substring(idx + 1).toLongOrNull()
                            if (v != null) { s.totalLength = v; return v }
                        }
                    }
                    val cl = r.header("Content-Length")?.toLongOrNull()
                    if (cl != null) { s.totalLength = cl }
                    cl
                }
            } catch (_: Exception) { null }
        }

        private fun executeWithRetry(req: Request, attempts: Int): Response {
            var last: Exception? = null
            var i = 0
            while (i < attempts) {
                try {
                    val r = client.newCall(req).execute()
                    if (r.isSuccessful || r.code in listOf(200, 206, 416)) return r
                    // Close and retry on server error
                    r.close()
                } catch (e: Exception) { last = e }
                i++
            }
            // final try
            return client.newCall(req).execute()
        }
    }

    @ReactMethod
    fun startMflacProxy(promise: Promise) {
        try {
            val base = MflacProxy.ensureStarted()
            android.util.Log.i("Mp3UtilModule", "[Proxy] Started at $base")
            promise.resolve(base)
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "[Proxy] Start error: ${e.message}", e)
            promise.reject("ProxyStartError", e)
        }
    }

    @ReactMethod
    fun registerMflacStream(src: String, rawEkey: String, headers: ReadableMap?, promise: Promise) {
        try {
            android.util.Log.i("Mp3UtilModule", "[Proxy] Register stream src=$src")
            val cleaned = normalizeEkey(rawEkey)
            android.util.Log.i("Mp3UtilModule", "[Proxy] ekey length raw=${rawEkey.length} cleaned=${cleaned.length}")
            val key = decryptEKey(cleaned)
            val h = mutableMapOf<String, String>()
            headers?.let {
                val iter = it.keySetIterator()
                while (iter.hasNextKey()) {
                    val k = iter.nextKey()
                    val v = it.getString(k)
                    if (v != null) h[k] = v
                }
            }
            val base = MflacProxy.ensureStarted()
            val path = MflacProxy.register(src, key, h)
            val local = base + path
            android.util.Log.i("Mp3UtilModule", "[Proxy] Registered -> $local")
            promise.resolve(local)
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "[Proxy] Register error: ${e.message}", e)
            promise.reject("RegisterStreamError", e)
        }
    }
}
