#include "cenc_decoder.h"

#include <algorithm>
#include <cstring>

namespace ence {

// Add `add` to a 16-byte big-endian counter (in place).
static void incrCounter(uint8_t c[16], uint64_t add) {
    uint32_t carry = 0;
    for (int i = 15; i >= 0; --i) {
        uint64_t sum = static_cast<uint64_t>(c[i]) + static_cast<uint8_t>(add & 0xFF) + carry;
        c[i] = static_cast<uint8_t>(sum & 0xFF);
        carry = static_cast<uint32_t>(sum >> 8);
        add >>= 8;
        if (add == 0 && carry == 0) {
            break;
        }
    }
}

// XOR `len` bytes at `out` with the AES-CTR keystream for `iv`, where the first
// byte corresponds to keystream byte offset `ksOffset` within the sample.
static void ctrXor(const Aes128& aes, const uint8_t iv[16], uint64_t ksOffset, uint8_t* out, size_t len) {
    uint64_t blockIdx = ksOffset / 16;
    uint32_t intra = static_cast<uint32_t>(ksOffset % 16);

    uint8_t counter[16];
    std::memcpy(counter, iv, 16);
    incrCounter(counter, blockIdx);

    uint8_t ks[16];
    aes.encryptBlock(counter, ks);
    uint32_t ksPos = intra;

    for (size_t i = 0; i < len; ++i) {
        if (ksPos == 16) {
            incrCounter(counter, 1);
            aes.encryptBlock(counter, ks);
            ksPos = 0;
        }
        out[i] ^= ks[ksPos++];
    }
}

CencDecoder::CencDecoder(const uint8_t* ftyp, size_t ftypLen,
                         const uint8_t* moov, size_t moovLen,
                         const uint8_t cek[16],
                         uint64_t mdatPayloadFileOffset,
                         uint64_t mdatPayloadSize)
    : aes_(cek), mdatFileOffset_(mdatPayloadFileOffset) {
    result_ = parseAndRewrite(ftyp, ftypLen, moov, moovLen,
                              mdatPayloadFileOffset, mdatPayloadSize, cek);
}

void CencDecoder::decryptSampleRegion(const SampleInfo& s, uint64_t fromWithin, uint64_t toWithin, uint8_t* out) {
    if (!s.hasSubsamples) {
        ctrXor(aes_, s.iv, fromWithin, out, static_cast<size_t>(toWithin - fromWithin));
        return;
    }

    // Subsample layout: alternating clear / encrypted regions. Only encrypted
    // bytes consume the keystream.
    uint64_t pos = 0;       // position within the sample
    uint64_t ksOffset = 0;  // encrypted bytes consumed so far
    for (const SubSample& sub : s.subsamples) {
        pos += sub.clearBytes; // clear bytes are plaintext already
        uint64_t encStart = pos;
        uint64_t encEnd = pos + sub.encryptedBytes;

        uint64_t a = std::max(fromWithin, encStart);
        uint64_t b = std::min(toWithin, encEnd);
        if (a < b) {
            ctrXor(aes_, s.iv, ksOffset + (a - encStart),
                   out + (a - fromWithin), static_cast<size_t>(b - a));
        }
        ksOffset += sub.encryptedBytes;
        pos = encEnd;
        if (pos >= toWithin) {
            break;
        }
    }
}

void CencDecoder::decrypt(uint64_t mdatRelOffset, uint8_t* buf, size_t len) {
    if (!result_.ok || len == 0) {
        return;
    }

    uint64_t reqStart = mdatRelOffset;
    uint64_t reqEnd = mdatRelOffset + len;
    const std::vector<SampleInfo>& samples = result_.samples;

    // First sample whose end (offset + size) is past reqStart.
    size_t lo = 0, hi = samples.size();
    while (lo < hi) {
        size_t mid = (lo + hi) >> 1;
        if (samples[mid].mdatRelOffset + samples[mid].size <= reqStart) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    for (size_t i = lo; i < samples.size(); ++i) {
        const SampleInfo& s = samples[i];
        if (s.mdatRelOffset >= reqEnd) {
            break;
        }
        uint64_t sStart = s.mdatRelOffset;
        uint64_t sEnd = sStart + s.size;
        uint64_t a = std::max(reqStart, sStart);
        uint64_t b = std::min(reqEnd, sEnd);
        if (a < b) {
            decryptSampleRegion(s, a - sStart, b - sStart, buf + (a - reqStart));
        }
    }
}

} // namespace ence
