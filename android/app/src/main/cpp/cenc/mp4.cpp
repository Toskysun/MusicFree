#include "mp4.h"

#include <cstring>

namespace ence {

// ---------------------------------------------------------------------------
// Byte readers / writers (big-endian)
// ---------------------------------------------------------------------------

static inline uint16_t rd16(const uint8_t* p) {
    return static_cast<uint16_t>((p[0] << 8) | p[1]);
}
static inline uint32_t rd32(const uint8_t* p) {
    return (static_cast<uint32_t>(p[0]) << 24) | (static_cast<uint32_t>(p[1]) << 16) |
           (static_cast<uint32_t>(p[2]) << 8) | static_cast<uint32_t>(p[3]);
}
static inline uint64_t rd64(const uint8_t* p) {
    return (static_cast<uint64_t>(rd32(p)) << 32) | rd32(p + 4);
}
static inline void wr32(uint8_t* p, uint32_t v) {
    p[0] = static_cast<uint8_t>(v >> 24);
    p[1] = static_cast<uint8_t>(v >> 16);
    p[2] = static_cast<uint8_t>(v >> 8);
    p[3] = static_cast<uint8_t>(v);
}

static inline void appendU32(std::vector<uint8_t>& out, uint32_t v) {
    out.push_back(static_cast<uint8_t>(v >> 24));
    out.push_back(static_cast<uint8_t>(v >> 16));
    out.push_back(static_cast<uint8_t>(v >> 8));
    out.push_back(static_cast<uint8_t>(v));
}
static inline void appendBytes(std::vector<uint8_t>& out, const uint8_t* p, size_t n) {
    out.insert(out.end(), p, p + n);
}

// ---------------------------------------------------------------------------
// Box view
// ---------------------------------------------------------------------------

struct BoxView {
    const uint8_t* start = nullptr;
    uint64_t size = 0;        // total box size including header
    uint64_t headerSize = 0;  // 8 or 16
    const uint8_t* payload = nullptr;
    uint64_t payloadSize = 0;
    char type[5] = {0};
};

// Parse a box at [p, end). Returns false on malformed/truncated box.
static bool readBox(const uint8_t* p, const uint8_t* end, BoxView& b) {
    if (end - p < 8) {
        return false;
    }
    uint64_t size = rd32(p);
    uint64_t headerSize = 8;
    if (size == 1) {
        if (end - p < 16) {
            return false;
        }
        size = rd64(p + 8);
        headerSize = 16;
    } else if (size == 0) {
        size = static_cast<uint64_t>(end - p);
    }
    if (size < headerSize || static_cast<uint64_t>(end - p) < size) {
        return false;
    }
    b.start = p;
    b.size = size;
    b.headerSize = headerSize;
    std::memcpy(b.type, p + 4, 4);
    b.type[4] = 0;
    b.payload = p + headerSize;
    b.payloadSize = size - headerSize;
    return true;
}

// Find first direct child box of the given type within [payload, payload+size).
static bool findChild(const uint8_t* payload, uint64_t payloadSize, const char* type, BoxView& out) {
    const uint8_t* p = payload;
    const uint8_t* end = payload + payloadSize;
    BoxView b;
    while (p < end && readBox(p, end, b)) {
        if (std::memcmp(b.type, type, 4) == 0) {
            out = b;
            return true;
        }
        p += b.size;
    }
    return false;
}

// ---------------------------------------------------------------------------
// AudioSampleEntry fixed-field length (to locate child boxes inside enca/mp4a)
// ---------------------------------------------------------------------------

static uint32_t audioSampleEntryHeaderLen(const uint8_t* payload, uint64_t payloadSize) {
    // SampleEntry(6 reserved + 2 dref = 8) + AudioSampleEntry base(20) = 28 (version 0).
    if (payloadSize < 28) {
        return static_cast<uint32_t>(payloadSize);
    }
    uint16_t version = rd16(payload + 8); // QTFF sound sample entry version
    uint32_t base = 28;
    if (version == 1) {
        base = 28 + 16;
    } else if (version == 2) {
        base = 28 + 36;
    }
    if (base > payloadSize) {
        base = static_cast<uint32_t>(payloadSize);
    }
    return base;
}

// ---------------------------------------------------------------------------
// moov rewrite (rebuild approach): enca->mp4a, drop sinf/senc/saiz/saio,
// recompute container sizes, record stco/co64 positions for offset fixup.
// ---------------------------------------------------------------------------

struct StcoRef {
    uint64_t dataOffsetInOut; // offset within rebuilt moov of first chunk-offset entry
    uint32_t count;
    bool is64;
};

struct RewriteCtx {
    std::vector<uint8_t> out;
    std::vector<StcoRef> stcoRefs;
};

static bool isContainer(const char* t) {
    return std::memcmp(t, "moov", 4) == 0 || std::memcmp(t, "trak", 4) == 0 ||
           std::memcmp(t, "mdia", 4) == 0 || std::memcmp(t, "minf", 4) == 0 ||
           std::memcmp(t, "stbl", 4) == 0;
}
static bool isDeleted(const char* t) {
    return std::memcmp(t, "senc", 4) == 0 || std::memcmp(t, "saiz", 4) == 0 ||
           std::memcmp(t, "saio", 4) == 0 || std::memcmp(t, "sinf", 4) == 0;
}

static void patchSize(std::vector<uint8_t>& out, size_t sizePos) {
    wr32(&out[sizePos], static_cast<uint32_t>(out.size() - sizePos));
}

static void emitBox(const BoxView& b, RewriteCtx& ctx);

static void emitEnca(const BoxView& b, RewriteCtx& ctx) {
    uint32_t childStart = audioSampleEntryHeaderLen(b.payload, b.payloadSize);

    // Recover original codec fourcc from sinf->frma (default to mp4a).
    char fmt[4] = {'m', 'p', '4', 'a'};
    BoxView sinf;
    if (findChild(b.payload + childStart, b.payloadSize - childStart, "sinf", sinf)) {
        BoxView frma;
        if (findChild(sinf.payload, sinf.payloadSize, "frma", frma) && frma.payloadSize >= 4) {
            std::memcpy(fmt, frma.payload, 4);
        }
    }

    size_t sizePos = ctx.out.size();
    appendU32(ctx.out, 0); // size placeholder
    appendBytes(ctx.out, reinterpret_cast<const uint8_t*>(fmt), 4);
    appendBytes(ctx.out, b.payload, childStart); // fixed AudioSampleEntry fields

    const uint8_t* p = b.payload + childStart;
    const uint8_t* end = b.payload + b.payloadSize;
    BoxView c;
    while (p < end && readBox(p, end, c)) {
        if (std::memcmp(c.type, "sinf", 4) != 0) {
            appendBytes(ctx.out, c.start, static_cast<size_t>(c.size)); // keep esds etc.
        }
        p += c.size;
    }
    patchSize(ctx.out, sizePos);
}

static void emitStsd(const BoxView& b, RewriteCtx& ctx) {
    size_t sizePos = ctx.out.size();
    appendU32(ctx.out, 0);
    appendBytes(ctx.out, b.start + 4, 4); // type 'stsd'
    appendBytes(ctx.out, b.payload, 8);   // version/flags + entry_count

    const uint8_t* p = b.payload + 8;
    const uint8_t* end = b.payload + b.payloadSize;
    BoxView e;
    while (p < end && readBox(p, end, e)) {
        if (std::memcmp(e.type, "enca", 4) == 0) {
            emitEnca(e, ctx);
        } else {
            appendBytes(ctx.out, e.start, static_cast<size_t>(e.size));
        }
        p += e.size;
    }
    patchSize(ctx.out, sizePos);
}

static void emitStcoLike(const BoxView& b, RewriteCtx& ctx) {
    size_t startInOut = ctx.out.size();
    appendBytes(ctx.out, b.start, static_cast<size_t>(b.size));
    StcoRef ref;
    ref.is64 = std::memcmp(b.type, "co64", 4) == 0;
    ref.count = (b.payloadSize >= 8) ? rd32(b.payload + 4) : 0;
    ref.dataOffsetInOut = startInOut + b.headerSize + 8;
    ctx.stcoRefs.push_back(ref);
}

static void emitContainer(const BoxView& b, RewriteCtx& ctx) {
    size_t sizePos = ctx.out.size();
    appendU32(ctx.out, 0);
    appendBytes(ctx.out, b.start + 4, 4); // type

    const uint8_t* p = b.payload;
    const uint8_t* end = b.payload + b.payloadSize;
    BoxView c;
    while (p < end && readBox(p, end, c)) {
        emitBox(c, ctx);
        p += c.size;
    }
    patchSize(ctx.out, sizePos);
}

static void emitBox(const BoxView& b, RewriteCtx& ctx) {
    if (isDeleted(b.type)) {
        return;
    }
    if (isContainer(b.type)) {
        emitContainer(b, ctx);
    } else if (std::memcmp(b.type, "stsd", 4) == 0) {
        emitStsd(b, ctx);
    } else if (std::memcmp(b.type, "stco", 4) == 0 || std::memcmp(b.type, "co64", 4) == 0) {
        emitStcoLike(b, ctx);
    } else {
        appendBytes(ctx.out, b.start, static_cast<size_t>(b.size));
    }
}

// ---------------------------------------------------------------------------
// Sample table + per-sample IV parsing
// ---------------------------------------------------------------------------

// Locate the stbl that contains an encrypted audio sample entry (stsd->enca).
static bool findEncryptedStbl(const uint8_t* moovPayload, uint64_t moovPayloadSize, BoxView& stblOut) {
    const uint8_t* p = moovPayload;
    const uint8_t* end = moovPayload + moovPayloadSize;
    BoxView trak;
    while (p < end && readBox(p, end, trak)) {
        if (std::memcmp(trak.type, "trak", 4) == 0) {
            BoxView mdia, minf, stbl, stsd, enca;
            if (findChild(trak.payload, trak.payloadSize, "mdia", mdia) &&
                findChild(mdia.payload, mdia.payloadSize, "minf", minf) &&
                findChild(minf.payload, minf.payloadSize, "stbl", stbl) &&
                findChild(stbl.payload, stbl.payloadSize, "stsd", stsd)) {
                // stsd: skip version/flags(4) + entry_count(4)
                if (stsd.payloadSize >= 8 &&
                    findChild(stsd.payload + 8, stsd.payloadSize - 8, "enca", enca)) {
                    stblOut = stbl;
                    return true;
                }
            }
        }
        p += trak.size;
    }
    return false;
}

// Parse tenc (inside stsd->enca->sinf->schi) for IV size + constant IV.
static bool parseTenc(const BoxView& stbl, uint8_t& ivSize, uint8_t constIV[16], uint8_t& constIVSize) {
    ivSize = 0;
    constIVSize = 0;
    BoxView stsd, enca, sinf, schi, tenc;
    if (!findChild(stbl.payload, stbl.payloadSize, "stsd", stsd)) return false;
    if (stsd.payloadSize < 8) return false;
    if (!findChild(stsd.payload + 8, stsd.payloadSize - 8, "enca", enca)) return false;
    uint32_t childStart = audioSampleEntryHeaderLen(enca.payload, enca.payloadSize);
    if (!findChild(enca.payload + childStart, enca.payloadSize - childStart, "sinf", sinf)) return false;
    if (!findChild(sinf.payload, sinf.payloadSize, "schi", schi)) return false;
    if (!findChild(schi.payload, schi.payloadSize, "tenc", tenc)) return false;
    if (tenc.payloadSize < 24) return false;

    const uint8_t* t = tenc.payload;
    // [0]=version [1..3]=flags [4]=reserved [5]=reserved/cryptskip
    // [6]=default_isProtected [7]=default_per_sample_IV_size [8..23]=KID
    ivSize = t[7];
    if (ivSize == 0) {
        // constant IV follows KID
        if (tenc.payloadSize >= 25) {
            uint8_t n = t[24];
            if (n <= 16 && tenc.payloadSize >= 25u + n) {
                constIVSize = n;
                std::memset(constIV, 0, 16);
                std::memcpy(constIV, t + 25, n);
            }
        }
    }
    return true;
}

Mp4CencResult parseAndRewrite(
    const uint8_t* ftyp, size_t ftypLen,
    const uint8_t* moov, size_t moovLen,
    uint64_t mdatPayloadFileOffset,
    uint64_t mdatPayloadSize,
    const uint8_t cek[16]) {

    Mp4CencResult res;
    (void)cek; // decryption uses the key separately; parsing does not need it

    BoxView moovBox;
    if (!readBox(moov, moov + moovLen, moovBox) || std::memcmp(moovBox.type, "moov", 4) != 0) {
        res.error = "invalid moov box";
        return res;
    }

    // --- locate encrypted stbl ---
    BoxView stbl;
    if (!findEncryptedStbl(moovBox.payload, moovBox.payloadSize, stbl)) {
        res.error = "no encrypted audio track (stsd->enca) found";
        return res;
    }

    // --- IV size from tenc ---
    uint8_t ivSize = 0, constIV[16] = {0}, constIVSize = 0;
    parseTenc(stbl, ivSize, constIV, constIVSize);

    // --- sample sizes (stsz) ---
    BoxView stsz, stsc, stco, co64Box, senc;
    bool hasStco = findChild(stbl.payload, stbl.payloadSize, "stco", stco);
    bool hasCo64 = findChild(stbl.payload, stbl.payloadSize, "co64", co64Box);
    if (!findChild(stbl.payload, stbl.payloadSize, "stsz", stsz) ||
        !findChild(stbl.payload, stbl.payloadSize, "stsc", stsc) ||
        (!hasStco && !hasCo64)) {
        res.error = "missing sample table (stsz/stsc/stco)";
        return res;
    }

    if (stsz.payloadSize < 12) { res.error = "bad stsz"; return res; }
    uint32_t uniformSize = rd32(stsz.payload + 4);
    uint32_t sampleCount = rd32(stsz.payload + 8);
    std::vector<uint32_t> sizes(sampleCount, 0);
    if (uniformSize != 0) {
        for (uint32_t i = 0; i < sampleCount; ++i) sizes[i] = uniformSize;
    } else {
        if (stsz.payloadSize < 12ull + 4ull * sampleCount) { res.error = "truncated stsz"; return res; }
        for (uint32_t i = 0; i < sampleCount; ++i) sizes[i] = rd32(stsz.payload + 12 + 4 * i);
    }

    // --- chunk offsets (stco/co64) ---
    const BoxView& chunkBox = hasStco ? stco : co64Box;
    bool is64 = !hasStco;
    if (chunkBox.payloadSize < 8) { res.error = "bad stco"; return res; }
    uint32_t chunkCount = rd32(chunkBox.payload + 4);
    std::vector<uint64_t> chunkOffsets(chunkCount, 0);
    {
        size_t need = 8 + static_cast<size_t>(chunkCount) * (is64 ? 8 : 4);
        if (chunkBox.payloadSize < need) { res.error = "truncated stco"; return res; }
        for (uint32_t i = 0; i < chunkCount; ++i) {
            chunkOffsets[i] = is64 ? rd64(chunkBox.payload + 8 + 8 * i)
                                   : rd32(chunkBox.payload + 8 + 4 * i);
        }
    }

    // --- sample-to-chunk (stsc) -> samples per chunk ---
    if (stsc.payloadSize < 8) { res.error = "bad stsc"; return res; }
    uint32_t stscCount = rd32(stsc.payload + 4);
    if (stsc.payloadSize < 8ull + 12ull * stscCount) { res.error = "truncated stsc"; return res; }
    std::vector<uint32_t> samplesPerChunk(chunkCount, 0);
    for (uint32_t e = 0; e < stscCount; ++e) {
        uint32_t firstChunk = rd32(stsc.payload + 8 + 12 * e);
        uint32_t spc = rd32(stsc.payload + 8 + 12 * e + 4);
        uint32_t lastChunk = (e + 1 < stscCount)
            ? rd32(stsc.payload + 8 + 12 * (e + 1))
            : chunkCount + 1;
        if (firstChunk < 1) firstChunk = 1;
        for (uint32_t ch = firstChunk; ch <= lastChunk - 1 && ch <= chunkCount; ++ch) {
            samplesPerChunk[ch - 1] = spc;
        }
    }

    // --- absolute file offset of each sample ---
    std::vector<uint64_t> sampleAbs(sampleCount, 0);
    {
        uint32_t sampleIdx = 0;
        for (uint32_t c = 0; c < chunkCount && sampleIdx < sampleCount; ++c) {
            uint64_t off = chunkOffsets[c];
            for (uint32_t j = 0; j < samplesPerChunk[c] && sampleIdx < sampleCount; ++j) {
                sampleAbs[sampleIdx] = off;
                off += sizes[sampleIdx];
                ++sampleIdx;
            }
        }
    }

    // --- per-sample IVs (senc) ---
    bool hasSenc = findChild(stbl.payload, stbl.payloadSize, "senc", senc);
    res.samples.resize(sampleCount);
    for (uint32_t i = 0; i < sampleCount; ++i) {
        res.samples[i].mdatRelOffset = sampleAbs[i] - mdatPayloadFileOffset;
        res.samples[i].size = sizes[i];
        std::memset(res.samples[i].iv, 0, 16);
        if (ivSize == 0 && constIVSize > 0) {
            std::memcpy(res.samples[i].iv, constIV, 16);
        }
    }

    if (hasSenc && ivSize > 0) {
        const uint8_t* p = senc.payload;
        const uint8_t* end = senc.payload + senc.payloadSize;
        if (senc.payloadSize >= 8) {
            uint32_t flags = rd32(p) & 0x00FFFFFF;
            uint32_t sencCount = rd32(p + 4);
            p += 8;
            uint32_t n = (sencCount < sampleCount) ? sencCount : sampleCount;
            bool useSub = (flags & 0x000002) != 0;
            for (uint32_t i = 0; i < n; ++i) {
                if (end - p < ivSize) break;
                std::memset(res.samples[i].iv, 0, 16);
                std::memcpy(res.samples[i].iv, p, ivSize);
                p += ivSize;
                if (useSub) {
                    if (end - p < 2) break;
                    uint16_t subCount = rd16(p);
                    p += 2;
                    res.samples[i].hasSubsamples = true;
                    for (uint16_t k = 0; k < subCount; ++k) {
                        if (end - p < 6) break;
                        SubSample ss;
                        ss.clearBytes = rd16(p);
                        ss.encryptedBytes = rd32(p + 2);
                        res.samples[i].subsamples.push_back(ss);
                        p += 6;
                    }
                }
            }
        }
    } else if (!hasSenc && !(ivSize == 0 && constIVSize > 0)) {
        // No senc and no constant IV: cannot recover per-sample IVs in this version.
        res.error = "senc not found (saiz/saio fallback not implemented)";
        return res;
    }

    // --- rebuild plaintext moov ---
    RewriteCtx ctx;
    emitBox(moovBox, ctx);

    // --- assemble plaintext header: ftyp + rewritten moov + mdat box header ---
    res.mdatPayloadSize = mdatPayloadSize;
    uint64_t mdatBoxSize = mdatPayloadSize + 8; // 32-bit mdat header (audio < 4GB)
    res.headerSize = static_cast<uint64_t>(ftypLen) + ctx.out.size() + 8;
    res.outputTotalSize = res.headerSize + mdatPayloadSize;

    // fix stco/co64 chunk offsets to point into the output mdat
    for (const StcoRef& ref : ctx.stcoRefs) {
        for (uint32_t i = 0; i < ref.count; ++i) {
            uint8_t* slot = &ctx.out[ref.dataOffsetInOut + static_cast<uint64_t>(i) * (ref.is64 ? 8 : 4)];
            uint64_t oldOff = ref.is64 ? rd64(slot) : rd32(slot);
            uint64_t newOff = res.headerSize + (oldOff - mdatPayloadFileOffset);
            if (ref.is64) {
                wr32(slot, static_cast<uint32_t>(newOff >> 32));
                wr32(slot + 4, static_cast<uint32_t>(newOff));
            } else {
                wr32(slot, static_cast<uint32_t>(newOff));
            }
        }
    }

    res.plaintextHeader.reserve(static_cast<size_t>(res.headerSize));
    appendBytes(res.plaintextHeader, ftyp, ftypLen);
    res.plaintextHeader.insert(res.plaintextHeader.end(), ctx.out.begin(), ctx.out.end());
    appendU32(res.plaintextHeader, static_cast<uint32_t>(mdatBoxSize));
    res.plaintextHeader.push_back('m');
    res.plaintextHeader.push_back('d');
    res.plaintextHeader.push_back('a');
    res.plaintextHeader.push_back('t');

    res.ok = true;
    return res;
}

} // namespace ence
