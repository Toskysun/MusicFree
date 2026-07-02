package `fun`.xwj.musicfree.cenc

import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.UUID

internal object CencFileDecoder {
    private const val MAX_HEADER_BOX_SIZE = 64L * 1024L * 1024L

    private data class Layout(
        val ftyp: ByteArray,
        val moov: ByteArray,
        val mdatPayloadOffset: Long,
        val mdatPayloadSize: Long,
    )

    private data class BoxHeader(
        val type: String,
        val size: Long,
        val headerSize: Int,
    )

    fun decrypt(inputPath: String, outputPath: String, cek: String) {
        val key = cek.trim()
        require(key.matches(Regex("^[0-9a-fA-F]{32}$"))) {
            "invalid cek (expected 32 hexadecimal characters)"
        }

        val inputFile = File(inputPath)
        require(inputFile.isFile) { "encrypted CENC file does not exist: $inputPath" }
        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        val tempFile = File(
            outputFile.parentFile,
            ".${outputFile.name}.${UUID.randomUUID()}.tmp",
        )

        try {
            RandomAccessFile(inputFile, "r").use { input ->
                val layout = discoverLayout(input)
                CencDecoder(
                    layout.ftyp,
                    layout.moov,
                    key.hexToByteArray(),
                    layout.mdatPayloadOffset,
                    layout.mdatPayloadSize,
                ).use { decoder ->
                    FileOutputStream(tempFile).use { output ->
                        output.write(decoder.header)
                        input.seek(layout.mdatPayloadOffset)

                        val buffer = ByteArray(128 * 1024)
                        var relativeOffset = 0L
                        var remaining = layout.mdatPayloadSize
                        while (remaining > 0L) {
                            val requested = minOf(buffer.size.toLong(), remaining).toInt()
                            val read = input.read(buffer, 0, requested)
                            require(read > 0) { "encrypted CENC file ended before mdat was complete" }
                            decoder.decrypt(relativeOffset, buffer, 0, read)
                            output.write(buffer, 0, read)
                            relativeOffset += read
                            remaining -= read
                        }
                        output.fd.sync()
                    }
                }
            }

            if (outputFile.exists() && !outputFile.delete()) {
                throw IllegalStateException("unable to replace existing output file")
            }
            if (!tempFile.renameTo(outputFile)) {
                tempFile.copyTo(outputFile, overwrite = true)
                if (!tempFile.delete()) {
                    tempFile.deleteOnExit()
                }
            }
        } catch (error: Throwable) {
            tempFile.delete()
            throw error
        }
    }

    private fun discoverLayout(input: RandomAccessFile): Layout {
        val fileSize = input.length()
        var ftyp: ByteArray? = null
        var moov: ByteArray? = null
        var mdatPayloadOffset: Long? = null
        var mdatPayloadSize: Long? = null
        var offset = 0L
        var guard = 0

        while (offset + 8L <= fileSize && guard++ < 4096) {
            val box = readBoxHeader(input, offset, fileSize - offset)
                ?: throw IllegalArgumentException("invalid MP4 box at offset $offset")
            when (box.type) {
                "ftyp" -> ftyp = readHeaderBox(input, offset, box)
                "moov" -> moov = readHeaderBox(input, offset, box)
                "mdat" -> {
                    mdatPayloadOffset = offset + box.headerSize
                    mdatPayloadSize = box.size - box.headerSize
                }
            }
            if (ftyp != null && moov != null && mdatPayloadOffset != null) break
            offset += box.size
        }

        return Layout(
            ftyp ?: ByteArray(0),
            requireNotNull(moov) { "failed to locate moov box" },
            requireNotNull(mdatPayloadOffset) { "failed to locate mdat box" },
            requireNotNull(mdatPayloadSize),
        )
    }

    private fun readHeaderBox(input: RandomAccessFile, offset: Long, box: BoxHeader): ByteArray {
        require(box.size in 1..MAX_HEADER_BOX_SIZE) { "${box.type} box is too large" }
        return ByteArray(box.size.toInt()).also { bytes ->
            input.seek(offset)
            input.readFully(bytes)
        }
    }

    private fun readBoxHeader(
        input: RandomAccessFile,
        offset: Long,
        remaining: Long,
    ): BoxHeader? {
        input.seek(offset)
        val header = ByteArray(minOf(16L, remaining).toInt())
        input.readFully(header)
        if (header.size < 8) return null

        var size = readUInt32(header, 0)
        val type = header.copyOfRange(4, 8).toString(Charsets.ISO_8859_1)
        var headerSize = 8
        if (size == 1L) {
            if (header.size < 16) return null
            size = readUInt64(header, 8)
            headerSize = 16
        } else if (size == 0L) {
            size = remaining
        }
        if (size < headerSize || size > remaining) return null
        return BoxHeader(type, size, headerSize)
    }

    private fun readUInt32(data: ByteArray, offset: Int): Long {
        return ((data[offset].toLong() and 0xffL) shl 24) or
            ((data[offset + 1].toLong() and 0xffL) shl 16) or
            ((data[offset + 2].toLong() and 0xffL) shl 8) or
            (data[offset + 3].toLong() and 0xffL)
    }

    private fun readUInt64(data: ByteArray, offset: Int): Long {
        val high = readUInt32(data, offset)
        val low = readUInt32(data, offset + 4)
        require(high <= Int.MAX_VALUE.toLong()) { "MP4 box is too large" }
        return (high shl 32) or low
    }

    private fun String.hexToByteArray(): ByteArray {
        return ByteArray(length / 2) { index ->
            substring(index * 2, index * 2 + 2).toInt(16).toByte()
        }
    }
}
