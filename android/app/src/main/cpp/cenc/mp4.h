#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace ence {

// One CENC subsample (clear prefix + encrypted region).
struct SubSample {
    uint32_t clearBytes;
    uint32_t encryptedBytes;
};

// Per-sample crypto info needed to decrypt the mdat region of a sample.
struct SampleInfo {
    uint64_t mdatRelOffset;            // offset within mdat payload (== output mdat offset)
    uint32_t size;                     // sample byte length
    uint8_t iv[16];                    // 16-byte CTR seed (short IVs zero-extended)
    bool hasSubsamples = false;
    std::vector<SubSample> subsamples; // only when hasSubsamples
};

// Result of parsing the original moov and rewriting it into a plaintext header.
struct Mp4CencResult {
    bool ok = false;
    std::string error;

    std::vector<SampleInfo> samples;       // decode order

    uint64_t mdatPayloadSize = 0;          // unchanged by decryption

    std::vector<uint8_t> plaintextHeader;  // [ftyp][rewritten moov][mdat box header]
    uint64_t headerSize = 0;               // == plaintextHeader.size()
    uint64_t outputTotalSize = 0;          // headerSize + mdatPayloadSize
};

// Parse the (encrypted) moov, extract the sample table + per-sample IVs, and
// build a plaintext output header. `mdatPayloadFileOffset` is the absolute file
// offset of the original mdat box payload (i.e. mdat box start + box header).
Mp4CencResult parseAndRewrite(
    const uint8_t* ftyp, size_t ftypLen,
    const uint8_t* moov, size_t moovLen,
    uint64_t mdatPayloadFileOffset,
    uint64_t mdatPayloadSize,
    const uint8_t cek[16]);

} // namespace ence
