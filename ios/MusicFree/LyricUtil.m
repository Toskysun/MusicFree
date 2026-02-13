#import <React/RCTBridgeModule.h>
#import <zlib.h>

@interface LyricUtil : NSObject <RCTBridgeModule>
@end

@implementation LyricUtil

RCT_EXPORT_MODULE();

// ==================== Permissions / UI Stubs (iOS No-ops) ====================

RCT_EXPORT_METHOD(checkSystemAlertPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@NO); // iOS does not support system alert window overlays
}

RCT_EXPORT_METHOD(requestSystemAlertPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@NO);
}

RCT_EXPORT_METHOD(showStatusBarLyric:(NSString *)initLyric
                  config:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  reject(@"UNSUPPORTED", @"iOS does not support floating lyrics", nil);
}

RCT_EXPORT_METHOD(hideStatusBarLyric:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@YES);
}

RCT_EXPORT_METHOD(setStatusBarLyricText:(NSString *)lyric
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@YES);
}

RCT_EXPORT_METHOD(setStatusBarLyricTop:(double)pct
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@YES);
}

RCT_EXPORT_METHOD(setStatusBarLyricLeft:(double)pct
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@YES);
}

RCT_EXPORT_METHOD(setStatusBarLyricWidth:(double)pct
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@YES);
}

RCT_EXPORT_METHOD(setStatusBarLyricFontSize:(double)fontSize
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@YES);
}

RCT_EXPORT_METHOD(setStatusBarLyricAlign:(int)alignment
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@YES);
}

RCT_EXPORT_METHOD(setStatusBarColors:(NSString *)textColor
                  backgroundColor:(NSString *)backgroundColor
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@YES);
}


// ==================== Helper Functions ====================

// Helper: Hex string to Data
- (NSData *)hexToData:(NSString *)hexString {
    const char *chars = [hexString UTF8String];
    int i = 0;
    NSUInteger len = hexString.length;

    NSMutableData *data = [NSMutableData dataWithCapacity:len / 2];
    char byteChars[3] = {'\0','\0','\0'};
    unsigned long wholeByte;

    while (i < len) {
        byteChars[0] = chars[i++];
        byteChars[1] = chars[i++];
        wholeByte = strtoul(byteChars, NULL, 16);
        [data appendBytes:&wholeByte length:1];
    }
    return data;
}

// Helper: Zlib Inflate
- (NSData *)zlibInflate:(NSData *)data {
    if (data.length == 0) return data;

    NSUInteger full_length = [data length];
    NSUInteger half_length = [data length] / 2;

    NSMutableData *decompressed = [NSMutableData dataWithLength: full_length + half_length];
    BOOL done = NO;
    int status;

    z_stream strm;
    strm.next_in = (Bytef *)[data bytes];
    strm.avail_in = (uInt)[data length];
    strm.total_out = 0;
    strm.zalloc = Z_NULL;
    strm.zfree = Z_NULL;

    if (inflateInit(&strm) != Z_OK) return nil;

    while (!done) {
        if (strm.total_out >= [decompressed length]) {
            [decompressed increaseLengthBy: half_length];
        }
        strm.next_out = [decompressed mutableBytes] + strm.total_out;
        strm.avail_out = (uInt)([decompressed length] - strm.total_out);

        status = inflate(&strm, Z_SYNC_FLUSH);
        if (status == Z_STREAM_END) {
            done = YES;
        } else if (status != Z_OK) {
            break;
        }
    }
    if (inflateEnd(&strm) != Z_OK) return nil;

    if (done) {
        [decompressed setLength: strm.total_out];
        return [NSData dataWithData: decompressed];
    } else {
        return nil;
    }
}

// ==================== Kuwo Lyric Decryption ====================

RCT_EXPORT_METHOD(decryptKuwoLyric:(NSString *)lrcBase64
                  isGetLyricx:(BOOL)isGetLyricx
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        if (!lrcBase64) {
            resolve(@"");
            return;
        }

        // 1. Base64 Decode
        NSData *lrcBuffer = [[NSData alloc] initWithBase64EncodedString:lrcBase64 options:0];
        if (!lrcBuffer) {
            resolve(@"");
            return;
        }

        const char *bytes = [lrcBuffer bytes];
        NSUInteger len = [lrcBuffer length];

        // 2. Check header "tp=content"
        NSString *headerCheck = [[NSString alloc] initWithBytes:bytes length:MIN(10, len) encoding:NSUTF8StringEncoding];
        if (![headerCheck isEqualToString:@"tp=content"]) {
            resolve(@"");
            return;
        }

        // 3. Find \r\n\r\n
        NSUInteger headerEndIndex = NSNotFound;
        for (NSUInteger i = 0; i < len - 3; i++) {
            if (bytes[i] == '\r' && bytes[i+1] == '\n' && bytes[i+2] == '\r' && bytes[i+3] == '\n') {
                headerEndIndex = i;
                break;
            }
        }

        if (headerEndIndex == NSNotFound) {
            reject(@"KW_INVALID_FORMAT", @"Header end marker not found", nil);
            return;
        }

        NSData *lrcData = [lrcBuffer subdataWithRange:NSMakeRange(headerEndIndex + 4, len - (headerEndIndex + 4))];

        // 4. Zlib Inflate
        NSData *inflatedData = [self zlibInflate:lrcData];
        if (!inflatedData) {
            reject(@"KW_DECRYPT_ERROR", @"Zlib inflate failed", nil);
            return;
        }

        NSData *finalData = inflatedData;

        // 5. XOR Decrypt if needed (isGetLyricx)
        if (isGetLyricx) {
            NSString *keyStr = @"yeelion";
            const char *keyBytes = [keyStr UTF8String];
            NSUInteger keyLen = [keyStr lengthOfBytesUsingEncoding:NSUTF8StringEncoding];

            // Base64 decode again (Logic ported from Android: xorDecrypt method first decodes base64)
            // Wait, standard Kuwo logic usually implies the INFLATED data is the text.
            // But looking at Android code: xorDecrypt takes ByteArray, turns it into String, then Base64 decodes it?
            // "val base64Str = String(data, StandardCharsets.UTF_8)"
            // "val buf = android.util.Base64.decode(base64Str, ...)"
            // This implies inflatedData is actually a Base64 string encoded in bytes.

            NSString *inflatedString = [[NSString alloc] initWithData:inflatedData encoding:NSUTF8StringEncoding];
            if (inflatedString) {
                NSData *buf = [[NSData alloc] initWithBase64EncodedString:inflatedString options:0];
                if (buf) {
                    NSMutableData *xorOutput = [NSMutableData dataWithLength:[buf length]];
                    unsigned char *outBytes = [xorOutput mutableBytes];
                    const unsigned char *bufBytes = [buf bytes];
                    NSUInteger bufLen = [buf length];

                    NSUInteger j = 0;
                    for (NSUInteger i = 0; i < bufLen; i++) {
                        outBytes[i] = bufBytes[i] ^ keyBytes[j];
                        j = (j + 1) % keyLen;
                    }
                    finalData = xorOutput;
                }
            }
        }

        // 6. Decode GB18030
        NSStringEncoding gb18030 = CFStringConvertEncodingToNSStringEncoding(kCFStringEncodingGB_18030_2000);
        NSString *result = [[NSString alloc] initWithData:finalData encoding:gb18030];

        if (!result) {
            // Fallback to GBK
            NSStringEncoding gbk = CFStringConvertEncodingToNSStringEncoding(kCFStringEncodingGBK_95);
            result = [[NSString alloc] initWithData:finalData encoding:gbk];
        }
        if (!result) {
            // Fallback to UTF8
            result = [[NSString alloc] initWithData:finalData encoding:NSUTF8StringEncoding];
        }

        resolve(result ? result : @"");

    } @catch (NSException *exception) {
        reject(@"KW_DECRYPT_ERROR", exception.reason, nil);
    }
}


// ==================== Custom DES (QRC) Implementation ====================

// S-Boxes
static const unsigned char S_BOX1[64] = {
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
    0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
    15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13
};

static const unsigned char S_BOX2[64] = {
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
    3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
    13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9
};

static const unsigned char S_BOX3[64] = {
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
    13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
    1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12
};

static const unsigned char S_BOX4[64] = {
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
    13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
    3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14
};

static const unsigned char S_BOX5[64] = {
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
    14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
    11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3
};

static const unsigned char S_BOX6[64] = {
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
    10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
    4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13
};

static const unsigned char S_BOX7[64] = {
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
    13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
    6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12
};

static const unsigned char S_BOX8[64] = {
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
    1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
    2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11
};

// Keys
static const char *KEY1 = "!@#)(NHLiuy*$%^&";
static const char *KEY2 = "123ZXC!@#)(*$%^&";
static const char *KEY3 = "!@#)(*$%^&abcDEF";

// Bit Utils
int bitNum(const unsigned char *a, int b, int c) {
    int byteIndex = (b / 32) * 4 + 3 - ((b % 32) / 8);
    int bitPosition = 7 - (b % 8);
    int extractedBit = (a[byteIndex] >> bitPosition) & 0x01;
    return extractedBit << c;
}

int bitNumIntR(int a, int b, int c) {
    int extractedBit = ((unsigned int)a >> (31 - b)) & 0x00000001;
    return extractedBit << c;
}

int bitNumIntL(int a, int b, int c) {
    // Note: In Java/Kotlin (a shl b) is signed shift, but logic implies we just want bits
    // Kotlin: ((a shl b) and 0x80000000.toInt()) ushr c
    // C:
    unsigned int ua = (unsigned int)a;
    unsigned int extractedBit = ((ua << b) & 0x80000000);
    return extractedBit >> c;
}

int sBoxBit(int a) {
    int part1 = a & 0x20;
    int part2 = (a & 0x1f) >> 1;
    int part3 = (a & 0x01) << 4;
    return part1 | part2 | part3;
}

// Initial Permutation
void ip_perm(int *state, const unsigned char *inBytes) {
    state[0] = (
        bitNum(inBytes, 57, 31) | bitNum(inBytes, 49, 30) | bitNum(inBytes, 41, 29) |
        bitNum(inBytes, 33, 28) | bitNum(inBytes, 25, 27) | bitNum(inBytes, 17, 26) |
        bitNum(inBytes, 9, 25) | bitNum(inBytes, 1, 24) | bitNum(inBytes, 59, 23) |
        bitNum(inBytes, 51, 22) | bitNum(inBytes, 43, 21) | bitNum(inBytes, 35, 20) |
        bitNum(inBytes, 27, 19) | bitNum(inBytes, 19, 18) | bitNum(inBytes, 11, 17) |
        bitNum(inBytes, 3, 16) | bitNum(inBytes, 61, 15) | bitNum(inBytes, 53, 14) |
        bitNum(inBytes, 45, 13) | bitNum(inBytes, 37, 12) | bitNum(inBytes, 29, 11) |
        bitNum(inBytes, 21, 10) | bitNum(inBytes, 13, 9) | bitNum(inBytes, 5, 8) |
        bitNum(inBytes, 63, 7) | bitNum(inBytes, 55, 6) | bitNum(inBytes, 47, 5) |
        bitNum(inBytes, 39, 4) | bitNum(inBytes, 31, 3) | bitNum(inBytes, 23, 2) |
        bitNum(inBytes, 15, 1) | bitNum(inBytes, 7, 0)
    );

    state[1] = (
        bitNum(inBytes, 56, 31) | bitNum(inBytes, 48, 30) | bitNum(inBytes, 40, 29) |
        bitNum(inBytes, 32, 28) | bitNum(inBytes, 24, 27) | bitNum(inBytes, 16, 26) |
        bitNum(inBytes, 8, 25) | bitNum(inBytes, 0, 24) | bitNum(inBytes, 58, 23) |
        bitNum(inBytes, 50, 22) | bitNum(inBytes, 42, 21) | bitNum(inBytes, 34, 20) |
        bitNum(inBytes, 26, 19) | bitNum(inBytes, 18, 18) | bitNum(inBytes, 10, 17) |
        bitNum(inBytes, 2, 16) | bitNum(inBytes, 60, 15) | bitNum(inBytes, 52, 14) |
        bitNum(inBytes, 44, 13) | bitNum(inBytes, 36, 12) | bitNum(inBytes, 28, 11) |
        bitNum(inBytes, 20, 10) | bitNum(inBytes, 12, 9) | bitNum(inBytes, 4, 8) |
        bitNum(inBytes, 62, 7) | bitNum(inBytes, 54, 6) | bitNum(inBytes, 46, 5) |
        bitNum(inBytes, 38, 4) | bitNum(inBytes, 30, 3) | bitNum(inBytes, 22, 2) |
        bitNum(inBytes, 14, 1) | bitNum(inBytes, 6, 0)
    );
}

// Inverse IP
void invIp_perm(int *state, unsigned char *inBytes) {
    inBytes[3] = (
        bitNumIntR(state[1], 7, 7) | bitNumIntR(state[0], 7, 6) |
        bitNumIntR(state[1], 15, 5) | bitNumIntR(state[0], 15, 4) |
        bitNumIntR(state[1], 23, 3) | bitNumIntR(state[0], 23, 2) |
        bitNumIntR(state[1], 31, 1) | bitNumIntR(state[0], 31, 0)
    );

    inBytes[2] = (
        bitNumIntR(state[1], 6, 7) | bitNumIntR(state[0], 6, 6) |
        bitNumIntR(state[1], 14, 5) | bitNumIntR(state[0], 14, 4) |
        bitNumIntR(state[1], 22, 3) | bitNumIntR(state[0], 22, 2) |
        bitNumIntR(state[1], 30, 1) | bitNumIntR(state[0], 30, 0)
    );

    inBytes[1] = (
        bitNumIntR(state[1], 5, 7) | bitNumIntR(state[0], 5, 6) |
        bitNumIntR(state[1], 13, 5) | bitNumIntR(state[0], 13, 4) |
        bitNumIntR(state[1], 21, 3) | bitNumIntR(state[0], 21, 2) |
        bitNumIntR(state[1], 29, 1) | bitNumIntR(state[0], 29, 0)
    );

    inBytes[0] = (
        bitNumIntR(state[1], 4, 7) | bitNumIntR(state[0], 4, 6) |
        bitNumIntR(state[1], 12, 5) | bitNumIntR(state[0], 12, 4) |
        bitNumIntR(state[1], 20, 3) | bitNumIntR(state[0], 20, 2) |
        bitNumIntR(state[1], 28, 1) | bitNumIntR(state[0], 28, 0)
    );

    inBytes[7] = (
        bitNumIntR(state[1], 3, 7) | bitNumIntR(state[0], 3, 6) |
        bitNumIntR(state[1], 11, 5) | bitNumIntR(state[0], 11, 4) |
        bitNumIntR(state[1], 19, 3) | bitNumIntR(state[0], 19, 2) |
        bitNumIntR(state[1], 27, 1) | bitNumIntR(state[0], 27, 0)
    );

    inBytes[6] = (
        bitNumIntR(state[1], 2, 7) | bitNumIntR(state[0], 2, 6) |
        bitNumIntR(state[1], 10, 5) | bitNumIntR(state[0], 10, 4) |
        bitNumIntR(state[1], 18, 3) | bitNumIntR(state[0], 18, 2) |
        bitNumIntR(state[1], 26, 1) | bitNumIntR(state[0], 26, 0)
    );

    inBytes[5] = (
        bitNumIntR(state[1], 1, 7) | bitNumIntR(state[0], 1, 6) |
        bitNumIntR(state[1], 9, 5) | bitNumIntR(state[0], 9, 4) |
        bitNumIntR(state[1], 17, 3) | bitNumIntR(state[0], 17, 2) |
        bitNumIntR(state[1], 25, 1) | bitNumIntR(state[0], 25, 0)
    );

    inBytes[4] = (
        bitNumIntR(state[1], 0, 7) | bitNumIntR(state[0], 0, 6) |
        bitNumIntR(state[1], 8, 5) | bitNumIntR(state[0], 8, 4) |
        bitNumIntR(state[1], 16, 3) | bitNumIntR(state[0], 16, 2) |
        bitNumIntR(state[1], 24, 1) | bitNumIntR(state[0], 24, 0)
    );
}

// Feistel Function f
int f(int state, unsigned char *key) {
    unsigned char lrgstate[6];
    int s = state;

    // Expansion E
    int t1 = (
        bitNumIntL(s, 31, 0) | ((unsigned int)(s & 0xf0000000) >> 1) | bitNumIntL(s, 4, 5) |
        bitNumIntL(s, 3, 6) | ((s & 0x0f000000) >> 3) | bitNumIntL(s, 8, 11) |
        bitNumIntL(s, 7, 12) | ((s & 0x00f00000) >> 5) | bitNumIntL(s, 12, 17) |
        bitNumIntL(s, 11, 18) | ((s & 0x000f0000) >> 7) | bitNumIntL(s, 16, 23)
    );

    int t2 = (
        bitNumIntL(s, 15, 0) | ((s & 0x0000f000) << 15) | bitNumIntL(s, 20, 5) |
        bitNumIntL(s, 19, 6) | ((s & 0x00000f00) << 13) | bitNumIntL(s, 24, 11) |
        bitNumIntL(s, 23, 12) | ((s & 0x000000f0) << 11) | bitNumIntL(s, 28, 17) |
        bitNumIntL(s, 27, 18) | ((s & 0x0000000f) << 9) | bitNumIntL(s, 0, 23)
    );

    lrgstate[0] = (unsigned char)((t1 >> 24) & 0xff);
    lrgstate[1] = (unsigned char)((t1 >> 16) & 0xff);
    lrgstate[2] = (unsigned char)((t1 >> 8) & 0xff);
    lrgstate[3] = (unsigned char)((t2 >> 24) & 0xff);
    lrgstate[4] = (unsigned char)((t2 >> 16) & 0xff);
    lrgstate[5] = (unsigned char)((t2 >> 8) & 0xff);

    // Key XOR
    for (int i = 0; i < 6; i++) {
        lrgstate[i] = lrgstate[i] ^ key[i];
    }

    // S-Box
    s = (
        (S_BOX1[sBoxBit((lrgstate[0] & 0xff) >> 2)] << 28) |
        (S_BOX2[sBoxBit(((lrgstate[0] & 0x03) << 4) | ((lrgstate[1] & 0xff) >> 4))] << 24) |
        (S_BOX3[sBoxBit(((lrgstate[1] & 0x0f) << 2) | ((lrgstate[2] & 0xff) >> 6))] << 20) |
        (S_BOX4[sBoxBit(lrgstate[2] & 0x3f)] << 16) |
        (S_BOX5[sBoxBit((lrgstate[3] & 0xff) >> 2)] << 12) |
        (S_BOX6[sBoxBit(((lrgstate[3] & 0x03) << 4) | ((lrgstate[4] & 0xff) >> 4))] << 8) |
        (S_BOX7[sBoxBit(((lrgstate[4] & 0x0f) << 2) | ((lrgstate[5] & 0xff) >> 6))] << 4) |
        (S_BOX8[sBoxBit(lrgstate[5] & 0x3f)])
    );

    // P-Box
    s = (
        bitNumIntL(s, 15, 0) | bitNumIntL(s, 6, 1) | bitNumIntL(s, 19, 2) |
        bitNumIntL(s, 20, 3) | bitNumIntL(s, 28, 4) | bitNumIntL(s, 11, 5) |
        bitNumIntL(s, 27, 6) | bitNumIntL(s, 16, 7) | bitNumIntL(s, 0, 8) |
        bitNumIntL(s, 14, 9) | bitNumIntL(s, 22, 10) | bitNumIntL(s, 25, 11) |
        bitNumIntL(s, 4, 12) | bitNumIntL(s, 17, 13) | bitNumIntL(s, 30, 14) |
        bitNumIntL(s, 9, 15) | bitNumIntL(s, 1, 16) | bitNumIntL(s, 7, 17) |
        bitNumIntL(s, 23, 18) | bitNumIntL(s, 13, 19) | bitNumIntL(s, 31, 20) |
        bitNumIntL(s, 26, 21) | bitNumIntL(s, 2, 22) | bitNumIntL(s, 8, 23) |
        bitNumIntL(s, 18, 24) | bitNumIntL(s, 12, 25) | bitNumIntL(s, 29, 26) |
        bitNumIntL(s, 5, 27) | bitNumIntL(s, 21, 28) | bitNumIntL(s, 10, 29) |
        bitNumIntL(s, 3, 30) | bitNumIntL(s, 24, 31)
    );

    return s;
}

// Key Setup
void desKeySetup(const unsigned char *key, unsigned char schedule[16][6], int mode) {
    int keyRndShift[] = {1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1};
    int keyPermC[] = {56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17,
                      9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35};
    int keyPermD[] = {62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21,
                      13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3};
    int keyCompression[] = {13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9,
                           22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1,
                           40, 51, 30, 36, 46, 54, 29, 39, 50, 44, 32, 47,
                           43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31};

    int c = 0;
    int d = 0;

    // PC-1
    for (int i = 0; i < 28; i++) {
        c |= bitNum(key, keyPermC[i], 31 - i);
        d |= bitNum(key, keyPermD[i], 31 - i);
    }

    for (int i = 0; i < 16; i++) {
        // Circular shift
        unsigned int uc = (unsigned int)c;
        unsigned int ud = (unsigned int)d;
        c = ((uc << keyRndShift[i]) | (uc >> (28 - keyRndShift[i]))) & 0xfffffff0;
        d = ((ud << keyRndShift[i]) | (ud >> (28 - keyRndShift[i]))) & 0xfffffff0;

        // Decryption subkeys reverse
        // Mode 0: Encrypt, 1: Decrypt (Matches enum in Kotlin: DES_DECRYPT is index 1)
        int toGen = (mode == 1) ? 15 - i : i;

        for (int j = 0; j < 24; j++) {
            schedule[toGen][j / 8] |= bitNumIntR(c, keyCompression[j], 7 - (j % 8));
        }
        for (int j = 24; j < 48; j++) {
            schedule[toGen][j / 8] |= bitNumIntR(d, keyCompression[j] - 27, 7 - (j % 8));
        }
    }
}

// Single block DES
void desCryptBlock(unsigned char *block, unsigned char schedule[16][6]) {
    int state[2] = {0, 0};

    ip_perm(state, block);

    for (int idx = 0; idx < 15; idx++) {
        int t = state[1];
        int i = f(state[1], schedule[idx]);
        state[1] = i ^ state[0];
        state[0] = t;
    }

    // Final round
    state[0] = f(state[1], schedule[15]) ^ state[0];

    invIp_perm(state, block);
}

// Encrypt/Decrypt Buffer
void desProcessBuffer(unsigned char *buff, NSUInteger length, const char *keyStr, int mode) {
    unsigned char schedule[16][6];
    memset(schedule, 0, sizeof(schedule));

    desKeySetup((const unsigned char *)keyStr, schedule, mode);

    for (NSUInteger i = 0; i < length; i += 8) {
        if (i + 8 <= length) {
            desCryptBlock(buff + i, schedule);
        }
    }
}

RCT_EXPORT_METHOD(decryptQRCLyric:(NSString *)encryptedHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        if (!encryptedHex) {
            resolve(@"");
            return;
        }

        // 1. Hex Decode
        NSData *encryptedData = [self hexToData:encryptedHex];
        if (!encryptedData) {
            reject(@"QRC_INVALID_HEX", @"Invalid hex string", nil);
            return;
        }

        NSUInteger len = [encryptedData length];
        NSMutableData *processingData = [encryptedData mutableCopy];
        unsigned char *buffer = [processingData mutableBytes];

        // 2. Triple-DES Decrypt (Custom)
        // DES Decrypt KEY1
        desProcessBuffer(buffer, len, KEY1, 1); // 1 = Decrypt
        // DES Encrypt KEY2
        desProcessBuffer(buffer, len, KEY2, 0); // 0 = Encrypt
        // DES Decrypt KEY3
        desProcessBuffer(buffer, len, KEY3, 1); // 1 = Decrypt

        // 3. Zlib Inflate
        NSData *decompressed = [self zlibInflate:processingData];
        if (!decompressed) {
            reject(@"QRC_DECRYPT_ERROR", @"Zlib inflate failed", nil);
            return;
        }

        // 4. UTF-8 Decode
        NSString *result = [[NSString alloc] initWithData:decompressed encoding:NSUTF8StringEncoding];

        resolve(result ? result : @"");

    } @catch (NSException *exception) {
        reject(@"QRC_DECRYPT_ERROR", exception.reason, nil);
    }
}

@end
