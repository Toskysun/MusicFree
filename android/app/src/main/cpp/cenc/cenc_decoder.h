#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include "aes.h"
#include "mp4.h"

namespace ence {

// Owns the parsed sample table + rewritten plaintext header, and performs
// in-place AES-CTR decryption of mdat byte ranges (CENC cenc-aes-ctr).
class CencDecoder {
public:
    CencDecoder(const uint8_t* ftyp, size_t ftypLen,
                const uint8_t* moov, size_t moovLen,
                const uint8_t cek[16],
                uint64_t mdatPayloadFileOffset,
                uint64_t mdatPayloadSize);

    bool ok() const { return result_.ok; }
    const std::string& error() const { return result_.error; }

    const std::vector<uint8_t>& header() const { return result_.plaintextHeader; }
    uint64_t headerSize() const { return result_.headerSize; }
    uint64_t mdatFileOffset() const { return mdatFileOffset_; }
    uint64_t mdatPayloadSize() const { return result_.mdatPayloadSize; }
    uint64_t outputTotalSize() const { return result_.outputTotalSize; }

    // Decrypt in place. `buf` holds the ciphertext of the original mdat payload
    // in the byte range [mdatRelOffset, mdatRelOffset+len).
    void decrypt(uint64_t mdatRelOffset, uint8_t* buf, size_t len);

private:
    void decryptSampleRegion(const SampleInfo& s, uint64_t fromWithin, uint64_t toWithin, uint8_t* out);

    Mp4CencResult result_;
    Aes128 aes_;
    uint64_t mdatFileOffset_;
};

} // namespace ence
