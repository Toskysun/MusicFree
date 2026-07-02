package `fun`.xwj.musicfree.cenc

internal object CencNative {
    init {
        System.loadLibrary("musicfree-cenc")
    }

    external fun nativeCreate(
        ftyp: ByteArray,
        moov: ByteArray,
        cek: ByteArray,
        mdatFileOffset: Long,
        mdatPayloadSize: Long,
    ): Long

    external fun nativeIsValid(handle: Long): Boolean
    external fun nativeGetError(handle: Long): String
    external fun nativeGetHeader(handle: Long): ByteArray?
    external fun nativeGetHeaderSize(handle: Long): Long
    external fun nativeGetMdatFileOffset(handle: Long): Long
    external fun nativeGetOutputTotalSize(handle: Long): Long
    external fun nativeDecrypt(
        handle: Long,
        mdatRelativeOffset: Long,
        data: ByteArray,
        dataOffset: Int,
        length: Int,
    )
    external fun nativeDestroy(handle: Long)
}

internal class CencDecoder(
    ftyp: ByteArray,
    moov: ByteArray,
    cek: ByteArray,
    mdatFileOffset: Long,
    mdatPayloadSize: Long,
) : AutoCloseable {
    private var handle = CencNative.nativeCreate(
        ftyp,
        moov,
        cek,
        mdatFileOffset,
        mdatPayloadSize,
    )

    init {
        require(handle != 0L) { "failed to allocate CENC decoder" }
        if (!CencNative.nativeIsValid(handle)) {
            val error = CencNative.nativeGetError(handle)
            close()
            throw IllegalArgumentException(error.ifBlank { "decoder initialization failed" })
        }
    }

    val header: ByteArray = requireNotNull(CencNative.nativeGetHeader(handle)) {
        "decoder did not produce an MP4 header"
    }
    val headerSize: Long = CencNative.nativeGetHeaderSize(handle)
    val mdatFileOffset: Long = CencNative.nativeGetMdatFileOffset(handle)
    val outputTotalSize: Long = CencNative.nativeGetOutputTotalSize(handle)

    fun decrypt(relativeOffset: Long, data: ByteArray, offset: Int, length: Int) {
        check(handle != 0L) { "decoder is closed" }
        CencNative.nativeDecrypt(handle, relativeOffset, data, offset, length)
    }

    @Synchronized
    override fun close() {
        if (handle != 0L) {
            CencNative.nativeDestroy(handle)
            handle = 0L
        }
    }
}
