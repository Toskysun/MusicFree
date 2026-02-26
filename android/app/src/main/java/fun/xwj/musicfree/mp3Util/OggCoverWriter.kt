package `fun`.xwj.musicfree.mp3Util

import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Pure Kotlin OGG Vorbis cover art writer.
 *
 * JAudioTagger 2.2.5's OGG cover writing is broken (all 3 fallback methods
 * fail silently), so this object directly manipulates the OGG bitstream to
 * inject a METADATA_BLOCK_PICTURE comment — the same approach Python's
 * mutagen library uses with add_picture().
 */
object OggCoverWriter {

    private const val TAG = "OggCoverWriter"
    private const val OGG_CAPTURE = "OggS"
    private const val OGG_HEADER_SIZE = 27 // bytes before segment table
    private const val MAX_SEGMENTS_PER_PAGE = 255
    private const val SEGMENT_MAX = 255
    private const val MAX_PAGE_BODY = MAX_SEGMENTS_PER_PAGE * SEGMENT_MAX // 65025

    // OGG CRC32 lookup table (polynomial 0x04C11DB7, direct / non-reflected)
    private val crcTable = IntArray(256).also { table ->
        for (i in 0 until 256) {
            var r = i shl 24
            for (j in 0 until 8) {
                r = if (r and 0x80000000.toInt() != 0) {
                    (r shl 1) xor 0x04C11DB7
                } else {
                    r shl 1
                }
            }
            table[i] = r
        }
    }

    // ── Data classes ────────────────────────────────────────────────────

    private data class OggPage(
        val version: Int,
        val headerType: Int,
        val granulePosition: Long,
        val serialNumber: Int,
        val pageSequenceNumber: Int,
        val segmentTable: ByteArray,
        val body: ByteArray
    ) {
        /** Serialize this page to bytes, computing the CRC in the process. */
        fun toBytes(): ByteArray {
            val size = OGG_HEADER_SIZE + segmentTable.size + body.size
            val buf = ByteBuffer.allocate(size).order(ByteOrder.LITTLE_ENDIAN)

            // Capture pattern
            buf.put(OGG_CAPTURE.toByteArray(Charsets.US_ASCII))
            // Stream structure version
            buf.put(version.toByte())
            // Header type
            buf.put(headerType.toByte())
            // Granule position
            buf.putLong(granulePosition)
            // Serial number
            buf.putInt(serialNumber)
            // Page sequence number
            buf.putInt(pageSequenceNumber)
            // CRC placeholder (zeroed for computation)
            buf.putInt(0)
            // Number of segments
            buf.put(segmentTable.size.toByte())
            // Segment table
            buf.put(segmentTable)
            // Body
            buf.put(body)

            val bytes = buf.array()
            val crc = oggCrc32(bytes, 0, bytes.size)
            // Write CRC at offset 22
            bytes[22] = (crc and 0xFF).toByte()
            bytes[23] = ((crc ushr 8) and 0xFF).toByte()
            bytes[24] = ((crc ushr 16) and 0xFF).toByte()
            bytes[25] = ((crc ushr 24) and 0xFF).toByte()
            return bytes
        }
    }

    // ── Public API ──────────────────────────────────────────────────────

    /**
     * Write cover art to an OGG Vorbis file by directly manipulating the
     * bitstream.  Returns true on success, false on failure.
     */
    fun writeCover(
        oggFilePath: String,
        coverBytes: ByteArray,
        mimeType: String,
        imageWidth: Int,
        imageHeight: Int,
        colourDepth: Int
    ): Boolean {
        try {
            val file = File(oggFilePath)
            if (!file.exists() || !file.isFile) {
                Log.e(TAG, "File does not exist: $oggFilePath")
                return false
            }

            val raw = file.readBytes()

            // 1. Parse all OGG pages
            val pages = parsePages(raw)
            if (pages.isEmpty()) {
                Log.e(TAG, "No OGG pages found")
                return false
            }

            val serialNumber = pages[0].serialNumber

            // 2. Reassemble the first 3 Vorbis packets from the pages
            val (packets, packetPageRanges) = reassembleHeaderPackets(pages)
            if (packets.size < 3) {
                Log.e(TAG, "Could not find 3 Vorbis header packets (found ${packets.size})")
                return false
            }

            // Validate identification header
            val idPacket = packets[0]
            if (!isVorbisPacket(idPacket, 0x01)) {
                Log.e(TAG, "First packet is not a Vorbis identification header")
                return false
            }

            // Validate comment header
            val commentPacket = packets[1]
            if (!isVorbisPacket(commentPacket, 0x03)) {
                Log.e(TAG, "Second packet is not a Vorbis comment header")
                return false
            }

            // Validate setup header
            val setupPacket = packets[2]
            if (!isVorbisPacket(setupPacket, 0x05)) {
                Log.e(TAG, "Third packet is not a Vorbis setup header")
                return false
            }

            // 3. Parse the Vorbis Comment, inject cover, rebuild
            val newCommentPacket = rebuildCommentPacket(
                commentPacket, coverBytes, mimeType, imageWidth, imageHeight, colourDepth
            ) ?: return false

            // 4. Determine where audio pages start
            //    packetPageRanges[2].last is the index of the last page that
            //    carries part of the setup header.
            val firstAudioPageIndex = packetPageRanges[2].last + 1

            // 5. Re-paginate
            val output = ByteArrayOutputStream(raw.size + coverBytes.size + 4096)

            // 5a. Write BOS page (page 0) as-is — contains identification header
            output.write(pages[0].toBytes())
            var nextSeq = 1

            // 5b. Paginate comment packet + setup packet into fresh pages
            val headerPages = paginatePackets(
                listOf(newCommentPacket, setupPacket),
                serialNumber = serialNumber,
                startSequence = nextSeq,
                granulePosition = 0L
            )
            for (page in headerPages) {
                output.write(page.toBytes())
            }
            nextSeq += headerPages.size

            // 5c. Copy remaining audio pages with adjusted sequence numbers
            for (i in firstAudioPageIndex until pages.size) {
                val orig = pages[i]
                val adjusted = OggPage(
                    version = orig.version,
                    headerType = orig.headerType,
                    granulePosition = orig.granulePosition,
                    serialNumber = orig.serialNumber,
                    pageSequenceNumber = nextSeq,
                    segmentTable = orig.segmentTable,
                    body = orig.body
                )
                output.write(adjusted.toBytes())
                nextSeq++
            }

            // 6. Atomic write via temp file + rename
            val tmpFile = File(oggFilePath + ".tmp_cover")
            try {
                tmpFile.writeBytes(output.toByteArray())
                if (!tmpFile.renameTo(file)) {
                    // renameTo can fail across filesystems; fall back to copy
                    tmpFile.inputStream().use { input ->
                        file.outputStream().use { out -> input.copyTo(out) }
                    }
                    tmpFile.delete()
                }
            } catch (e: Exception) {
                tmpFile.delete()
                throw e
            }

            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write cover to OGG: ${e.message}", e)
            return false
        }
    }

    // ── OGG page parsing ────────────────────────────────────────────────

    private fun parsePages(data: ByteArray): List<OggPage> {
        val pages = mutableListOf<OggPage>()
        var offset = 0

        while (offset + OGG_HEADER_SIZE <= data.size) {
            // Find capture pattern
            if (data[offset] != 'O'.code.toByte() ||
                data[offset + 1] != 'g'.code.toByte() ||
                data[offset + 2] != 'g'.code.toByte() ||
                data[offset + 3] != 'S'.code.toByte()
            ) {
                Log.e(TAG, "Invalid capture pattern at offset $offset")
                return pages
            }

            val version = data[offset + 4].toInt() and 0xFF
            val headerType = data[offset + 5].toInt() and 0xFF
            val granule = readLittleEndianLong(data, offset + 6)
            val serial = readLittleEndianInt(data, offset + 14)
            val pageSeq = readLittleEndianInt(data, offset + 18)
            // CRC at offset+22 (skip, we recompute)
            val numSegments = data[offset + 26].toInt() and 0xFF

            if (offset + OGG_HEADER_SIZE + numSegments > data.size) {
                Log.e(TAG, "Truncated segment table at offset $offset")
                return pages
            }

            val segTable = data.copyOfRange(offset + OGG_HEADER_SIZE, offset + OGG_HEADER_SIZE + numSegments)
            var bodySize = 0
            for (s in segTable) {
                bodySize += s.toInt() and 0xFF
            }

            val bodyStart = offset + OGG_HEADER_SIZE + numSegments
            if (bodyStart + bodySize > data.size) {
                Log.e(TAG, "Truncated page body at offset $offset")
                return pages
            }

            val body = data.copyOfRange(bodyStart, bodyStart + bodySize)

            pages.add(
                OggPage(
                    version = version,
                    headerType = headerType,
                    granulePosition = granule,
                    serialNumber = serial,
                    pageSequenceNumber = pageSeq,
                    segmentTable = segTable,
                    body = body
                )
            )

            offset = bodyStart + bodySize
        }

        return pages
    }

    // ── Packet reassembly ───────────────────────────────────────────────

    /**
     * Reassemble the first 3 Vorbis header packets from the parsed pages.
     *
     * Returns a pair of (packets, pageRanges) where pageRanges[i] is the
     * IntRange of page indices that contributed to packet i.
     */
    private fun reassembleHeaderPackets(
        pages: List<OggPage>
    ): Pair<List<ByteArray>, List<IntRange>> {
        val packets = mutableListOf<ByteArray>()
        val pageRanges = mutableListOf<IntRange>()

        var currentPacket = ByteArrayOutputStream()
        var packetStartPage = 0

        for (pageIdx in pages.indices) {
            val page = pages[pageIdx]
            var bodyOffset = 0

            for (segIdx in page.segmentTable.indices) {
                val segSize = page.segmentTable[segIdx].toInt() and 0xFF
                currentPacket.write(page.body, bodyOffset, segSize)
                bodyOffset += segSize

                // A segment < 255 terminates the current packet
                if (segSize < SEGMENT_MAX) {
                    packets.add(currentPacket.toByteArray())
                    pageRanges.add(packetStartPage..pageIdx)
                    currentPacket = ByteArrayOutputStream()
                    packetStartPage = pageIdx

                    // We only need the first 3 packets
                    if (packets.size >= 3) {
                        return Pair(packets, pageRanges)
                    }
                }
            }
        }

        // If there's a trailing unterminated packet (shouldn't happen for
        // well-formed files with 3+ packets, but handle gracefully)
        if (currentPacket.size() > 0) {
            packets.add(currentPacket.toByteArray())
            pageRanges.add(packetStartPage until pages.size)
        }

        return Pair(packets, pageRanges)
    }

    // ── Vorbis Comment manipulation ─────────────────────────────────────

    private fun isVorbisPacket(packet: ByteArray, expectedType: Int): Boolean {
        if (packet.size < 7) return false
        if ((packet[0].toInt() and 0xFF) != expectedType) return false
        val vorbis = "vorbis".toByteArray(Charsets.US_ASCII)
        for (i in vorbis.indices) {
            if (packet[1 + i] != vorbis[i]) return false
        }
        return true
    }

    /**
     * Parse the existing Vorbis Comment packet, remove any existing
     * METADATA_BLOCK_PICTURE entries, add the new one, and return the
     * rebuilt packet bytes.
     */
    private fun rebuildCommentPacket(
        original: ByteArray,
        coverBytes: ByteArray,
        mimeType: String,
        imageWidth: Int,
        imageHeight: Int,
        colourDepth: Int
    ): ByteArray? {
        try {
            // Skip the 7-byte "\x03vorbis" prefix
            val buf = ByteBuffer.wrap(original).order(ByteOrder.LITTLE_ENDIAN)
            buf.position(7)

            // Vendor string
            val vendorLen = buf.int
            if (vendorLen < 0 || buf.remaining() < vendorLen) {
                Log.e(TAG, "Invalid vendor string length: $vendorLen")
                return null
            }
            val vendorBytes = ByteArray(vendorLen)
            buf.get(vendorBytes)

            // Comment list
            val commentCount = buf.int
            if (commentCount < 0) {
                Log.e(TAG, "Invalid comment count: $commentCount")
                return null
            }

            val comments = mutableListOf<ByteArray>()
            for (i in 0 until commentCount) {
                if (buf.remaining() < 4) {
                    Log.e(TAG, "Truncated comment at index $i")
                    return null
                }
                val commentLen = buf.int
                if (commentLen < 0 || buf.remaining() < commentLen) {
                    Log.e(TAG, "Invalid comment length at index $i: $commentLen")
                    return null
                }
                val commentBytes = ByteArray(commentLen)
                buf.get(commentBytes)

                // Filter out existing METADATA_BLOCK_PICTURE
                val commentStr = String(commentBytes, Charsets.UTF_8)
                if (!commentStr.uppercase().startsWith("METADATA_BLOCK_PICTURE=")) {
                    comments.add(commentBytes)
                }
            }

            // Build the new METADATA_BLOCK_PICTURE binary block
            val pictureBlock = buildMetadataBlockPicture(
                coverBytes, mimeType, imageWidth, imageHeight, colourDepth
            )
            val pictureB64 = Base64.encodeToString(pictureBlock, Base64.NO_WRAP)
            val pictureComment = "METADATA_BLOCK_PICTURE=$pictureB64".toByteArray(Charsets.UTF_8)
            comments.add(pictureComment)

            // Rebuild the packet
            val out = ByteArrayOutputStream()

            // Prefix: \x03vorbis
            out.write(0x03)
            out.write("vorbis".toByteArray(Charsets.US_ASCII))

            // Vendor string
            out.write(toLittleEndianInt(vendorLen))
            out.write(vendorBytes)

            // Comment count
            out.write(toLittleEndianInt(comments.size))

            // Comments
            for (comment in comments) {
                out.write(toLittleEndianInt(comment.size))
                out.write(comment)
            }

            // Framing bit
            out.write(0x01)

            return out.toByteArray()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to rebuild comment packet: ${e.message}", e)
            return null
        }
    }

    /**
     * Build the FLAC-style METADATA_BLOCK_PICTURE binary structure.
     * All multi-byte integers are big-endian per the spec.
     */
    private fun buildMetadataBlockPicture(
        coverBytes: ByteArray,
        mimeType: String,
        imageWidth: Int,
        imageHeight: Int,
        colourDepth: Int
    ): ByteArray {
        val mimeBytes = mimeType.toByteArray(Charsets.US_ASCII)
        val buf = ByteBuffer.allocate(
            4 +                  // picture type
            4 + mimeBytes.size + // MIME
            4 +                  // description length (0)
            4 +                  // width
            4 +                  // height
            4 +                  // colour depth
            4 +                  // colours used
            4 + coverBytes.size  // picture data
        ).order(ByteOrder.BIG_ENDIAN)

        buf.putInt(3)                   // Front Cover
        buf.putInt(mimeBytes.size)
        buf.put(mimeBytes)
        buf.putInt(0)                   // description length
        buf.putInt(imageWidth)
        buf.putInt(imageHeight)
        buf.putInt(colourDepth)
        buf.putInt(0)                   // colours used
        buf.putInt(coverBytes.size)
        buf.put(coverBytes)

        return buf.array()
    }

    // ── Re-pagination ───────────────────────────────────────────────────

    /**
     * Paginate one or more packets into OGG pages.
     *
     * Each packet is segmented (255-byte chunks + a terminating short
     * segment).  Segments are packed into pages up to 255 segments each.
     * Continuation flags are set correctly when a packet spans pages.
     */
    private fun paginatePackets(
        packets: List<ByteArray>,
        serialNumber: Int,
        startSequence: Int,
        granulePosition: Long
    ): List<OggPage> {
        // First, build the full segment list with packet boundary markers
        data class Segment(val data: ByteArray, val offset: Int, val length: Int, val isPacketEnd: Boolean)

        val allSegments = mutableListOf<Segment>()

        for (packet in packets) {
            var pos = 0
            while (pos < packet.size) {
                val chunkSize = minOf(SEGMENT_MAX, packet.size - pos)
                val isLast = (pos + chunkSize >= packet.size)
                allSegments.add(Segment(packet, pos, chunkSize, isLast && chunkSize < SEGMENT_MAX))
                pos += chunkSize

                // If the packet size is an exact multiple of 255, we need a
                // terminating zero-length segment
                if (isLast && chunkSize == SEGMENT_MAX) {
                    allSegments.add(Segment(ByteArray(0), 0, 0, true))
                }
            }

            // Edge case: empty packet
            if (packet.isEmpty()) {
                allSegments.add(Segment(ByteArray(0), 0, 0, true))
            }
        }

        // Now pack segments into pages
        val pages = mutableListOf<OggPage>()
        var segIdx = 0
        var seq = startSequence
        // Track whether we are in the middle of a packet (for continuation flag)
        var continuingPacket = false

        while (segIdx < allSegments.size) {
            val pageSegments = mutableListOf<Segment>()
            val count = minOf(MAX_SEGMENTS_PER_PAGE, allSegments.size - segIdx)
            for (i in 0 until count) {
                pageSegments.add(allSegments[segIdx + i])
            }

            val segTable = ByteArray(pageSegments.size) { i ->
                pageSegments[i].length.toByte()
            }

            val bodyStream = ByteArrayOutputStream()
            for (seg in pageSegments) {
                if (seg.length > 0) {
                    bodyStream.write(seg.data, seg.offset, seg.length)
                }
            }

            val headerType = if (continuingPacket) 0x01 else 0x00

            pages.add(
                OggPage(
                    version = 0,
                    headerType = headerType,
                    granulePosition = granulePosition,
                    serialNumber = serialNumber,
                    pageSequenceNumber = seq,
                    segmentTable = segTable,
                    body = bodyStream.toByteArray()
                )
            )

            // Determine if the last segment on this page is a continuation
            // (i.e. the packet hasn't terminated yet)
            val lastSeg = pageSegments.last()
            continuingPacket = (lastSeg.length == SEGMENT_MAX)

            segIdx += pageSegments.size
            seq++
        }

        return pages
    }

    // ── CRC ─────────────────────────────────────────────────────────────

    private fun oggCrc32(data: ByteArray, offset: Int = 0, length: Int = data.size): Int {
        var crc = 0
        for (i in offset until offset + length) {
            crc = (crc shl 8) xor crcTable[((crc ushr 24) and 0xFF) xor (data[i].toInt() and 0xFF)]
        }
        return crc
    }

    // ── Byte helpers ────────────────────────────────────────────────────

    private fun readLittleEndianInt(data: ByteArray, offset: Int): Int {
        return (data[offset].toInt() and 0xFF) or
            ((data[offset + 1].toInt() and 0xFF) shl 8) or
            ((data[offset + 2].toInt() and 0xFF) shl 16) or
            ((data[offset + 3].toInt() and 0xFF) shl 24)
    }

    private fun readLittleEndianLong(data: ByteArray, offset: Int): Long {
        var value = 0L
        for (i in 0 until 8) {
            value = value or ((data[offset + i].toLong() and 0xFF) shl (i * 8))
        }
        return value
    }

    private fun toLittleEndianInt(value: Int): ByteArray {
        return byteArrayOf(
            (value and 0xFF).toByte(),
            ((value ushr 8) and 0xFF).toByte(),
            ((value ushr 16) and 0xFF).toByte(),
            ((value ushr 24) and 0xFF).toByte()
        )
    }
}
