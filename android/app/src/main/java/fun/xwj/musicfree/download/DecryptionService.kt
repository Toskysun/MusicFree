package `fun`.xwj.musicfree.download

import java.io.File

data class DecryptionResult(
    val success: Boolean,
    val outputPath: String,
    val errorMessage: String? = null,
)

object DecryptionService {
    fun decryptIfNeeded(
        inputPath: String,
        outputPath: String,
        ekey: String?,
        decryptor: (inputPath: String, outputPath: String, ekey: String) -> Boolean,
    ): DecryptionResult {
        if (ekey.isNullOrBlank()) {
            return DecryptionResult(success = true, outputPath = inputPath)
        }

        return try {
            val ok = decryptor(inputPath, outputPath, ekey)
            if (ok) {
                try {
                    File(inputPath).delete()
                } catch (_: Exception) {
                }
                DecryptionResult(success = true, outputPath = outputPath)
            } else {
                DecryptionResult(
                    success = false,
                    outputPath = outputPath,
                    errorMessage = "decryptor returned false",
                )
            }
        } catch (error: Exception) {
            DecryptionResult(
                success = false,
                outputPath = outputPath,
                errorMessage = error.message ?: "unknown error",
            )
        }
    }
}
