package `fun`.upup.musicfree.mp3Util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import com.facebook.react.bridge.*
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

class Mp3UtilModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

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
            
            // 解析目标路径
            val targetFile = File(destinationPath)
            val fileName = targetFile.name
            
            android.util.Log.i("Mp3UtilModule", "解析路径: targetPath=$destinationPath, fileName=$fileName")
            
            // 使用系统支持的Downloads路径进行下载
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "MusicFree_$fileName")
            android.util.Log.i("Mp3UtilModule", "使用Downloads路径下载: MusicFree_$fileName")
            
            // 设置通知显示
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
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
            
            // 返回自定义数据：downloadId + 目标路径信息
            val result = WritableNativeMap()
            result.putString("downloadId", downloadId.toString())
            result.putString("tempPath", "${Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)}/MusicFree_$fileName")
            result.putString("finalPath", destinationPath)
            
            android.util.Log.i("Mp3UtilModule", "✅ 系统下载任务创建成功: downloadId=$downloadId")
            android.util.Log.i("Mp3UtilModule", "临时路径: ${Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)}/MusicFree_$fileName")
            android.util.Log.i("Mp3UtilModule", "最终路径: $destinationPath")
            
            promise.resolve(result)
            
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "❌ 系统下载任务创建失败: ${e.message}", e)
            promise.reject("DownloadError", e.message)
        }
    }

    @ReactMethod
    fun moveDownloadedFile(tempPath: String, finalPath: String, promise: Promise) {
        try {
            android.util.Log.i("Mp3UtilModule", "开始移动文件: $tempPath -> $finalPath")
            
            val tempFile = File(tempPath)
            val finalFile = File(finalPath)
            
            if (!tempFile.exists()) {
                android.util.Log.e("Mp3UtilModule", "临时文件不存在: $tempPath")
                promise.reject("FileNotFound", "Temporary file not found: $tempPath")
                return
            }
            
            // 确保目标目录存在
            finalFile.parentFile?.let { parentDir ->
                if (!parentDir.exists()) {
                    parentDir.mkdirs()
                    android.util.Log.i("Mp3UtilModule", "创建目标目录: ${parentDir.absolutePath}")
                }
            }
            
            // 移动文件
            val success = if (tempFile.renameTo(finalFile)) {
                android.util.Log.i("Mp3UtilModule", "✅ 文件移动成功 (rename)")
                true
            } else {
                // 如果重命名失败，尝试复制+删除
                android.util.Log.w("Mp3UtilModule", "rename失败，尝试复制+删除")
                try {
                    tempFile.copyTo(finalFile, overwrite = true)
                    tempFile.delete()
                    android.util.Log.i("Mp3UtilModule", "✅ 文件移动成功 (copy+delete)")
                    true
                } catch (e: Exception) {
                    android.util.Log.e("Mp3UtilModule", "复制文件失败: ${e.message}")
                    false
                }
            }
            
            if (success) {
                promise.resolve(finalFile.absolutePath)
            } else {
                promise.reject("MoveError", "Failed to move file from $tempPath to $finalPath")
            }
            
        } catch (e: Exception) {
            android.util.Log.e("Mp3UtilModule", "移动文件异常: ${e.message}", e)
            promise.reject("MoveError", e.message)
        }
    }
}