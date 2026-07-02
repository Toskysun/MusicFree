#pragma once

#include <cstdint>

namespace ence {

// Minimal AES-128 block cipher (encrypt only — CTR mode only needs the
// forward transform to produce the keystream). Self-contained, no external deps.
class Aes128 {
public:
    explicit Aes128(const uint8_t key[16]);

    // Encrypt a single 16-byte block (in may alias out).
    void encryptBlock(const uint8_t in[16], uint8_t out[16]) const;

private:
    uint8_t roundKeys_[176]; // 11 round keys * 16 bytes
};

} // namespace ence
