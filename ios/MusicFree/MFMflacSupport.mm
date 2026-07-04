#import "MFMflacSupport.h"

#import <arpa/inet.h>
#import <cmath>
#import <cstdio>
#import <cstring>
#import <algorithm>
#import <fstream>
#import <memory>
#import <netinet/in.h>
#import <stdexcept>
#import <string>
#import <sys/socket.h>
#import <unistd.h>
#import <utility>
#import <vector>

static NSString *const MFMflacErrorDomain = @"MFMflacSupport";
static const int MFMflacDefaultPort = 17173;
static const int MFMflacMaxHeaderBytes = 64 * 1024;

static NSError *MFMflacMakeError(NSString *message) {
  return [NSError errorWithDomain:MFMflacErrorDomain
                             code:1
                         userInfo:@{NSLocalizedDescriptionKey: message ?: @"MFLAC error"}];
}

static BOOL MFMflacSetError(NSError **error, NSString *message) {
  if (error) {
    *error = MFMflacMakeError(message);
  }
  return NO;
}

static std::string MFMflacString(NSString *value) {
  return value ? std::string([value UTF8String] ?: "") : std::string();
}

static NSString *MFMflacNormalizeEkey(NSString *ekey) {
  NSString *trimmed = [ekey stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (trimmed.length > 704) {
    return [trimmed substringFromIndex:trimmed.length - 704];
  }
  return trimmed;
}

namespace {

const int ROUNDS = 16;
const uint32_t DELTA = 0x9e3779b9U;
const size_t SALT_LEN = 2;
const size_t ZERO_LEN = 7;
const size_t FIXED_PADDING_LEN = 1 + SALT_LEN + ZERO_LEN;
const char *EKEY_V2_PREFIX = "UVFNdXNpYyBFbmNWMixLZXk6";
const uint8_t EKEY_V2_KEY1[16] = {
    0x33, 0x38, 0x36, 0x5a, 0x4a, 0x59, 0x21, 0x40,
    0x23, 0x2a, 0x24, 0x25, 0x5e, 0x26, 0x29, 0x28,
};
const uint8_t EKEY_V2_KEY2[16] = {
    0x2a, 0x2a, 0x23, 0x21, 0x28, 0x23, 0x24, 0x25,
    0x26, 0x5e, 0x61, 0x31, 0x63, 0x5a, 0x2c, 0x54,
};

uint32_t readU32BE(const std::vector<uint8_t> &b, size_t off) {
  return (static_cast<uint32_t>(b[off]) << 24) |
         (static_cast<uint32_t>(b[off + 1]) << 16) |
         (static_cast<uint32_t>(b[off + 2]) << 8) |
         static_cast<uint32_t>(b[off + 3]);
}

void writeU32BE(std::vector<uint8_t> &b, size_t off, uint32_t v) {
  b[off] = static_cast<uint8_t>((v >> 24) & 0xff);
  b[off + 1] = static_cast<uint8_t>((v >> 16) & 0xff);
  b[off + 2] = static_cast<uint8_t>((v >> 8) & 0xff);
  b[off + 3] = static_cast<uint8_t>(v & 0xff);
}

std::vector<uint32_t> parseKey(const std::vector<uint8_t> &key) {
  if (key.size() != 16) {
    throw std::runtime_error("Key must be 16 bytes");
  }
  return {
      readU32BE(key, 0),
      readU32BE(key, 4),
      readU32BE(key, 8),
      readU32BE(key, 12),
  };
}

uint32_t ecbSingleRound(uint32_t value, uint32_t sum, uint32_t key1, uint32_t key2) {
  uint32_t left = static_cast<uint32_t>((value << 4) + key1);
  uint32_t right = static_cast<uint32_t>((value >> 5) + key2);
  uint32_t mid = static_cast<uint32_t>(sum + value);
  return left ^ mid ^ right;
}

std::pair<uint32_t, uint32_t> decryptBlock(uint32_t blockHi, uint32_t blockLo, const std::vector<uint32_t> &keyWords) {
  uint32_t y = blockHi;
  uint32_t z = blockLo;
  uint32_t sum = static_cast<uint32_t>(DELTA * ROUNDS);
  for (int round = 0; round < ROUNDS; ++round) {
    z = static_cast<uint32_t>(z - ecbSingleRound(y, sum, keyWords[2], keyWords[3]));
    y = static_cast<uint32_t>(y - ecbSingleRound(z, sum, keyWords[0], keyWords[1]));
    sum = static_cast<uint32_t>(sum - DELTA);
  }
  return {y, z};
}

std::vector<uint8_t> tcTeaDecrypt(const std::vector<uint8_t> &cipher, const std::vector<uint8_t> &key) {
  if (cipher.size() % 8 != 0 || cipher.size() < FIXED_PADDING_LEN) {
    throw std::runtime_error("Invalid cipher length");
  }

  std::vector<uint32_t> keyWords = parseKey(key);
  std::vector<uint8_t> plain(cipher.size());
  uint32_t iv1Hi = 0;
  uint32_t iv1Lo = 0;
  uint32_t iv2Hi = 0;
  uint32_t iv2Lo = 0;

  for (size_t off = 0; off < cipher.size(); off += 8) {
    uint32_t cHi = readU32BE(cipher, off);
    uint32_t cLo = readU32BE(cipher, off + 4);
    uint32_t xHi = cHi ^ iv2Hi;
    uint32_t xLo = cLo ^ iv2Lo;
    auto d = decryptBlock(xHi, xLo, keyWords);
    uint32_t pHi = d.first ^ iv1Hi;
    uint32_t pLo = d.second ^ iv1Lo;
    writeU32BE(plain, off, pHi);
    writeU32BE(plain, off + 4, pLo);
    iv1Hi = cHi;
    iv1Lo = cLo;
    iv2Hi = d.first;
    iv2Lo = d.second;
  }

  size_t padSize = plain[0] & 0x7;
  size_t start = 1 + padSize + SALT_LEN;
  size_t end = cipher.size() - ZERO_LEN;
  if (start > end || end > plain.size()) {
    throw std::runtime_error("Invalid padding");
  }
  for (size_t i = end; i < plain.size(); ++i) {
    if (plain[i] != 0) {
      throw std::runtime_error("Invalid padding");
    }
  }
  return std::vector<uint8_t>(plain.begin() + start, plain.begin() + end);
}

std::vector<uint8_t> makeSimpleKey(size_t len = 8) {
  std::vector<uint8_t> result(len);
  for (size_t i = 0; i < len; ++i) {
    double value = 106.0 + static_cast<double>(i) * 0.1;
    double scaled = std::abs(std::tan(value)) * 100.0;
    result[i] = static_cast<uint8_t>(static_cast<int>(scaled) & 0xff);
  }
  return result;
}

std::vector<uint8_t> base64Decode(const std::string &text) {
  NSString *encoded = [[NSString alloc] initWithBytes:text.data()
                                               length:text.size()
                                             encoding:NSUTF8StringEncoding];
  NSData *decoded = [[NSData alloc] initWithBase64EncodedString:encoded ?: @""
                                                        options:NSDataBase64DecodingIgnoreUnknownCharacters];
  if (!decoded) {
    throw std::runtime_error("Invalid base64 ekey");
  }
  const uint8_t *bytes = static_cast<const uint8_t *>(decoded.bytes);
  return std::vector<uint8_t>(bytes, bytes + decoded.length);
}

std::vector<uint8_t> decryptEKeyV1(const std::string &base64) {
  std::vector<uint8_t> decoded = base64Decode(base64);
  if (decoded.size() < 12) {
    throw std::runtime_error("EKey too short");
  }
  std::vector<uint8_t> header(decoded.begin(), decoded.begin() + 8);
  std::vector<uint8_t> cipher(decoded.begin() + 8, decoded.end());
  std::vector<uint8_t> simpleKey = makeSimpleKey();
  std::vector<uint8_t> teaKey(16);
  for (size_t i = 0; i < 8; ++i) {
    teaKey[i * 2] = simpleKey[i];
    teaKey[i * 2 + 1] = header[i];
  }
  std::vector<uint8_t> recovered = tcTeaDecrypt(cipher, teaKey);
  header.insert(header.end(), recovered.begin(), recovered.end());
  return header;
}

std::vector<uint8_t> decryptEKeyV2(const std::string &base64) {
  std::string payload = base64;
  std::string prefix(EKEY_V2_PREFIX);
  if (payload.rfind(prefix, 0) == 0) {
    payload = payload.substr(prefix.size());
  }

  std::vector<uint8_t> data = base64Decode(payload);
  data = tcTeaDecrypt(data, std::vector<uint8_t>(EKEY_V2_KEY1, EKEY_V2_KEY1 + 16));
  data = tcTeaDecrypt(data, std::vector<uint8_t>(EKEY_V2_KEY2, EKEY_V2_KEY2 + 16));
  size_t end = data.size();
  while (end > 0 && data[end - 1] == 0) {
    --end;
  }
  return decryptEKeyV1(std::string(data.begin(), data.begin() + end));
}

std::vector<uint8_t> decryptEKey(const std::string &base64) {
  std::string prefix(EKEY_V2_PREFIX);
  return base64.rfind(prefix, 0) == 0 ? decryptEKeyV2(base64) : decryptEKeyV1(base64);
}

double calculateQMCHash(const std::vector<uint8_t> &key) {
  uint32_t hash = 1;
  for (uint8_t b : key) {
    uint32_t v = b;
    if (v == 0) {
      continue;
    }
    uint32_t next = static_cast<uint32_t>(hash * v);
    if (next == 0 || next <= hash) {
      break;
    }
    hash = next;
  }
  return static_cast<double>(hash);
}

uint64_t getSegmentKey(uint64_t id, int seed, double hash) {
  if (seed == 0) {
    return 0;
  }
  double denominator = static_cast<double>(id + 1) * static_cast<double>(seed);
  return static_cast<uint64_t>(std::floor((hash / denominator) * 100.0));
}

std::vector<uint8_t> keyCompress(const std::vector<uint8_t> &longKey) {
  const uint64_t INDEX_OFFSET = 71214;
  const size_t V1_KEY_SIZE = 128;
  if (longKey.empty()) {
    throw std::runtime_error("Key is empty");
  }
  std::vector<uint8_t> result(V1_KEY_SIZE);
  for (size_t i = 0; i < V1_KEY_SIZE; ++i) {
    size_t index = static_cast<size_t>((i * i + INDEX_OFFSET) % longKey.size());
    uint8_t key = longKey[index];
    size_t shift = (index + 4) % 8;
    uint8_t left = static_cast<uint8_t>((key << shift) & 0xff);
    uint8_t right = static_cast<uint8_t>(key >> shift);
    result[i] = left | right;
  }
  return result;
}

uint8_t qmc1Transform(const std::vector<uint8_t> &key, uint8_t value, uint64_t offset) {
  const uint64_t V1_OFFSET_BOUNDARY = 0x7FFF;
  const size_t V1_KEY_SIZE = 128;
  uint64_t off = offset > V1_OFFSET_BOUNDARY ? offset % V1_OFFSET_BOUNDARY : offset;
  return static_cast<uint8_t>(value ^ key[off % V1_KEY_SIZE]);
}

class RC4 {
public:
  explicit RC4(const std::vector<uint8_t> &key) : key_(key), state_(key.size()) {
    if (key_.empty()) {
      throw std::runtime_error("RC4 requires non-empty key");
    }
    for (size_t idx = 0; idx < state_.size(); ++idx) {
      state_[idx] = static_cast<uint8_t>(idx & 0xff);
    }
    size_t jj = 0;
    for (size_t ii = 0; ii < state_.size(); ++ii) {
      jj = (jj + state_[ii] + key_[ii % key_.size()]) % state_.size();
      std::swap(state_[ii], state_[jj]);
    }
  }

  void derive(std::vector<uint8_t> &buf) {
    for (uint8_t &b : buf) {
      b = static_cast<uint8_t>(b ^ generate());
    }
  }

private:
  uint8_t generate() {
    i_ = (i_ + 1) % state_.size();
    j_ = (j_ + state_[i_]) % state_.size();
    std::swap(state_[i_], state_[j_]);
    size_t index = (state_[i_] + state_[j_]) % state_.size();
    return state_[index];
  }

  std::vector<uint8_t> key_;
  std::vector<uint8_t> state_;
  size_t i_ = 0;
  size_t j_ = 0;
};

class QMC2Decoder {
public:
  explicit QMC2Decoder(std::vector<uint8_t> rawKey) : rawKey_(std::move(rawKey)) {
    if (rawKey_.empty()) {
      throw std::runtime_error("Key is empty");
    }
    if (rawKey_.size() <= 300) {
      mode_ = Mode::MapL;
      compressedKey_ = keyCompress(rawKey_);
    } else {
      mode_ = Mode::RC4;
      hash_ = calculateQMCHash(rawKey_);
      keyStream_.assign(0x1400 + 512, 0);
      RC4 rc4(rawKey_);
      rc4.derive(keyStream_);
    }
  }

  void decryptChunk(uint8_t *buf, size_t len, uint64_t startOffset) {
    if (len == 0) {
      return;
    }
    if (mode_ == Mode::MapL) {
      for (size_t i = 0; i < len; ++i) {
        buf[i] = qmc1Transform(compressedKey_, buf[i], startOffset + i);
      }
      return;
    }

    const uint64_t FIRST_SEGMENT_SIZE = 0x80;
    const uint64_t OTHER_SEGMENT_SIZE = 0x1400;
    uint64_t offset = startOffset;
    size_t position = 0;

    auto processFirst = [&](uint8_t *data, size_t dataLen, uint64_t off) {
      for (size_t i = 0; i < dataLen; ++i) {
        uint64_t current = off + i;
        int seed = rawKey_[current % rawKey_.size()];
        uint64_t idx = getSegmentKey(current, seed, hash_);
        data[i] = static_cast<uint8_t>(data[i] ^ rawKey_[idx % rawKey_.size()]);
      }
    };

    auto processOther = [&](uint8_t *data, size_t dataLen, uint64_t off) {
      uint64_t id = off / OTHER_SEGMENT_SIZE;
      uint64_t blockOffset = off % OTHER_SEGMENT_SIZE;
      int seed = rawKey_[id % rawKey_.size()];
      uint64_t skip = getSegmentKey(id, seed, hash_) & 0x1ff;
      for (size_t i = 0; i < dataLen; ++i) {
        uint64_t streamIdx = skip + blockOffset + i;
        if (streamIdx < keyStream_.size()) {
          data[i] = static_cast<uint8_t>(data[i] ^ keyStream_[streamIdx]);
        }
      }
    };

    if (offset < FIRST_SEGMENT_SIZE) {
      size_t amount = static_cast<size_t>(std::min<uint64_t>(FIRST_SEGMENT_SIZE - offset, len));
      processFirst(buf, amount, offset);
      position += amount;
      offset += amount;
    }

    if (position < len && offset >= FIRST_SEGMENT_SIZE && offset % OTHER_SEGMENT_SIZE != 0) {
      uint64_t excess = offset % OTHER_SEGMENT_SIZE;
      size_t amount = static_cast<size_t>(std::min<uint64_t>(OTHER_SEGMENT_SIZE - excess, len - position));
      processOther(buf + position, amount, offset);
      position += amount;
      offset += amount;
    }

    while (position < len) {
      size_t amount = static_cast<size_t>(std::min<uint64_t>(OTHER_SEGMENT_SIZE, len - position));
      processOther(buf + position, amount, offset);
      position += amount;
      offset += amount;
    }
  }

private:
  enum class Mode {
    MapL,
    RC4,
  };

  std::vector<uint8_t> rawKey_;
  std::vector<uint8_t> compressedKey_;
  std::vector<uint8_t> keyStream_;
  Mode mode_ = Mode::MapL;
  double hash_ = 0.0;
};

} // namespace

@interface MFMflacHTTPResult : NSObject
@property (nonatomic, assign) NSInteger statusCode;
@property (nonatomic, strong) NSDictionary<NSString *, NSString *> *headers;
@property (nonatomic, strong) NSData *body;
@end

@implementation MFMflacHTTPResult
@end

@interface MFMflacStreamSession : NSObject {
@public
  std::vector<uint8_t> key;
}
@property (nonatomic, copy) NSString *token;
@property (nonatomic, copy) NSString *src;
@property (nonatomic, strong) NSDictionary<NSString *, NSString *> *headers;
@property (nonatomic, strong, nullable) NSNumber *totalLength;
@property (nonatomic, strong, nullable) NSNumber *supportsRange;
@end

@implementation MFMflacStreamSession
@end

typedef struct {
  BOOL present;
  BOOL valid;
  long long start;
  long long end;
  BOOL hasEnd;
} MFMflacRange;

static NSString *MFMflacHeaderValue(NSDictionary<NSString *, NSString *> *headers, NSString *name) {
  return headers[[name lowercaseString]];
}

static NSDictionary<NSString *, NSString *> *MFMflacNormalizeHeaders(NSDictionary *headers) {
  NSMutableDictionary<NSString *, NSString *> *result = [NSMutableDictionary dictionary];
  if (![headers isKindOfClass:[NSDictionary class]]) {
    return result;
  }
  [headers enumerateKeysAndObjectsUsingBlock:^(id key, id obj, BOOL *stop) {
    if (![key isKindOfClass:[NSString class]] || obj == [NSNull null]) {
      return;
    }
    NSString *value = [obj isKindOfClass:[NSString class]] ? obj : [obj description];
    result[(NSString *)key] = value;
  }];
  return result;
}

static NSDictionary<NSString *, NSString *> *MFMflacLowercaseResponseHeaders(NSHTTPURLResponse *response) {
  NSMutableDictionary<NSString *, NSString *> *headers = [NSMutableDictionary dictionary];
  [response.allHeaderFields enumerateKeysAndObjectsUsingBlock:^(id key, id obj, BOOL *stop) {
    NSString *name = [[key description] lowercaseString];
    headers[name] = [obj description];
  }];
  return headers;
}

static MFMflacHTTPResult *MFMflacFetch(NSString *url,
                                       NSDictionary<NSString *, NSString *> *headers,
                                       NSString *method,
                                       NSString *range,
                                       NSError **error) {
  NSURL *requestURL = [NSURL URLWithString:url];
  if (!requestURL) {
    if (error) {
      *error = MFMflacMakeError(@"Invalid upstream URL");
    }
    return nil;
  }

  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:requestURL
                                                         cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                     timeoutInterval:30.0];
  request.HTTPMethod = method;
  [headers enumerateKeysAndObjectsUsingBlock:^(NSString *name, NSString *value, BOOL *stop) {
    NSString *lower = [name lowercaseString];
    if ([lower isEqualToString:@"host"] ||
        [lower isEqualToString:@"range"] ||
        [lower isEqualToString:@"accept-encoding"]) {
      return;
    }
    [request setValue:value forHTTPHeaderField:name];
  }];
  [request setValue:@"identity" forHTTPHeaderField:@"Accept-Encoding"];
  if (range.length > 0) {
    [request setValue:range forHTTPHeaderField:@"Range"];
  }

  dispatch_semaphore_t sema = dispatch_semaphore_create(0);
  __block NSData *body = nil;
  __block NSHTTPURLResponse *httpResponse = nil;
  __block NSError *taskError = nil;

  NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request
                                                               completionHandler:^(NSData *data, NSURLResponse *response, NSError *err) {
    body = data ?: [NSData data];
    httpResponse = [response isKindOfClass:[NSHTTPURLResponse class]] ? (NSHTTPURLResponse *)response : nil;
    taskError = err;
    dispatch_semaphore_signal(sema);
  }];
  [task resume];

  dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(60.0 * NSEC_PER_SEC));
  if (dispatch_semaphore_wait(sema, timeout) != 0) {
    [task cancel];
    if (error) {
      *error = MFMflacMakeError(@"Upstream request timed out");
    }
    return nil;
  }
  if (taskError) {
    if (error) {
      *error = taskError;
    }
    return nil;
  }
  if (!httpResponse) {
    if (error) {
      *error = MFMflacMakeError(@"Invalid upstream response");
    }
    return nil;
  }

  MFMflacHTTPResult *result = [MFMflacHTTPResult new];
  result.statusCode = httpResponse.statusCode;
  result.headers = MFMflacLowercaseResponseHeaders(httpResponse);
  result.body = body ?: [NSData data];
  return result;
}

static long long MFMflacParseTotalFromContentRange(NSString *contentRange) {
  if (contentRange.length == 0) {
    return -1;
  }
  NSRange slash = [contentRange rangeOfString:@"/" options:NSBackwardsSearch];
  if (slash.location == NSNotFound || slash.location + 1 >= contentRange.length) {
    return -1;
  }
  NSString *total = [contentRange substringFromIndex:slash.location + 1];
  if ([total isEqualToString:@"*"]) {
    return -1;
  }
  return total.longLongValue > 0 ? total.longLongValue : -1;
}

static MFMflacRange MFMflacParseRange(NSString *rangeHeader) {
  MFMflacRange range = {NO, NO, 0, 0, NO};
  if (rangeHeader.length == 0) {
    return range;
  }
  range.present = YES;
  NSString *trimmed = [rangeHeader stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (![trimmed hasPrefix:@"bytes="]) {
    return range;
  }
  NSString *body = [trimmed substringFromIndex:6];
  NSRange dash = [body rangeOfString:@"-"];
  if (dash.location == NSNotFound) {
    return range;
  }
  NSString *startText = [body substringToIndex:dash.location];
  NSString *endText = [body substringFromIndex:dash.location + 1];
  if (startText.length == 0) {
    return range;
  }
  range.start = startText.longLongValue;
  if (range.start < 0) {
    return range;
  }
  if (endText.length > 0) {
    range.end = endText.longLongValue;
    range.hasEnd = YES;
    if (range.end < range.start) {
      return range;
    }
  }
  range.valid = YES;
  return range;
}

static NSData *MFMflacSubdata(NSData *data, NSUInteger location, NSUInteger length) {
  if (location >= data.length) {
    return [NSData data];
  }
  NSUInteger safeLength = MIN(length, data.length - location);
  return [data subdataWithRange:NSMakeRange(location, safeLength)];
}

static BOOL MFMflacSendAll(int fd, const void *bytes, size_t length) {
  const uint8_t *cursor = static_cast<const uint8_t *>(bytes);
  size_t remaining = length;
  while (remaining > 0) {
    ssize_t sent = send(fd, cursor, remaining, 0);
    if (sent <= 0) {
      return NO;
    }
    cursor += sent;
    remaining -= static_cast<size_t>(sent);
  }
  return YES;
}

static NSString *MFMflacStatusText(NSInteger status) {
  switch (status) {
    case 200: return @"OK";
    case 206: return @"Partial Content";
    case 400: return @"Bad Request";
    case 404: return @"Not Found";
    case 405: return @"Method Not Allowed";
    case 416: return @"Range Not Satisfiable";
    case 500: return @"Internal Server Error";
    default: return @"OK";
  }
}

static void MFMflacSendResponse(int fd,
                                NSInteger status,
                                NSString *contentType,
                                NSDictionary<NSString *, NSString *> *headers,
                                NSData *body,
                                BOOL headOnly) {
  NSMutableString *head = [NSMutableString stringWithFormat:@"HTTP/1.1 %ld %@\r\nConnection: close\r\n",
                           (long)status,
                           MFMflacStatusText(status)];
  [head appendFormat:@"Content-Type: %@\r\n", contentType ?: @"application/octet-stream"];
  [headers enumerateKeysAndObjectsUsingBlock:^(NSString *name, NSString *value, BOOL *stop) {
    [head appendFormat:@"%@: %@\r\n", name, value];
  }];
  if (!headers[@"Content-Length"]) {
    [head appendFormat:@"Content-Length: %lu\r\n", (unsigned long)(headOnly ? 0 : body.length)];
  }
  [head appendString:@"\r\n"];

  NSData *headerData = [head dataUsingEncoding:NSISOLatin1StringEncoding];
  MFMflacSendAll(fd, headerData.bytes, headerData.length);
  if (!headOnly && body.length > 0) {
    MFMflacSendAll(fd, body.bytes, body.length);
  }
}

static NSData *MFMflacReadRequestHeader(int fd) {
  NSMutableData *data = [NSMutableData data];
  uint8_t buffer[1024];
  NSData *marker = [@"\r\n\r\n" dataUsingEncoding:NSISOLatin1StringEncoding];
  while (data.length < MFMflacMaxHeaderBytes) {
    ssize_t readCount = recv(fd, buffer, sizeof(buffer), 0);
    if (readCount <= 0) {
      break;
    }
    [data appendBytes:buffer length:static_cast<NSUInteger>(readCount)];
    if ([data rangeOfData:marker options:0 range:NSMakeRange(0, data.length)].location != NSNotFound) {
      break;
    }
  }
  return data;
}

static NSDictionary<NSString *, NSString *> *MFMflacParseRequestHeaders(NSArray<NSString *> *lines) {
  NSMutableDictionary<NSString *, NSString *> *headers = [NSMutableDictionary dictionary];
  for (NSUInteger i = 1; i < lines.count; ++i) {
    NSString *line = lines[i];
    if (line.length == 0) {
      break;
    }
    NSRange colon = [line rangeOfString:@":"];
    if (colon.location == NSNotFound) {
      continue;
    }
    NSString *name = [[[line substringToIndex:colon.location] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] lowercaseString];
    NSString *value = [[line substringFromIndex:colon.location + 1] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    headers[name] = value;
  }
  return headers;
}

static NSString *MFMflacMimeType(NSString *src) {
  NSString *path = [[[src componentsSeparatedByString:@"?"] firstObject] lowercaseString];
  if ([path hasSuffix:@".mgg"]) {
    return @"audio/ogg";
  }
  if ([path hasSuffix:@".mmp4"]) {
    return @"audio/mp4";
  }
  return @"audio/flac";
}

@interface MFMflacProxy : NSObject
@property (nonatomic, assign) int serverSocket;
@property (nonatomic, assign) int port;
@property (nonatomic, assign) BOOL started;
@property (nonatomic, strong) NSMutableDictionary<NSString *, MFMflacStreamSession *> *sessions;
@property (nonatomic, strong) dispatch_queue_t acceptQueue;
+ (instancetype)shared;
- (nullable NSString *)startWithError:(NSError **)error;
- (nullable NSString *)registerSource:(NSString *)src
                                  ekey:(NSString *)ekey
                               headers:(NSDictionary *)headers
                                 error:(NSError **)error;
@end

@implementation MFMflacProxy

+ (instancetype)shared {
  static MFMflacProxy *proxy;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    proxy = [MFMflacProxy new];
    proxy.serverSocket = -1;
    proxy.sessions = [NSMutableDictionary dictionary];
    proxy.acceptQueue = dispatch_queue_create("fun.xwj.musicfree.mflac.proxy.accept", DISPATCH_QUEUE_SERIAL);
  });
  return proxy;
}

- (nullable NSString *)startWithError:(NSError **)error {
  @synchronized (self) {
    if (self.started) {
      return [NSString stringWithFormat:@"http://127.0.0.1:%d", self.port];
    }

    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
      MFMflacSetError(error, @"Unable to create MFLAC proxy socket");
      return nil;
    }

    int yes = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));

    if (![self bindSocket:fd port:MFMflacDefaultPort] && ![self bindSocket:fd port:0]) {
      close(fd);
      MFMflacSetError(error, @"Unable to bind MFLAC proxy socket");
      return nil;
    }

    if (listen(fd, SOMAXCONN) != 0) {
      close(fd);
      MFMflacSetError(error, @"Unable to listen on MFLAC proxy socket");
      return nil;
    }

    struct sockaddr_in addr;
    socklen_t len = sizeof(addr);
    if (getsockname(fd, reinterpret_cast<struct sockaddr *>(&addr), &len) != 0) {
      close(fd);
      MFMflacSetError(error, @"Unable to read MFLAC proxy port");
      return nil;
    }

    self.serverSocket = fd;
    self.port = ntohs(addr.sin_port);
    self.started = YES;

    __weak MFMflacProxy *weakSelf = self;
    dispatch_async(self.acceptQueue, ^{
      [weakSelf acceptLoop];
    });

    return [NSString stringWithFormat:@"http://127.0.0.1:%d", self.port];
  }
}

- (BOOL)bindSocket:(int)fd port:(int)port {
  struct sockaddr_in addr;
  std::memset(&addr, 0, sizeof(addr));
  addr.sin_len = sizeof(addr);
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  addr.sin_port = htons(port);
  return bind(fd, reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr)) == 0;
}

- (nullable NSString *)registerSource:(NSString *)src
                                  ekey:(NSString *)ekey
                               headers:(NSDictionary *)headers
                                 error:(NSError **)error {
  NSString *base = [self startWithError:error];
  if (!base) {
    return nil;
  }

  try {
    NSString *cleaned = MFMflacNormalizeEkey(ekey);
    std::vector<uint8_t> decryptedKey = decryptEKey(MFMflacString(cleaned));
    NSString *token = [[[NSUUID UUID] UUIDString] stringByReplacingOccurrencesOfString:@"-" withString:@""];

    MFMflacStreamSession *session = [MFMflacStreamSession new];
    session.token = token;
    session.src = src;
    session.headers = MFMflacNormalizeHeaders(headers);
    session->key = std::move(decryptedKey);

    @synchronized (self) {
      self.sessions[token] = session;
    }
    return [NSString stringWithFormat:@"%@/m/%@", base, token];
  } catch (const std::exception &ex) {
    MFMflacSetError(error, [NSString stringWithUTF8String:ex.what()]);
    return nil;
  }
}

- (void)acceptLoop {
  while (self.started) {
    struct sockaddr_in clientAddr;
    socklen_t len = sizeof(clientAddr);
    int client = accept(self.serverSocket, reinterpret_cast<struct sockaddr *>(&clientAddr), &len);
    if (client < 0) {
      continue;
    }
#ifdef SO_NOSIGPIPE
    int yes = 1;
    setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &yes, sizeof(yes));
#endif
    __weak MFMflacProxy *weakSelf = self;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
      [weakSelf handleClient:client];
      close(client);
    });
  }
}

- (nullable MFMflacStreamSession *)sessionForToken:(NSString *)token {
  @synchronized (self) {
    return self.sessions[token];
  }
}

- (void)handleClient:(int)client {
  @autoreleasepool {
    NSData *requestData = MFMflacReadRequestHeader(client);
    NSString *requestText = [[NSString alloc] initWithData:requestData encoding:NSISOLatin1StringEncoding];
    NSArray<NSString *> *lines = [requestText componentsSeparatedByString:@"\r\n"];
    if (lines.count == 0) {
      MFMflacSendResponse(client, 400, @"text/plain", @{}, [@"bad request" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }

    NSArray<NSString *> *parts = [lines[0] componentsSeparatedByString:@" "];
    if (parts.count < 2) {
      MFMflacSendResponse(client, 400, @"text/plain", @{}, [@"bad request" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }
    NSString *method = parts[0];
    NSString *path = [[parts[1] componentsSeparatedByString:@"?"] firstObject];
    if (![method isEqualToString:@"GET"] && ![method isEqualToString:@"HEAD"]) {
      MFMflacSendResponse(client, 405, @"text/plain", @{}, [@"method not allowed" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }

    NSArray<NSString *> *pathParts = [path componentsSeparatedByString:@"/"];
    if (pathParts.count < 3 || ![pathParts[1] isEqualToString:@"m"]) {
      MFMflacSendResponse(client, 404, @"text/plain", @{}, [@"unknown stream" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }
    MFMflacStreamSession *session = [self sessionForToken:pathParts[2]];
    if (!session) {
      MFMflacSendResponse(client, 404, @"text/plain", @{}, [@"unknown stream" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }

    NSDictionary<NSString *, NSString *> *requestHeaders = MFMflacParseRequestHeaders(lines);
    if ([method isEqualToString:@"HEAD"]) {
      [self handleHeadForSession:session client:client];
    } else {
      [self handleGetForSession:session client:client rangeHeader:requestHeaders[@"range"]];
    }
  }
}

- (void)handleHeadForSession:(MFMflacStreamSession *)session client:(int)client {
  long long total = [self fetchTotalLength:session];
  NSMutableDictionary<NSString *, NSString *> *headers = [@{@"Accept-Ranges": @"bytes"} mutableCopy];
  if (total > 0) {
    headers[@"Content-Length"] = [NSString stringWithFormat:@"%lld", total];
  }
  MFMflacSendResponse(client, 200, MFMflacMimeType(session.src), headers, [NSData data], YES);
}

- (void)handleGetForSession:(MFMflacStreamSession *)session client:(int)client rangeHeader:(NSString *)rangeHeader {
  MFMflacRange range = MFMflacParseRange(rangeHeader);
  if (range.present && !range.valid) {
    MFMflacSendResponse(client, 416, @"text/plain", @{}, [@"invalid range" dataUsingEncoding:NSUTF8StringEncoding], NO);
    return;
  }

  BOOL attemptRange = range.valid && ![session.supportsRange isEqualToNumber:@NO];
  NSString *upstreamRange = nil;
  if (attemptRange) {
    upstreamRange = range.hasEnd
        ? [NSString stringWithFormat:@"bytes=%lld-%lld", range.start, range.end]
        : [NSString stringWithFormat:@"bytes=%lld-", range.start];
  }

  NSError *error = nil;
  MFMflacHTTPResult *upstream = MFMflacFetch(session.src, session.headers, @"GET", upstreamRange, &error);
  if (!upstream || (upstream.statusCode != 200 && upstream.statusCode != 206)) {
    NSString *message = error.localizedDescription ?: [NSString stringWithFormat:@"upstream returned HTTP %ld", (long)upstream.statusCode];
    MFMflacSendResponse(client, 500, @"text/plain", @{}, [message dataUsingEncoding:NSUTF8StringEncoding], NO);
    return;
  }

  if (attemptRange && upstream.statusCode == 206) {
    session.supportsRange = @YES;
  } else if (attemptRange && upstream.statusCode == 200) {
    session.supportsRange = @NO;
  }

  long long total = MFMflacParseTotalFromContentRange(MFMflacHeaderValue(upstream.headers, @"content-range"));
  if (total <= 0 && upstream.statusCode == 200) {
    total = [MFMflacHeaderValue(upstream.headers, @"content-length") longLongValue];
  }
  if (total > 0) {
    session.totalLength = @(total);
  } else if (session.totalLength) {
    total = session.totalLength.longLongValue;
  }

  NSMutableData *body = [upstream.body mutableCopy];
  try {
    QMC2Decoder decoder(session->key);
    uint64_t decryptOffset = (attemptRange && upstream.statusCode == 206) ? static_cast<uint64_t>(range.start) : 0;
    decoder.decryptChunk(static_cast<uint8_t *>(body.mutableBytes), body.length, decryptOffset);
  } catch (const std::exception &ex) {
    MFMflacSendResponse(client, 500, @"text/plain", @{}, [[NSString stringWithUTF8String:ex.what()] dataUsingEncoding:NSUTF8StringEncoding], NO);
    return;
  }

  long long responseStart = range.valid ? range.start : 0;
  if (range.valid && upstream.statusCode != 206) {
    if (range.start >= static_cast<long long>(body.length)) {
      MFMflacSendResponse(client, 416, @"text/plain", @{}, [@"range not satisfiable" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }
    NSUInteger wanted = range.hasEnd ? static_cast<NSUInteger>(range.end - range.start + 1) : body.length - static_cast<NSUInteger>(range.start);
    body = [[MFMflacSubdata(body, static_cast<NSUInteger>(range.start), wanted) mutableCopy];
  } else if (range.valid && range.hasEnd) {
    NSUInteger wanted = static_cast<NSUInteger>(range.end - range.start + 1);
    if (body.length > wanted) {
      body = [[MFMflacSubdata(body, 0, wanted) mutableCopy];
    }
  }

  NSInteger status = range.valid ? 206 : 200;
  NSMutableDictionary<NSString *, NSString *> *headers = [@{
      @"Accept-Ranges": @"bytes",
      @"Content-Length": [NSString stringWithFormat:@"%lu", (unsigned long)body.length],
  } mutableCopy];
  if (range.valid && total > 0 && body.length > 0) {
    long long responseEnd = responseStart + static_cast<long long>(body.length) - 1;
    headers[@"Content-Range"] = [NSString stringWithFormat:@"bytes %lld-%lld/%lld", responseStart, responseEnd, total];
  }
  MFMflacSendResponse(client, status, MFMflacMimeType(session.src), headers, body, NO);
}

- (long long)fetchTotalLength:(MFMflacStreamSession *)session {
  if (session.totalLength) {
    return session.totalLength.longLongValue;
  }

  NSError *error = nil;
  MFMflacHTTPResult *head = MFMflacFetch(session.src, session.headers, @"HEAD", nil, &error);
  long long length = [MFMflacHeaderValue(head.headers, @"content-length") longLongValue];
  if (head && head.statusCode >= 200 && head.statusCode < 400 && length > 0) {
    session.totalLength = @(length);
    return length;
  }

  MFMflacHTTPResult *probe = MFMflacFetch(session.src, session.headers, @"GET", @"bytes=0-0", &error);
  long long total = MFMflacParseTotalFromContentRange(MFMflacHeaderValue(probe.headers, @"content-range"));
  if (total <= 0) {
    total = [MFMflacHeaderValue(probe.headers, @"content-length") longLongValue];
  }
  if (total > 0) {
    session.totalLength = @(total);
  }
  return total;
}

@end

@implementation MFMflacSupport

+ (BOOL)decryptFileAtPath:(NSString *)inputPath
               outputPath:(NSString *)outputPath
                     ekey:(NSString *)ekey
                    error:(NSError **)error {
  if (![[NSFileManager defaultManager] fileExistsAtPath:inputPath]) {
    return MFMflacSetError(error, [NSString stringWithFormat:@"Input file not found: %@", inputPath]);
  }

  NSString *parent = [outputPath stringByDeletingLastPathComponent];
  if (parent.length > 0) {
    [[NSFileManager defaultManager] createDirectoryAtPath:parent
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:nil];
  }

  NSString *tempPath = [NSString stringWithFormat:@"%@.%@.tmp", outputPath, [[NSUUID UUID] UUIDString]];

  try {
    std::vector<uint8_t> key = decryptEKey(MFMflacString(MFMflacNormalizeEkey(ekey)));
    QMC2Decoder decoder(key);

    std::ifstream input([inputPath fileSystemRepresentation], std::ios::binary);
    if (!input.is_open()) {
      return MFMflacSetError(error, @"Unable to open encrypted input");
    }
    std::ofstream output([tempPath fileSystemRepresentation], std::ios::binary | std::ios::trunc);
    if (!output.is_open()) {
      return MFMflacSetError(error, @"Unable to create decrypted output");
    }

    std::vector<uint8_t> buffer(128 * 1024);
    uint64_t offset = 0;
    while (input.good()) {
      input.read(reinterpret_cast<char *>(buffer.data()), static_cast<std::streamsize>(buffer.size()));
      std::streamsize readCount = input.gcount();
      if (readCount <= 0) {
        break;
      }
      decoder.decryptChunk(buffer.data(), static_cast<size_t>(readCount), offset);
      output.write(reinterpret_cast<const char *>(buffer.data()), readCount);
      if (!output.good()) {
        throw std::runtime_error("Unable to write decrypted output");
      }
      offset += static_cast<uint64_t>(readCount);
    }
    output.close();
    input.close();

    NSFileManager *manager = [NSFileManager defaultManager];
    if ([manager fileExistsAtPath:outputPath]) {
      [manager removeItemAtPath:outputPath error:nil];
    }
    NSError *moveError = nil;
    if (![manager moveItemAtPath:tempPath toPath:outputPath error:&moveError]) {
      if (moveError) {
        if (error) {
          *error = moveError;
        }
      } else {
        MFMflacSetError(error, @"Unable to replace decrypted output");
      }
      return NO;
    }
    return YES;
  } catch (const std::exception &ex) {
    [[NSFileManager defaultManager] removeItemAtPath:tempPath error:nil];
    return MFMflacSetError(error, [NSString stringWithUTF8String:ex.what()]);
  }
}

+ (nullable NSString *)startProxyWithError:(NSError **)error {
  return [[MFMflacProxy shared] startWithError:error];
}

+ (nullable NSString *)registerStream:(NSString *)src
                                  ekey:(NSString *)ekey
                               headers:(NSDictionary *)headers
                                 error:(NSError **)error {
  return [[MFMflacProxy shared] registerSource:src ekey:ekey headers:headers ?: @{} error:error];
}

@end
