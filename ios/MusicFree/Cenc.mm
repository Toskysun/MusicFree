#import <React/RCTBridgeModule.h>

#import <arpa/inet.h>
#import <algorithm>
#import <cfloat>
#import <cstdio>
#import <cstring>
#import <memory>
#import <netinet/in.h>
#import <stdexcept>
#import <string>
#import <sys/socket.h>
#import <unistd.h>
#import <vector>

#include "../../android/app/src/main/cpp/cenc/cenc_decoder.h"

static NSString *const MFCencErrorDomain = @"MFCenc";
static const int MFCencMaxHeaderBytes = 64 * 1024;
static const long long MFCencProbeSize = 256 * 1024;
static const uint64_t MFCencMaxBoxSize = 64ULL * 1024ULL * 1024ULL;
static const NSUInteger MFCencMaxSessions = 256;

static NSError *MFCencMakeError(NSString *message) {
  return [NSError errorWithDomain:MFCencErrorDomain
                             code:1
                         userInfo:@{NSLocalizedDescriptionKey: message ?: @"CENC error"}];
}

static BOOL MFCencSetError(NSError **error, NSString *message) {
  if (error) {
    *error = MFCencMakeError(message);
  }
  return NO;
}

static BOOL MFCencIsHexKey(NSString *key) {
  if (key.length != 32) {
    return NO;
  }
  NSCharacterSet *hex = [NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdefABCDEF"];
  return [[key stringByTrimmingCharactersInSet:hex] length] == 0;
}

static std::vector<uint8_t> MFCencHexToBytes(NSString *hex) {
  std::vector<uint8_t> bytes(16);
  for (NSUInteger i = 0; i < 16; ++i) {
    NSString *part = [hex substringWithRange:NSMakeRange(i * 2, 2)];
    unsigned int value = 0;
    [[NSScanner scannerWithString:part] scanHexInt:&value];
    bytes[i] = static_cast<uint8_t>(value & 0xff);
  }
  return bytes;
}

static uint64_t MFCencReadU32(const uint8_t *data) {
  return (static_cast<uint64_t>(data[0]) << 24) |
         (static_cast<uint64_t>(data[1]) << 16) |
         (static_cast<uint64_t>(data[2]) << 8) |
         static_cast<uint64_t>(data[3]);
}

static uint64_t MFCencReadU64(const uint8_t *data) {
  return (MFCencReadU32(data) << 32) | MFCencReadU32(data + 4);
}

struct MFCencBoxHeader {
  std::string type;
  uint64_t size = 0;
  uint64_t headerSize = 0;
};

struct MFCencLayout {
  std::vector<uint8_t> ftyp;
  std::vector<uint8_t> moov;
  uint64_t mdatPayloadOffset = 0;
  uint64_t mdatPayloadSize = 0;
};

static BOOL MFCencReadBytes(FILE *file, uint64_t offset, size_t length, std::vector<uint8_t> &out) {
  out.assign(length, 0);
  if (fseeko(file, static_cast<off_t>(offset), SEEK_SET) != 0) {
    return NO;
  }
  return fread(out.data(), 1, length, file) == length;
}

static BOOL MFCencParseBoxHeader(const uint8_t *data,
                                 size_t length,
                                 uint64_t remaining,
                                 MFCencBoxHeader &box) {
  if (length < 8 || remaining < 8) {
    return NO;
  }
  uint64_t size = MFCencReadU32(data);
  uint64_t headerSize = 8;
  if (size == 1) {
    if (length < 16) {
      return NO;
    }
    size = MFCencReadU64(data + 8);
    headerSize = 16;
  } else if (size == 0) {
    size = remaining;
  }
  if (size < headerSize || size > remaining) {
    return NO;
  }
  box.type = std::string(reinterpret_cast<const char *>(data + 4), 4);
  box.size = size;
  box.headerSize = headerSize;
  return YES;
}

static BOOL MFCencDiscoverFileLayout(FILE *input, MFCencLayout &layout, NSError **error) {
  if (fseeko(input, 0, SEEK_END) != 0) {
    return MFCencSetError(error, @"Unable to seek encrypted CENC file");
  }
  off_t fileSizeRaw = ftello(input);
  if (fileSizeRaw < 8) {
    return MFCencSetError(error, @"Encrypted CENC file is empty or truncated");
  }
  uint64_t fileSize = static_cast<uint64_t>(fileSizeRaw);
  BOOL foundMoov = NO;
  BOOL foundMdat = NO;

  uint64_t offset = 0;
  int guard = 0;
  while (offset + 8 <= fileSize && guard++ < 4096) {
    std::vector<uint8_t> header;
    size_t headerLength = static_cast<size_t>(std::min<uint64_t>(16, fileSize - offset));
    if (!MFCencReadBytes(input, offset, headerLength, header)) {
      return MFCencSetError(error, @"Unable to read MP4 box header");
    }
    MFCencBoxHeader box;
    if (!MFCencParseBoxHeader(header.data(), header.size(), fileSize - offset, box)) {
      return MFCencSetError(error, [NSString stringWithFormat:@"Invalid MP4 box at offset %llu", (unsigned long long)offset]);
    }

    if (box.type == "ftyp") {
      if (box.size > MFCencMaxBoxSize) {
        return MFCencSetError(error, @"ftyp box is too large");
      }
      if (!MFCencReadBytes(input, offset, static_cast<size_t>(box.size), layout.ftyp)) {
        return MFCencSetError(error, @"Unable to read ftyp box");
      }
    } else if (box.type == "moov") {
      if (box.size > MFCencMaxBoxSize) {
        return MFCencSetError(error, @"moov box is too large");
      }
      if (!MFCencReadBytes(input, offset, static_cast<size_t>(box.size), layout.moov)) {
        return MFCencSetError(error, @"Unable to read moov box");
      }
      foundMoov = YES;
    } else if (box.type == "mdat") {
      layout.mdatPayloadOffset = offset + box.headerSize;
      layout.mdatPayloadSize = box.size - box.headerSize;
      foundMdat = YES;
    }

    if (foundMoov && foundMdat) {
      return YES;
    }
    offset += box.size;
  }

  if (!foundMoov) {
    return MFCencSetError(error, @"Failed to locate moov box");
  }
  return MFCencSetError(error, @"Failed to locate mdat box");
}

static BOOL MFCencDecryptFile(NSString *inputPath, NSString *outputPath, NSString *cek, NSError **error) {
  NSString *key = [cek stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (!MFCencIsHexKey(key)) {
    return MFCencSetError(error, @"Invalid cek (expected 32 hexadecimal characters)");
  }

  FILE *input = fopen([inputPath fileSystemRepresentation], "rb");
  if (!input) {
    return MFCencSetError(error, [NSString stringWithFormat:@"Encrypted CENC file does not exist: %@", inputPath]);
  }

  NSString *parent = [outputPath stringByDeletingLastPathComponent];
  if (parent.length > 0) {
    [[NSFileManager defaultManager] createDirectoryAtPath:parent
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:nil];
  }
  NSString *tempPath = [NSString stringWithFormat:@"%@.%@.tmp", outputPath, [[NSUUID UUID] UUIDString]];
  FILE *output = nullptr;

  try {
    MFCencLayout layout;
    if (!MFCencDiscoverFileLayout(input, layout, error)) {
      fclose(input);
      return NO;
    }

    std::vector<uint8_t> keyBytes = MFCencHexToBytes(key);
    ence::CencDecoder decoder(layout.ftyp.data(),
                              layout.ftyp.size(),
                              layout.moov.data(),
                              layout.moov.size(),
                              keyBytes.data(),
                              layout.mdatPayloadOffset,
                              layout.mdatPayloadSize);
    if (!decoder.ok()) {
      fclose(input);
      return MFCencSetError(error, [NSString stringWithUTF8String:decoder.error().c_str()]);
    }

    output = fopen([tempPath fileSystemRepresentation], "wb");
    if (!output) {
      fclose(input);
      return MFCencSetError(error, @"Unable to create decrypted CENC output");
    }

    const std::vector<uint8_t> &header = decoder.header();
    if (!header.empty() && fwrite(header.data(), 1, header.size(), output) != header.size()) {
      throw std::runtime_error("Unable to write CENC output header");
    }

    if (fseeko(input, static_cast<off_t>(layout.mdatPayloadOffset), SEEK_SET) != 0) {
      throw std::runtime_error("Unable to seek CENC mdat payload");
    }

    std::vector<uint8_t> buffer(128 * 1024);
    uint64_t relativeOffset = 0;
    uint64_t remaining = layout.mdatPayloadSize;
    while (remaining > 0) {
      size_t requested = static_cast<size_t>(std::min<uint64_t>(buffer.size(), remaining));
      size_t readCount = fread(buffer.data(), 1, requested, input);
      if (readCount == 0) {
        throw std::runtime_error("Encrypted CENC file ended before mdat was complete");
      }
      decoder.decrypt(relativeOffset, buffer.data(), readCount);
      if (fwrite(buffer.data(), 1, readCount, output) != readCount) {
        throw std::runtime_error("Unable to write decrypted CENC data");
      }
      relativeOffset += readCount;
      remaining -= readCount;
    }

    fflush(output);
    fsync(fileno(output));
    fclose(output);
    fclose(input);

    NSFileManager *manager = [NSFileManager defaultManager];
    if ([manager fileExistsAtPath:outputPath]) {
      [manager removeItemAtPath:outputPath error:nil];
    }
    NSError *moveError = nil;
    if (![manager moveItemAtPath:tempPath toPath:outputPath error:&moveError]) {
      if (error) {
        *error = moveError ?: MFCencMakeError(@"Unable to replace decrypted CENC output");
      }
      return NO;
    }
    return YES;
  } catch (const std::exception &ex) {
    if (output) {
      fclose(output);
    }
    fclose(input);
    [[NSFileManager defaultManager] removeItemAtPath:tempPath error:nil];
    return MFCencSetError(error, [NSString stringWithUTF8String:ex.what()]);
  }
}

@interface MFCencHTTPResult : NSObject
@property (nonatomic, assign) NSInteger statusCode;
@property (nonatomic, strong) NSDictionary<NSString *, NSString *> *headers;
@property (nonatomic, strong) NSData *body;
@end

@implementation MFCencHTTPResult
@end

@interface MFCencRangeResult : NSObject
@property (nonatomic, strong) NSData *body;
@property (nonatomic, assign) long long totalSize;
@end

@implementation MFCencRangeResult
@end

@interface MFCencStreamSession : NSObject {
@public
  std::shared_ptr<ence::CencDecoder> decoder;
}
@property (nonatomic, copy) NSString *token;
@property (nonatomic, copy) NSString *src;
@property (nonatomic, strong) NSDictionary<NSString *, NSString *> *headers;
@property (nonatomic, assign) NSTimeInterval createdAt;
@end

@implementation MFCencStreamSession
@end

typedef struct {
  BOOL present;
  BOOL valid;
  uint64_t start;
  uint64_t end;
} MFCencByteRange;

static NSDictionary<NSString *, NSString *> *MFCencNormalizeHeaders(NSDictionary *headers) {
  NSMutableDictionary<NSString *, NSString *> *result = [NSMutableDictionary dictionary];
  if (![headers isKindOfClass:[NSDictionary class]]) {
    return result;
  }
  [headers enumerateKeysAndObjectsUsingBlock:^(id key, id obj, BOOL *stop) {
    if (![key isKindOfClass:[NSString class]] || obj == [NSNull null]) {
      return;
    }
    result[(NSString *)key] = [obj isKindOfClass:[NSString class]] ? obj : [obj description];
  }];
  return result;
}

static NSDictionary<NSString *, NSString *> *MFCencLowercaseResponseHeaders(NSHTTPURLResponse *response) {
  NSMutableDictionary<NSString *, NSString *> *headers = [NSMutableDictionary dictionary];
  [response.allHeaderFields enumerateKeysAndObjectsUsingBlock:^(id key, id obj, BOOL *stop) {
    headers[[[key description] lowercaseString]] = [obj description];
  }];
  return headers;
}

static NSString *MFCencHeaderValue(NSDictionary<NSString *, NSString *> *headers, NSString *name) {
  return headers[[name lowercaseString]];
}

static MFCencHTTPResult *MFCencFetch(NSString *url,
                                     NSDictionary<NSString *, NSString *> *headers,
                                     NSString *range,
                                     NSError **error) {
  NSURL *requestURL = [NSURL URLWithString:url];
  if (!requestURL) {
    if (error) {
      *error = MFCencMakeError(@"Invalid upstream URL");
    }
    return nil;
  }

  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:requestURL
                                                         cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                     timeoutInterval:30.0];
  request.HTTPMethod = @"GET";
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
      *error = MFCencMakeError(@"Upstream request timed out");
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
      *error = MFCencMakeError(@"Invalid upstream response");
    }
    return nil;
  }

  MFCencHTTPResult *result = [MFCencHTTPResult new];
  result.statusCode = httpResponse.statusCode;
  result.headers = MFCencLowercaseResponseHeaders(httpResponse);
  result.body = body ?: [NSData data];
  return result;
}

static long long MFCencParseTotalFromContentRange(NSString *contentRange) {
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

static NSData *MFCencSubdata(NSData *data, NSUInteger location, NSUInteger length) {
  if (location >= data.length) {
    return [NSData data];
  }
  NSUInteger safeLength = MIN(length, data.length - location);
  return [data subdataWithRange:NSMakeRange(location, safeLength)];
}

static MFCencRangeResult *MFCencFetchRange(NSString *src,
                                           NSDictionary<NSString *, NSString *> *headers,
                                           uint64_t start,
                                           uint64_t end,
                                           NSError **error) {
  if (end < start) {
    if (error) {
      *error = MFCencMakeError(@"Invalid upstream byte range");
    }
    return nil;
  }
  NSString *range = [NSString stringWithFormat:@"bytes=%llu-%llu", (unsigned long long)start, (unsigned long long)end];
  MFCencHTTPResult *response = MFCencFetch(src, headers, range, error);
  if (!response || (response.statusCode != 200 && response.statusCode != 206)) {
    if (error && response) {
      *error = MFCencMakeError([NSString stringWithFormat:@"Upstream returned HTTP %ld", (long)response.statusCode]);
    }
    return nil;
  }

  long long total = MFCencParseTotalFromContentRange(MFCencHeaderValue(response.headers, @"content-range"));
  if (total <= 0 && response.statusCode == 200) {
    total = [MFCencHeaderValue(response.headers, @"content-length") longLongValue];
  }

  uint64_t expected = end - start + 1;
  NSData *body = response.body ?: [NSData data];
  if (response.statusCode == 200) {
    if (start > body.length) {
      body = [NSData data];
    } else {
      uint64_t available = static_cast<uint64_t>(body.length) - start;
      body = MFCencSubdata(body, static_cast<NSUInteger>(start), static_cast<NSUInteger>(std::min<uint64_t>(expected, available)));
    }
  } else if (body.length > expected) {
    body = MFCencSubdata(body, 0, static_cast<NSUInteger>(expected));
  }

  MFCencRangeResult *result = [MFCencRangeResult new];
  result.body = body;
  result.totalSize = total;
  return result;
}

static BOOL MFCencParseRemoteBoxHeader(NSData *data, uint64_t remaining, MFCencBoxHeader &box) {
  return MFCencParseBoxHeader(static_cast<const uint8_t *>(data.bytes), data.length, remaining, box);
}

static NSData *MFCencBytesAt(NSString *src,
                             NSDictionary<NSString *, NSString *> *headers,
                             uint64_t offset,
                             NSUInteger length,
                             NSData *initialCache,
                             NSError **error) {
  if (offset + length <= initialCache.length) {
    return [initialCache subdataWithRange:NSMakeRange(static_cast<NSUInteger>(offset), length)];
  }
  MFCencRangeResult *range = MFCencFetchRange(src, headers, offset, offset + length - 1, error);
  if (!range) {
    return nil;
  }
  if (range.body.length < length) {
    if (error) {
      *error = MFCencMakeError([NSString stringWithFormat:@"Truncated upstream MP4 data at offset %llu", (unsigned long long)offset]);
    }
    return nil;
  }
  return range.body.length == length ? range.body : [range.body subdataWithRange:NSMakeRange(0, length)];
}

static BOOL MFCencDiscoverRemoteLayout(NSString *src,
                                       NSDictionary<NSString *, NSString *> *headers,
                                       MFCencLayout &layout,
                                       NSError **error) {
  MFCencRangeResult *first = MFCencFetchRange(src, headers, 0, MFCencProbeSize - 1, error);
  if (!first) {
    return NO;
  }
  uint64_t totalSize = first.totalSize > 0 ? static_cast<uint64_t>(first.totalSize) : first.body.length;
  if (totalSize < 8) {
    return MFCencSetError(error, @"Upstream CENC file is empty or truncated");
  }

  BOOL foundMoov = NO;
  BOOL foundMdat = NO;
  uint64_t offset = 0;
  int guard = 0;
  while (offset + 8 <= totalSize && guard++ < 4096) {
    NSData *headerBytes = MFCencBytesAt(src, headers, offset, 16, first.body, error);
    if (!headerBytes) {
      return NO;
    }
    MFCencBoxHeader box;
    if (!MFCencParseRemoteBoxHeader(headerBytes, totalSize - offset, box)) {
      return MFCencSetError(error, [NSString stringWithFormat:@"Invalid MP4 box at offset %llu", (unsigned long long)offset]);
    }

    if (box.type == "ftyp") {
      if (box.size > MFCencMaxBoxSize) {
        return MFCencSetError(error, @"ftyp box is too large");
      }
      NSData *bytes = MFCencBytesAt(src, headers, offset, static_cast<NSUInteger>(box.size), first.body, error);
      if (!bytes) {
        return NO;
      }
      const uint8_t *raw = static_cast<const uint8_t *>(bytes.bytes);
      layout.ftyp.assign(raw, raw + bytes.length);
    } else if (box.type == "moov") {
      if (box.size > MFCencMaxBoxSize) {
        return MFCencSetError(error, @"moov box is too large");
      }
      NSData *bytes = MFCencBytesAt(src, headers, offset, static_cast<NSUInteger>(box.size), first.body, error);
      if (!bytes) {
        return NO;
      }
      const uint8_t *raw = static_cast<const uint8_t *>(bytes.bytes);
      layout.moov.assign(raw, raw + bytes.length);
      foundMoov = YES;
    } else if (box.type == "mdat") {
      layout.mdatPayloadOffset = offset + box.headerSize;
      layout.mdatPayloadSize = box.size - box.headerSize;
      foundMdat = YES;
    }

    if (foundMoov && foundMdat) {
      return YES;
    }
    offset += box.size;
  }

  if (!foundMoov) {
    return MFCencSetError(error, @"Failed to locate moov box");
  }
  return MFCencSetError(error, @"Failed to locate mdat box");
}

static BOOL MFCencSendAll(int fd, const void *bytes, size_t length) {
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

static NSString *MFCencStatusText(NSInteger status) {
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

static void MFCencSendResponse(int fd,
                               NSInteger status,
                               NSString *contentType,
                               NSDictionary<NSString *, NSString *> *headers,
                               NSData *body,
                               BOOL headOnly) {
  NSMutableString *head = [NSMutableString stringWithFormat:@"HTTP/1.1 %ld %@\r\nConnection: close\r\n",
                           (long)status,
                           MFCencStatusText(status)];
  [head appendFormat:@"Content-Type: %@\r\n", contentType ?: @"application/octet-stream"];
  [headers enumerateKeysAndObjectsUsingBlock:^(NSString *name, NSString *value, BOOL *stop) {
    [head appendFormat:@"%@: %@\r\n", name, value];
  }];
  if (!headers[@"Content-Length"]) {
    [head appendFormat:@"Content-Length: %lu\r\n", (unsigned long)(headOnly ? 0 : body.length)];
  }
  [head appendString:@"\r\n"];
  NSData *headerData = [head dataUsingEncoding:NSISOLatin1StringEncoding];
  MFCencSendAll(fd, headerData.bytes, headerData.length);
  if (!headOnly && body.length > 0) {
    MFCencSendAll(fd, body.bytes, body.length);
  }
}

static NSData *MFCencReadRequestHeader(int fd) {
  NSMutableData *data = [NSMutableData data];
  uint8_t buffer[1024];
  NSData *marker = [@"\r\n\r\n" dataUsingEncoding:NSISOLatin1StringEncoding];
  while (data.length < MFCencMaxHeaderBytes) {
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

static NSDictionary<NSString *, NSString *> *MFCencParseRequestHeaders(NSArray<NSString *> *lines) {
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

static MFCencByteRange MFCencParseRange(NSString *header, uint64_t total) {
  MFCencByteRange range = {NO, NO, 0, 0};
  if (header.length == 0) {
    return range;
  }
  range.present = YES;
  NSString *trimmed = [header stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
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
  if (startText.length == 0 && endText.length == 0) {
    return range;
  }
  if (total == 0) {
    return range;
  }

  if (startText.length == 0) {
    long long suffix = endText.longLongValue;
    if (suffix <= 0) {
      return range;
    }
    uint64_t suffixLength = static_cast<uint64_t>(suffix);
    range.start = suffixLength >= total ? 0 : total - suffixLength;
    range.end = total - 1;
  } else {
    long long start = startText.longLongValue;
    if (start < 0) {
      return range;
    }
    range.start = static_cast<uint64_t>(start);
    if (endText.length == 0) {
      range.end = total - 1;
    } else {
      long long end = endText.longLongValue;
      if (end < 0) {
        return range;
      }
      range.end = std::min<uint64_t>(static_cast<uint64_t>(end), total - 1);
    }
  }
  if (range.start >= total || range.start > range.end) {
    return range;
  }
  range.valid = YES;
  return range;
}

@interface MFCencProxy : NSObject
@property (nonatomic, assign) int serverSocket;
@property (nonatomic, assign) int port;
@property (nonatomic, assign) BOOL started;
@property (nonatomic, strong) NSMutableDictionary<NSString *, MFCencStreamSession *> *sessions;
@property (nonatomic, strong) dispatch_queue_t acceptQueue;
+ (instancetype)shared;
- (nullable NSString *)startWithError:(NSError **)error;
- (nullable NSString *)registerSource:(NSString *)src
                                   cek:(NSString *)cek
                               headers:(NSDictionary *)headers
                                 error:(NSError **)error;
@end

@implementation MFCencProxy

+ (instancetype)shared {
  static MFCencProxy *proxy;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    proxy = [MFCencProxy new];
    proxy.serverSocket = -1;
    proxy.sessions = [NSMutableDictionary dictionary];
    proxy.acceptQueue = dispatch_queue_create("fun.xwj.musicfree.cenc.proxy.accept", DISPATCH_QUEUE_SERIAL);
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
      MFCencSetError(error, @"Unable to create CENC proxy socket");
      return nil;
    }
    int yes = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));

    struct sockaddr_in addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sin_len = sizeof(addr);
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(0);
    if (bind(fd, reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr)) != 0) {
      close(fd);
      MFCencSetError(error, @"Unable to bind CENC proxy socket");
      return nil;
    }
    if (listen(fd, SOMAXCONN) != 0) {
      close(fd);
      MFCencSetError(error, @"Unable to listen on CENC proxy socket");
      return nil;
    }
    socklen_t len = sizeof(addr);
    if (getsockname(fd, reinterpret_cast<struct sockaddr *>(&addr), &len) != 0) {
      close(fd);
      MFCencSetError(error, @"Unable to read CENC proxy port");
      return nil;
    }

    self.serverSocket = fd;
    self.port = ntohs(addr.sin_port);
    self.started = YES;

    __weak MFCencProxy *weakSelf = self;
    dispatch_async(self.acceptQueue, ^{
      [weakSelf acceptLoop];
    });

    return [NSString stringWithFormat:@"http://127.0.0.1:%d", self.port];
  }
}

- (nullable NSString *)registerSource:(NSString *)src
                                   cek:(NSString *)cek
                               headers:(NSDictionary *)headers
                                 error:(NSError **)error {
  if (![src hasPrefix:@"http://"] && ![src hasPrefix:@"https://"]) {
    MFCencSetError(error, @"CENC source must be an HTTP(S) URL");
    return nil;
  }

  NSString *normalizedCek = [cek stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (!MFCencIsHexKey(normalizedCek)) {
    MFCencSetError(error, @"Invalid cek (expected 32 hexadecimal characters)");
    return nil;
  }

  NSString *baseURL = [self startWithError:error];
  if (!baseURL) {
    return nil;
  }

  NSDictionary<NSString *, NSString *> *copiedHeaders = MFCencNormalizeHeaders(headers);
  MFCencLayout layout;
  if (!MFCencDiscoverRemoteLayout(src, copiedHeaders, layout, error)) {
    return nil;
  }

  std::vector<uint8_t> keyBytes = MFCencHexToBytes(normalizedCek);
  std::shared_ptr<ence::CencDecoder> decoder = std::make_shared<ence::CencDecoder>(
      layout.ftyp.data(),
      layout.ftyp.size(),
      layout.moov.data(),
      layout.moov.size(),
      keyBytes.data(),
      layout.mdatPayloadOffset,
      layout.mdatPayloadSize);
  if (!decoder->ok()) {
    MFCencSetError(error, [NSString stringWithUTF8String:decoder->error().c_str()]);
    return nil;
  }

  NSString *token = [[[NSUUID UUID] UUIDString] stringByReplacingOccurrencesOfString:@"-" withString:@""];
  MFCencStreamSession *session = [MFCencStreamSession new];
  session.token = token;
  session.src = src;
  session.headers = copiedHeaders;
  session.createdAt = [NSDate date].timeIntervalSince1970;
  session->decoder = decoder;

  @synchronized (self) {
    self.sessions[token] = session;
    [self trimSessions];
  }

  return [NSString stringWithFormat:@"%@/l/%@.m4a", baseURL, token];
}

- (void)trimSessions {
  while (self.sessions.count > MFCencMaxSessions) {
    NSString *oldestKey = nil;
    NSTimeInterval oldestTime = DBL_MAX;
    for (NSString *key in self.sessions) {
      MFCencStreamSession *session = self.sessions[key];
      if (session.createdAt < oldestTime) {
        oldestTime = session.createdAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) {
      return;
    }
    [self.sessions removeObjectForKey:oldestKey];
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
    __weak MFCencProxy *weakSelf = self;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
      [weakSelf handleClient:client];
      close(client);
    });
  }
}

- (nullable MFCencStreamSession *)sessionForToken:(NSString *)token {
  @synchronized (self) {
    return self.sessions[token];
  }
}

- (void)handleClient:(int)client {
  @autoreleasepool {
    NSData *requestData = MFCencReadRequestHeader(client);
    NSString *requestText = [[NSString alloc] initWithData:requestData encoding:NSISOLatin1StringEncoding];
    NSArray<NSString *> *lines = [requestText componentsSeparatedByString:@"\r\n"];
    if (lines.count == 0) {
      MFCencSendResponse(client, 400, @"text/plain", @{}, [@"bad request" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }
    NSArray<NSString *> *parts = [lines[0] componentsSeparatedByString:@" "];
    if (parts.count < 2) {
      MFCencSendResponse(client, 400, @"text/plain", @{}, [@"bad request" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }
    NSString *method = parts[0];
    NSString *path = [[parts[1] componentsSeparatedByString:@"?"] firstObject];
    if (![method isEqualToString:@"GET"] && ![method isEqualToString:@"HEAD"]) {
      MFCencSendResponse(client, 405, @"text/plain", @{}, [@"method not allowed" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }

    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"^/l/([0-9a-fA-F]{32})(?:\\.m4a)?$"
                                                                           options:0
                                                                             error:nil];
    NSTextCheckingResult *match = [regex firstMatchInString:path options:0 range:NSMakeRange(0, path.length)];
    if (!match) {
      MFCencSendResponse(client, 404, @"text/plain", @{}, [@"unknown stream" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }
    NSString *token = [path substringWithRange:[match rangeAtIndex:1]];
    MFCencStreamSession *session = [self sessionForToken:token];
    if (!session) {
      MFCencSendResponse(client, 404, @"text/plain", @{}, [@"unknown stream" dataUsingEncoding:NSUTF8StringEncoding], NO);
      return;
    }

    NSDictionary<NSString *, NSString *> *requestHeaders = MFCencParseRequestHeaders(lines);
    [self respondToSession:session
                    client:client
                    method:method
               rangeHeader:requestHeaders[@"range"]];
  }
}

- (void)respondToSession:(MFCencStreamSession *)session
                  client:(int)client
                  method:(NSString *)method
             rangeHeader:(NSString *)rangeHeader {
  uint64_t total = session->decoder->outputTotalSize();
  MFCencByteRange parsed = MFCencParseRange(rangeHeader, total);
  if (parsed.present && !parsed.valid) {
    MFCencSendResponse(client,
                       416,
                       @"text/plain",
                       @{@"Content-Range": [NSString stringWithFormat:@"bytes */%llu", (unsigned long long)total]},
                       [@"invalid range" dataUsingEncoding:NSUTF8StringEncoding],
                       NO);
    return;
  }

  uint64_t start = parsed.valid ? parsed.start : 0;
  uint64_t end = parsed.valid ? parsed.end : total - 1;
  uint64_t length = end - start + 1;
  NSInteger status = parsed.valid ? 206 : 200;

  NSMutableDictionary<NSString *, NSString *> *headers = [@{
      @"Accept-Ranges": @"bytes",
      @"Content-Length": [NSString stringWithFormat:@"%llu", (unsigned long long)length],
  } mutableCopy];
  if (parsed.valid) {
    headers[@"Content-Range"] = [NSString stringWithFormat:@"bytes %llu-%llu/%llu",
                                 (unsigned long long)start,
                                 (unsigned long long)end,
                                 (unsigned long long)total];
  }

  if ([method isEqualToString:@"HEAD"]) {
    MFCencSendResponse(client, status, @"audio/mp4", headers, [NSData data], YES);
    return;
  }

  NSError *error = nil;
  NSData *body = [self buildBodyForSession:session start:start end:end error:&error];
  if (!body) {
    NSString *message = error.localizedDescription ?: @"CENC proxy error";
    MFCencSendResponse(client, 500, @"text/plain", @{}, [message dataUsingEncoding:NSUTF8StringEncoding], NO);
    return;
  }
  headers[@"Content-Length"] = [NSString stringWithFormat:@"%lu", (unsigned long)body.length];
  MFCencSendResponse(client, status, @"audio/mp4", headers, body, NO);
}

- (nullable NSData *)buildBodyForSession:(MFCencStreamSession *)session
                                   start:(uint64_t)start
                                     end:(uint64_t)end
                                   error:(NSError **)error {
  NSMutableData *body = [NSMutableData data];
  uint64_t headerSize = session->decoder->headerSize();
  const std::vector<uint8_t> &header = session->decoder->header();

  if (start < headerSize) {
    uint64_t headerEnd = std::min<uint64_t>(end + 1, headerSize);
    uint64_t headerLength = headerEnd - start;
    [body appendBytes:header.data() + static_cast<size_t>(start) length:static_cast<NSUInteger>(headerLength)];
  }

  if (end >= headerSize) {
    uint64_t relativeStart = std::max<uint64_t>(start, headerSize) - headerSize;
    uint64_t relativeEnd = end - headerSize;
    uint64_t sourceStart = session->decoder->mdatFileOffset() + relativeStart;
    uint64_t sourceEnd = session->decoder->mdatFileOffset() + relativeEnd;
    MFCencRangeResult *range = MFCencFetchRange(session.src, session.headers, sourceStart, sourceEnd, error);
    if (!range) {
      return nil;
    }
    NSMutableData *mdat = [range.body mutableCopy];
    session->decoder->decrypt(relativeStart, static_cast<uint8_t *>(mdat.mutableBytes), mdat.length);
    [body appendData:mdat];
  }

  return body;
}

@end

@interface Cenc : NSObject <RCTBridgeModule>
@end

@implementation Cenc

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(registerStream:(NSString *)src
                  cek:(NSString *)cek
                  headers:(NSDictionary *)headers
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSError *error = nil;
    NSString *localURL = [[MFCencProxy shared] registerSource:src cek:cek headers:headers ?: @{} error:&error];
    if (localURL) {
      resolve(localURL);
    } else {
      reject(@"CencRegistrationError", error.localizedDescription ?: @"CENC registration failed", error);
    }
  });
}

RCT_EXPORT_METHOD(decryptFile:(NSString *)inputPath
                  outputPath:(NSString *)outputPath
                  cek:(NSString *)cek
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSError *error = nil;
    BOOL success = MFCencDecryptFile(inputPath, outputPath, cek, &error);
    if (success) {
      resolve(@YES);
    } else {
      reject(@"CencFileDecryptionError", error.localizedDescription ?: @"CENC file decryption failed", error);
    }
  });
}

@end
