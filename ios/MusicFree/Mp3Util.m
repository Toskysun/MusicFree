#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>
#import <math.h>
#import <string.h>
#import "MFMflacSupport.h"

static NSString *const MFMetadataErrorDomain = @"MFMetadataWriter";

static NSError *MFMetadataError(NSString *message) {
  return [NSError errorWithDomain:MFMetadataErrorDomain
                             code:1
                         userInfo:@{NSLocalizedDescriptionKey: message ?: @"Metadata write failed"}];
}

static BOOL MFSetMetadataError(NSError **error, NSString *message) {
  if (error) {
    *error = MFMetadataError(message);
  }
  return NO;
}

static NSString *MFNormalizePath(NSString *path) {
  if ([path hasPrefix:@"file://"]) {
    NSURL *url = [NSURL URLWithString:path];
    return url.path ?: [path substringFromIndex:7];
  }
  return path;
}

static NSString *MFStringValue(NSDictionary *meta, NSString *key) {
  id value = meta[key];
  if (!value || value == [NSNull null]) {
    return nil;
  }
  if ([value isKindOfClass:[NSString class]]) {
    return value;
  }
  return [value description];
}

static BOOL MFHasKey(NSDictionary *meta, NSString *key) {
  id value = meta[key];
  return value && value != [NSNull null];
}

static NSData *MFUTF16TextPayload(NSString *value) {
  NSMutableData *payload = [NSMutableData dataWithCapacity:value.length * 2 + 3];
  uint8_t encoding = 0x01;
  uint8_t bom[] = {0xff, 0xfe};
  [payload appendBytes:&encoding length:1];
  [payload appendBytes:bom length:2];
  NSData *text = [value dataUsingEncoding:NSUTF16LittleEndianStringEncoding] ?: [NSData data];
  [payload appendData:text];
  return payload;
}

static void MFAppendUInt32BE(NSMutableData *data, uint32_t value) {
  uint8_t bytes[] = {
    (uint8_t)((value >> 24) & 0xff),
    (uint8_t)((value >> 16) & 0xff),
    (uint8_t)((value >> 8) & 0xff),
    (uint8_t)(value & 0xff),
  };
  [data appendBytes:bytes length:4];
}

static void MFAppendUInt32LE(NSMutableData *data, uint32_t value) {
  uint8_t bytes[] = {
    (uint8_t)(value & 0xff),
    (uint8_t)((value >> 8) & 0xff),
    (uint8_t)((value >> 16) & 0xff),
    (uint8_t)((value >> 24) & 0xff),
  };
  [data appendBytes:bytes length:4];
}

static void MFAppendUInt64LE(NSMutableData *data, uint64_t value) {
  uint8_t bytes[] = {
    (uint8_t)(value & 0xff),
    (uint8_t)((value >> 8) & 0xff),
    (uint8_t)((value >> 16) & 0xff),
    (uint8_t)((value >> 24) & 0xff),
    (uint8_t)((value >> 32) & 0xff),
    (uint8_t)((value >> 40) & 0xff),
    (uint8_t)((value >> 48) & 0xff),
    (uint8_t)((value >> 56) & 0xff),
  };
  [data appendBytes:bytes length:8];
}

static uint32_t MFReadUInt32BE(const uint8_t *bytes) {
  return ((uint32_t)bytes[0] << 24) |
         ((uint32_t)bytes[1] << 16) |
         ((uint32_t)bytes[2] << 8) |
         (uint32_t)bytes[3];
}

static uint32_t MFReadUInt24BE(const uint8_t *bytes) {
  return ((uint32_t)bytes[0] << 16) |
         ((uint32_t)bytes[1] << 8) |
         (uint32_t)bytes[2];
}

static uint32_t MFReadUInt32LE(const uint8_t *bytes) {
  return ((uint32_t)bytes[0]) |
         ((uint32_t)bytes[1] << 8) |
         ((uint32_t)bytes[2] << 16) |
         ((uint32_t)bytes[3] << 24);
}

static uint64_t MFReadUInt64LE(const uint8_t *bytes) {
  uint64_t value = 0;
  for (int i = 0; i < 8; ++i) {
    value |= ((uint64_t)bytes[i]) << (i * 8);
  }
  return value;
}

static uint32_t MFReadSyncsafeUInt32(const uint8_t *bytes) {
  return ((uint32_t)(bytes[0] & 0x7f) << 21) |
         ((uint32_t)(bytes[1] & 0x7f) << 14) |
         ((uint32_t)(bytes[2] & 0x7f) << 7) |
         (uint32_t)(bytes[3] & 0x7f);
}

static void MFAppendSyncsafeUInt32(NSMutableData *data, uint32_t value) {
  uint8_t bytes[] = {
    (uint8_t)((value >> 21) & 0x7f),
    (uint8_t)((value >> 14) & 0x7f),
    (uint8_t)((value >> 7) & 0x7f),
    (uint8_t)(value & 0x7f),
  };
  [data appendBytes:bytes length:4];
}

static NSData *MFID3Frame(NSString *frameId, NSData *payload) {
  if (frameId.length != 4 || payload.length == 0) {
    return [NSData data];
  }
  NSMutableData *frame = [NSMutableData dataWithCapacity:10 + payload.length];
  [frame appendData:[frameId dataUsingEncoding:NSISOLatin1StringEncoding]];
  MFAppendUInt32BE(frame, (uint32_t)payload.length);
  uint8_t flags[] = {0x00, 0x00};
  [frame appendBytes:flags length:2];
  [frame appendData:payload];
  return frame;
}

static NSData *MFID3TextFrame(NSString *frameId, NSString *value) {
  if (value.length == 0) {
    return [NSData data];
  }
  return MFID3Frame(frameId, MFUTF16TextPayload(value));
}

static NSData *MFID3CommentLikeFrame(NSString *frameId, NSString *value) {
  if (value.length == 0) {
    return [NSData data];
  }
  NSMutableData *payload = [NSMutableData data];
  uint8_t encoding = 0x01;
  uint8_t bom[] = {0xff, 0xfe};
  uint8_t terminator[] = {0x00, 0x00};
  [payload appendBytes:&encoding length:1];
  [payload appendData:[@"und" dataUsingEncoding:NSISOLatin1StringEncoding]];
  [payload appendBytes:bom length:2];
  [payload appendBytes:terminator length:2];
  [payload appendBytes:bom length:2];
  [payload appendData:[value dataUsingEncoding:NSUTF16LittleEndianStringEncoding] ?: [NSData data]];
  return MFID3Frame(frameId, payload);
}

static NSData *MFID3URLFrame(NSString *url) {
  if (url.length == 0) {
    return [NSData data];
  }
  NSMutableData *payload = [NSMutableData data];
  uint8_t encoding = 0x01;
  uint8_t bom[] = {0xff, 0xfe};
  uint8_t terminator[] = {0x00, 0x00};
  [payload appendBytes:&encoding length:1];
  [payload appendBytes:bom length:2];
  [payload appendData:[@"Official" dataUsingEncoding:NSUTF16LittleEndianStringEncoding] ?: [NSData data]];
  [payload appendBytes:terminator length:2];
  NSData *urlData = [url dataUsingEncoding:NSISOLatin1StringEncoding] ?:
      ([url dataUsingEncoding:NSUTF8StringEncoding] ?: [NSData data]);
  [payload appendData:urlData];
  return MFID3Frame(@"WXXX", payload);
}

static NSString *MFDetectImageMime(NSData *data) {
  const uint8_t *bytes = data.bytes;
  if (data.length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) {
    return @"image/jpeg";
  }
  if (data.length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4e && bytes[3] == 0x47) {
    return @"image/png";
  }
  if (data.length >= 4 && bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x38) {
    return @"image/gif";
  }
  if (data.length >= 12 && bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
      bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50) {
    return @"image/webp";
  }
  return @"application/octet-stream";
}

static NSData *MFNormalizeArtworkData(NSData *data, NSString **mimeType) {
  NSString *detected = MFDetectImageMime(data);
  if ([detected isEqualToString:@"image/jpeg"] ||
      [detected isEqualToString:@"image/png"]) {
    if (mimeType) {
      *mimeType = detected;
    }
    return data;
  }
  UIImage *image = [UIImage imageWithData:data];
  NSData *jpeg = image ? UIImageJPEGRepresentation(image, 0.92) : nil;
  if (jpeg.length > 0) {
    if (mimeType) {
      *mimeType = @"image/jpeg";
    }
    return jpeg;
  }
  if (mimeType) {
    *mimeType = detected;
  }
  return data;
}

static NSData *MFReadCoverData(NSString *coverPath, NSString **mimeType, NSError **error) {
  if (coverPath.length == 0) {
    return nil;
  }
  NSData *data = nil;
  if ([coverPath hasPrefix:@"http://"] || [coverPath hasPrefix:@"https://"]) {
    NSURL *url = [NSURL URLWithString:coverPath];
    if (!url) {
      MFSetMetadataError(error, @"Invalid cover URL");
      return nil;
    }
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url
                                                           cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                       timeoutInterval:30.0];
    [request setValue:@"identity" forHTTPHeaderField:@"Accept-Encoding"];
    dispatch_semaphore_t sema = dispatch_semaphore_create(0);
    __block NSData *responseData = nil;
    __block NSError *taskError = nil;
    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request
                                                                 completionHandler:^(NSData *body, NSURLResponse *response, NSError *err) {
      responseData = body;
      taskError = err;
      dispatch_semaphore_signal(sema);
    }];
    [task resume];
    dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(45.0 * NSEC_PER_SEC));
    if (dispatch_semaphore_wait(sema, timeout) != 0) {
      [task cancel];
      MFSetMetadataError(error, @"Cover download timed out");
      return nil;
    }
    if (taskError) {
      if (error) {
        *error = taskError;
      }
      return nil;
    }
    data = responseData;
  } else {
    NSString *path = MFNormalizePath(coverPath);
    data = [NSData dataWithContentsOfFile:path options:0 error:error];
  }
  if (data.length == 0) {
    MFSetMetadataError(error, @"Cover image is empty");
    return nil;
  }
  return MFNormalizeArtworkData(data, mimeType);
}

static NSData *MFID3APICFrame(NSData *coverData, NSString *mimeType) {
  if (coverData.length == 0) {
    return [NSData data];
  }
  NSMutableData *payload = [NSMutableData data];
  uint8_t encoding = 0x00;
  uint8_t pictureType = 0x03;
  uint8_t zero = 0x00;
  [payload appendBytes:&encoding length:1];
  [payload appendData:[(mimeType ?: @"image/jpeg") dataUsingEncoding:NSISOLatin1StringEncoding]];
  [payload appendBytes:&zero length:1];
  [payload appendBytes:&pictureType length:1];
  [payload appendBytes:&zero length:1];
  [payload appendData:coverData];
  return MFID3Frame(@"APIC", payload);
}

static NSArray<NSString *> *MFID3FrameIdsForMetaKey(NSString *key) {
  static NSDictionary<NSString *, NSArray<NSString *> *> *map;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    map = @{
      @"title": @[@"TIT2"],
      @"artist": @[@"TPE1"],
      @"album": @[@"TALB"],
      @"lyric": @[@"USLT"],
      @"comment": @[@"COMM"],
      @"albumArtist": @[@"TPE2"],
      @"composer": @[@"TCOM"],
      @"year": @[@"TYER", @"TDRC"],
      @"genre": @[@"TCON"],
      @"trackNumber": @[@"TRCK"],
      @"totalTracks": @[@"TRCK"],
      @"discNumber": @[@"TPOS"],
      @"totalDiscs": @[@"TPOS"],
      @"isrc": @[@"TSRC"],
      @"language": @[@"TLAN"],
      @"encoder": @[@"TENC"],
      @"bpm": @[@"TBPM"],
      @"mood": @[@"TMOO"],
      @"publisher": @[@"TPUB"],
      @"originalArtist": @[@"TOPE"],
      @"originalAlbum": @[@"TOAL"],
      @"originalYear": @[@"TORY", @"TDOR"],
      @"url": @[@"WXXX"],
      @"compilation": @[@"TCMP"],
    };
  });
  return map[key] ?: @[];
}

static void MFAddObjectsFromArray(NSMutableSet<NSString *> *set, NSArray<NSString *> *items) {
  for (NSString *item in items) {
    [set addObject:item];
  }
}

static NSData *MFBuildID3Frames(NSDictionary *meta, NSData *coverData, NSString *coverMime, BOOL updateCover) {
  NSMutableData *frames = [NSMutableData data];
  void (^appendText)(NSString *, NSString *) = ^(NSString *frameId, NSString *value) {
    NSData *frame = MFID3TextFrame(frameId, value);
    if (frame.length > 0) {
      [frames appendData:frame];
    }
  };

  appendText(@"TIT2", MFStringValue(meta, @"title"));
  appendText(@"TPE1", MFStringValue(meta, @"artist"));
  appendText(@"TALB", MFStringValue(meta, @"album"));
  appendText(@"TPE2", MFStringValue(meta, @"albumArtist"));
  appendText(@"TCOM", MFStringValue(meta, @"composer"));
  appendText(@"TYER", MFStringValue(meta, @"year"));
  appendText(@"TCON", MFStringValue(meta, @"genre"));
  appendText(@"TSRC", MFStringValue(meta, @"isrc"));
  appendText(@"TLAN", MFStringValue(meta, @"language"));
  appendText(@"TENC", MFStringValue(meta, @"encoder"));
  appendText(@"TBPM", MFStringValue(meta, @"bpm"));
  appendText(@"TMOO", MFStringValue(meta, @"mood"));
  appendText(@"TPUB", MFStringValue(meta, @"publisher"));
  appendText(@"TOPE", MFStringValue(meta, @"originalArtist"));
  appendText(@"TOAL", MFStringValue(meta, @"originalAlbum"));
  appendText(@"TORY", MFStringValue(meta, @"originalYear"));

  NSString *track = MFStringValue(meta, @"trackNumber");
  NSString *totalTracks = MFStringValue(meta, @"totalTracks");
  if (track.length > 0 || totalTracks.length > 0) {
    appendText(@"TRCK", totalTracks.length > 0 ? [NSString stringWithFormat:@"%@/%@", track ?: @"", totalTracks] : track);
  }
  NSString *disc = MFStringValue(meta, @"discNumber");
  NSString *totalDiscs = MFStringValue(meta, @"totalDiscs");
  if (disc.length > 0 || totalDiscs.length > 0) {
    appendText(@"TPOS", totalDiscs.length > 0 ? [NSString stringWithFormat:@"%@/%@", disc ?: @"", totalDiscs] : disc);
  }

  if (MFHasKey(meta, @"compilation")) {
    appendText(@"TCMP", [MFStringValue(meta, @"compilation") boolValue] ? @"1" : @"0");
  }

  NSData *commentFrame = MFID3CommentLikeFrame(@"COMM", MFStringValue(meta, @"comment"));
  if (commentFrame.length > 0) {
    [frames appendData:commentFrame];
  }
  NSData *lyricFrame = MFID3CommentLikeFrame(@"USLT", MFStringValue(meta, @"lyric"));
  if (lyricFrame.length > 0) {
    [frames appendData:lyricFrame];
  }
  NSData *urlFrame = MFID3URLFrame(MFStringValue(meta, @"url"));
  if (urlFrame.length > 0) {
    [frames appendData:urlFrame];
  }
  if (updateCover) {
    NSData *coverFrame = MFID3APICFrame(coverData, coverMime);
    if (coverFrame.length > 0) {
      [frames appendData:coverFrame];
    }
  }
  return frames;
}

static NSUInteger MFExistingID3TotalSize(NSData *fileData) {
  if (fileData.length < 10) {
    return 0;
  }
  const uint8_t *bytes = fileData.bytes;
  if (bytes[0] != 'I' || bytes[1] != 'D' || bytes[2] != '3') {
    return 0;
  }
  uint32_t bodySize = MFReadSyncsafeUInt32(bytes + 6);
  NSUInteger total = 10 + bodySize;
  if (total > fileData.length) {
    return 0;
  }
  return total;
}

static NSData *MFPreservedID3Frames(NSData *fileData, NSSet<NSString *> *removeFrameIds) {
  NSUInteger tagTotal = MFExistingID3TotalSize(fileData);
  if (tagTotal <= 10) {
    return [NSData data];
  }
  const uint8_t *bytes = fileData.bytes;
  uint8_t version = bytes[3];
  NSUInteger pos = 10;
  NSMutableData *preserved = [NSMutableData data];
  while (pos + 10 <= tagTotal) {
    const uint8_t *frame = bytes + pos;
    if (frame[0] == 0 || frame[1] == 0 || frame[2] == 0 || frame[3] == 0) {
      break;
    }
    NSString *frameId = [[NSString alloc] initWithBytes:frame length:4 encoding:NSISOLatin1StringEncoding];
    if (frameId.length != 4) {
      break;
    }
    uint32_t frameSize = version == 4 ? MFReadSyncsafeUInt32(frame + 4) : MFReadUInt32BE(frame + 4);
    NSUInteger frameTotal = 10 + frameSize;
    if (frameSize == 0 || pos + frameTotal > tagTotal) {
      break;
    }
    if (![removeFrameIds containsObject:frameId]) {
      if (version == 4) {
        NSData *payload = [NSData dataWithBytes:frame + 10 length:frameSize];
        [preserved appendData:MFID3Frame(frameId, payload)];
      } else {
        [preserved appendBytes:frame length:frameTotal];
      }
    }
    pos += frameTotal;
  }
  return preserved;
}

static BOOL MFReplaceFileWithData(NSString *filePath, NSData *data, NSError **error) {
  NSString *tempPath = [NSString stringWithFormat:@"%@.%@.tmp", filePath, [[NSUUID UUID] UUIDString]];
  if (![data writeToFile:tempPath options:NSDataWritingAtomic error:error]) {
    return NO;
  }
  NSFileManager *manager = [NSFileManager defaultManager];
  if ([manager fileExistsAtPath:filePath]) {
    [manager removeItemAtPath:filePath error:nil];
  }
  if (![manager moveItemAtPath:tempPath toPath:filePath error:error]) {
    [manager removeItemAtPath:tempPath error:nil];
    return NO;
  }
  return YES;
}

static BOOL MFWriteMP3Metadata(NSString *filePath,
                               NSDictionary *meta,
                               NSData *coverData,
                               NSString *coverMime,
                               BOOL updateCover,
                               NSError **error) {
  NSData *input = [NSData dataWithContentsOfFile:filePath options:0 error:error];
  if (!input) {
    return NO;
  }
  NSMutableSet<NSString *> *removeFrameIds = [NSMutableSet set];
  for (NSString *key in meta) {
    MFAddObjectsFromArray(removeFrameIds, MFID3FrameIdsForMetaKey(key));
  }
  if (updateCover) {
    [removeFrameIds addObject:@"APIC"];
  }
  NSMutableData *tagBody = [NSMutableData data];
  [tagBody appendData:MFPreservedID3Frames(input, removeFrameIds)];
  [tagBody appendData:MFBuildID3Frames(meta, coverData, coverMime, updateCover)];
  uint8_t padding[1024] = {0};
  [tagBody appendBytes:padding length:sizeof(padding)];

  NSMutableData *newTag = [NSMutableData dataWithCapacity:10 + tagBody.length];
  uint8_t header[] = {'I', 'D', '3', 0x03, 0x00, 0x00};
  [newTag appendBytes:header length:6];
  MFAppendSyncsafeUInt32(newTag, (uint32_t)tagBody.length);
  [newTag appendData:tagBody];

  NSUInteger existingTagTotal = MFExistingID3TotalSize(input);
  NSData *audioData = [input subdataWithRange:NSMakeRange(existingTagTotal, input.length - existingTagTotal)];
  NSMutableData *output = [NSMutableData dataWithCapacity:newTag.length + audioData.length];
  [output appendData:newTag];
  [output appendData:audioData];
  return MFReplaceFileWithData(filePath, output, error);
}

static NSDictionary<NSString *, NSString *> *MFFlacCommentKeyMap(void) {
  static NSDictionary<NSString *, NSString *> *map;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    map = @{
      @"title": @"TITLE",
      @"artist": @"ARTIST",
      @"album": @"ALBUM",
      @"lyric": @"LYRICS",
      @"comment": @"COMMENT",
      @"albumArtist": @"ALBUMARTIST",
      @"composer": @"COMPOSER",
      @"year": @"DATE",
      @"genre": @"GENRE",
      @"trackNumber": @"TRACKNUMBER",
      @"totalTracks": @"TRACKTOTAL",
      @"discNumber": @"DISCNUMBER",
      @"totalDiscs": @"DISCTOTAL",
      @"isrc": @"ISRC",
      @"language": @"LANGUAGE",
      @"encoder": @"ENCODER",
      @"bpm": @"BPM",
      @"mood": @"MOOD",
      @"rating": @"RATING",
      @"publisher": @"LABEL",
      @"originalArtist": @"ORIGINALARTIST",
      @"originalAlbum": @"ORIGINALALBUM",
      @"originalYear": @"ORIGINALDATE",
      @"url": @"URL",
      @"compilation": @"COMPILATION",
    };
  });
  return map;
}

static NSData *MFFlacMetadataBlock(uint8_t type, NSData *payload, BOOL isLast) {
  NSMutableData *block = [NSMutableData dataWithCapacity:4 + payload.length];
  uint8_t header = (isLast ? 0x80 : 0x00) | (type & 0x7f);
  uint8_t len[] = {
    (uint8_t)((payload.length >> 16) & 0xff),
    (uint8_t)((payload.length >> 8) & 0xff),
    (uint8_t)(payload.length & 0xff),
  };
  [block appendBytes:&header length:1];
  [block appendBytes:len length:3];
  [block appendData:payload];
  return block;
}

static NSData *MFFlacVorbisCommentBlock(NSDictionary<NSString *, NSString *> *comments) {
  NSMutableData *payload = [NSMutableData data];
  NSData *vendor = [@"MusicFree iOS" dataUsingEncoding:NSUTF8StringEncoding];
  MFAppendUInt32LE(payload, (uint32_t)vendor.length);
  [payload appendData:vendor];
  MFAppendUInt32LE(payload, (uint32_t)comments.count);
  NSArray *keys = [[comments allKeys] sortedArrayUsingSelector:@selector(compare:)];
  for (NSString *key in keys) {
    NSString *line = [NSString stringWithFormat:@"%@=%@", key, comments[key]];
    NSData *lineData = [line dataUsingEncoding:NSUTF8StringEncoding] ?: [NSData data];
    MFAppendUInt32LE(payload, (uint32_t)lineData.length);
    [payload appendData:lineData];
  }
  return payload;
}

static NSMutableDictionary<NSString *, NSString *> *MFFlacParseVorbisComments(NSData *payload) {
  NSMutableDictionary<NSString *, NSString *> *comments = [NSMutableDictionary dictionary];
  const uint8_t *bytes = payload.bytes;
  NSUInteger length = payload.length;
  if (length < 8) {
    return comments;
  }
  NSUInteger pos = 0;
  uint32_t vendorLength = MFReadUInt32LE(bytes + pos);
  pos += 4 + vendorLength;
  if (pos + 4 > length) {
    return comments;
  }
  uint32_t count = MFReadUInt32LE(bytes + pos);
  pos += 4;
  for (uint32_t i = 0; i < count && pos + 4 <= length; ++i) {
    uint32_t itemLength = MFReadUInt32LE(bytes + pos);
    pos += 4;
    if (pos + itemLength > length) {
      break;
    }
    NSString *line = [[NSString alloc] initWithBytes:bytes + pos length:itemLength encoding:NSUTF8StringEncoding];
    pos += itemLength;
    NSRange eq = [line rangeOfString:@"="];
    if (eq.location != NSNotFound && eq.location > 0) {
      NSString *key = [[line substringToIndex:eq.location] uppercaseString];
      NSString *value = [line substringFromIndex:eq.location + 1];
      comments[key] = value;
    }
  }
  return comments;
}

static NSData *MFFlacPictureBlock(NSData *coverData, NSString *mimeType) {
  if (coverData.length == 0) {
    return [NSData data];
  }
  UIImage *image = [UIImage imageWithData:coverData];
  uint32_t width = image ? (uint32_t)lrint(image.size.width * image.scale) : 0;
  uint32_t height = image ? (uint32_t)lrint(image.size.height * image.scale) : 0;
  uint32_t depth = [mimeType isEqualToString:@"image/png"] ? 32 : 24;
  NSData *mime = [(mimeType ?: @"image/jpeg") dataUsingEncoding:NSASCIIStringEncoding] ?: [NSData data];
  NSMutableData *payload = [NSMutableData data];
  MFAppendUInt32BE(payload, 3);
  MFAppendUInt32BE(payload, (uint32_t)mime.length);
  [payload appendData:mime];
  MFAppendUInt32BE(payload, 0);
  MFAppendUInt32BE(payload, width);
  MFAppendUInt32BE(payload, height);
  MFAppendUInt32BE(payload, depth);
  MFAppendUInt32BE(payload, 0);
  MFAppendUInt32BE(payload, (uint32_t)coverData.length);
  [payload appendData:coverData];
  return payload;
}

static BOOL MFWriteFlacMetadata(NSString *filePath,
                                NSDictionary *meta,
                                NSData *coverData,
                                NSString *coverMime,
                                BOOL updateCover,
                                NSError **error) {
  NSData *input = [NSData dataWithContentsOfFile:filePath options:0 error:error];
  if (!input) {
    return NO;
  }
  if (input.length < 4 || memcmp(input.bytes, "fLaC", 4) != 0) {
    return MFSetMetadataError(error, @"Invalid FLAC file");
  }

  const uint8_t *bytes = input.bytes;
  NSUInteger pos = 4;
  NSMutableArray<NSDictionary *> *blocks = [NSMutableArray array];
  NSMutableDictionary<NSString *, NSString *> *comments = [NSMutableDictionary dictionary];
  BOOL foundLast = NO;
  while (pos + 4 <= input.length) {
    uint8_t header = bytes[pos];
    BOOL isLast = (header & 0x80) != 0;
    uint8_t type = header & 0x7f;
    uint32_t length = MFReadUInt24BE(bytes + pos + 1);
    pos += 4;
    if (pos + length > input.length) {
      return MFSetMetadataError(error, @"Invalid FLAC metadata block");
    }
    NSData *payload = [input subdataWithRange:NSMakeRange(pos, length)];
    pos += length;
    if (type == 4) {
      [comments addEntriesFromDictionary:MFFlacParseVorbisComments(payload)];
    } else if (type == 6 && updateCover) {
    } else {
      [blocks addObject:@{@"type": @(type), @"payload": payload}];
    }
    if (isLast) {
      foundLast = YES;
      break;
    }
  }
  if (!foundLast) {
    return MFSetMetadataError(error, @"FLAC metadata is incomplete");
  }

  NSDictionary<NSString *, NSString *> *keyMap = MFFlacCommentKeyMap();
  for (NSString *metaKey in meta) {
    NSString *commentKey = keyMap[metaKey];
    if (commentKey.length > 0) {
      NSString *value = MFStringValue(meta, metaKey);
      if (value.length > 0) {
        comments[commentKey] = value;
      } else {
        [comments removeObjectForKey:commentKey];
      }
    }
  }
  NSData *commentPayload = MFFlacVorbisCommentBlock(comments);
  [blocks addObject:@{@"type": @(4), @"payload": commentPayload}];
  if (updateCover && coverData.length > 0) {
    NSData *picturePayload = MFFlacPictureBlock(coverData, coverMime);
    [blocks addObject:@{@"type": @(6), @"payload": picturePayload}];
  }

  NSMutableData *output = [NSMutableData data];
  [output appendBytes:"fLaC" length:4];
  for (NSUInteger i = 0; i < blocks.count; ++i) {
    uint8_t type = [blocks[i][@"type"] unsignedCharValue];
    NSData *payload = blocks[i][@"payload"];
    [output appendData:MFFlacMetadataBlock(type, payload, i == blocks.count - 1)];
  }
  [output appendData:[input subdataWithRange:NSMakeRange(pos, input.length - pos)]];
  return MFReplaceFileWithData(filePath, output, error);
}

@interface MFOggPage : NSObject
@property (nonatomic, assign) uint8_t version;
@property (nonatomic, assign) uint8_t headerType;
@property (nonatomic, assign) uint64_t granulePosition;
@property (nonatomic, assign) uint32_t serialNumber;
@property (nonatomic, assign) uint32_t pageSequenceNumber;
@property (nonatomic, strong) NSData *segmentTable;
@property (nonatomic, strong) NSData *body;
@end

@implementation MFOggPage
@end

@interface MFOggSegment : NSObject
@property (nonatomic, strong) NSData *data;
@property (nonatomic, assign) NSUInteger offset;
@property (nonatomic, assign) uint8_t length;
@end

@implementation MFOggSegment
@end

static const uint32_t *MFOggCrcTable(void) {
  static uint32_t table[256];
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    for (uint32_t i = 0; i < 256; ++i) {
      uint32_t r = i << 24;
      for (int j = 0; j < 8; ++j) {
        r = (r & 0x80000000U) ? ((r << 1) ^ 0x04c11db7U) : (r << 1);
      }
      table[i] = r;
    }
  });
  return table;
}

static uint32_t MFOggCRC(NSData *data) {
  const uint8_t *bytes = data.bytes;
  const uint32_t *table = MFOggCrcTable();
  uint32_t crc = 0;
  for (NSUInteger i = 0; i < data.length; ++i) {
    crc = (crc << 8) ^ table[((crc >> 24) & 0xff) ^ bytes[i]];
  }
  return crc;
}

static void MFReplaceUInt32LE(NSMutableData *data, NSUInteger offset, uint32_t value) {
  uint8_t bytes[] = {
    (uint8_t)(value & 0xff),
    (uint8_t)((value >> 8) & 0xff),
    (uint8_t)((value >> 16) & 0xff),
    (uint8_t)((value >> 24) & 0xff),
  };
  [data replaceBytesInRange:NSMakeRange(offset, 4) withBytes:bytes length:4];
}

static NSData *MFOggPageData(MFOggPage *page) {
  NSMutableData *data = [NSMutableData dataWithCapacity:27 + page.segmentTable.length + page.body.length];
  uint8_t capture[] = {'O', 'g', 'g', 'S'};
  uint8_t segmentCount = (uint8_t)page.segmentTable.length;
  [data appendBytes:capture length:4];
  uint8_t version = page.version;
  uint8_t headerType = page.headerType;
  [data appendBytes:&version length:1];
  [data appendBytes:&headerType length:1];
  MFAppendUInt64LE(data, page.granulePosition);
  MFAppendUInt32LE(data, page.serialNumber);
  MFAppendUInt32LE(data, page.pageSequenceNumber);
  MFAppendUInt32LE(data, 0);
  [data appendBytes:&segmentCount length:1];
  [data appendData:page.segmentTable ?: [NSData data]];
  [data appendData:page.body ?: [NSData data]];
  MFReplaceUInt32LE(data, 22, MFOggCRC(data));
  return data;
}

static NSArray<MFOggPage *> *MFOggParsePages(NSData *input, NSError **error) {
  NSMutableArray<MFOggPage *> *pages = [NSMutableArray array];
  const uint8_t *bytes = input.bytes;
  NSUInteger offset = 0;
  while (offset + 27 <= input.length) {
    if (bytes[offset] != 'O' || bytes[offset + 1] != 'g' || bytes[offset + 2] != 'g' || bytes[offset + 3] != 'S') {
      MFSetMetadataError(error, [NSString stringWithFormat:@"Invalid OGG capture pattern at offset %lu", (unsigned long)offset]);
      return nil;
    }
    uint8_t segmentCount = bytes[offset + 26];
    NSUInteger headerSize = 27 + segmentCount;
    if (offset + headerSize > input.length) {
      MFSetMetadataError(error, @"Truncated OGG segment table");
      return nil;
    }
    NSUInteger bodySize = 0;
    for (NSUInteger i = 0; i < segmentCount; ++i) {
      bodySize += bytes[offset + 27 + i];
    }
    if (offset + headerSize + bodySize > input.length) {
      MFSetMetadataError(error, @"Truncated OGG page body");
      return nil;
    }

    MFOggPage *page = [MFOggPage new];
    page.version = bytes[offset + 4];
    page.headerType = bytes[offset + 5];
    page.granulePosition = MFReadUInt64LE(bytes + offset + 6);
    page.serialNumber = MFReadUInt32LE(bytes + offset + 14);
    page.pageSequenceNumber = MFReadUInt32LE(bytes + offset + 18);
    page.segmentTable = [input subdataWithRange:NSMakeRange(offset + 27, segmentCount)];
    page.body = [input subdataWithRange:NSMakeRange(offset + headerSize, bodySize)];
    [pages addObject:page];
    offset += headerSize + bodySize;
  }
  if (pages.count == 0 || offset != input.length) {
    MFSetMetadataError(error, @"Invalid or truncated OGG file");
    return nil;
  }
  return pages;
}

static BOOL MFOggIsVorbisPacket(NSData *packet, uint8_t type) {
  if (packet.length < 7) {
    return NO;
  }
  const uint8_t *bytes = packet.bytes;
  return bytes[0] == type && memcmp(bytes + 1, "vorbis", 6) == 0;
}

static BOOL MFOggHeaderPackets(NSArray<MFOggPage *> *pages,
                               NSMutableArray<NSData *> **packetsOut,
                               NSInteger *setupEndPageOut,
                               BOOL *setupEndsAtPageEndOut,
                               NSError **error) {
  NSMutableArray<NSData *> *packets = [NSMutableArray array];
  NSMutableData *currentPacket = [NSMutableData data];
  for (NSUInteger pageIdx = 0; pageIdx < pages.count; ++pageIdx) {
    MFOggPage *page = pages[pageIdx];
    const uint8_t *segments = page.segmentTable.bytes;
    const uint8_t *body = page.body.bytes;
    NSUInteger bodyOffset = 0;
    for (NSUInteger segIdx = 0; segIdx < page.segmentTable.length; ++segIdx) {
      NSUInteger segmentLength = segments[segIdx];
      if (bodyOffset + segmentLength > page.body.length) {
        return MFSetMetadataError(error, @"Invalid OGG lacing table");
      }
      [currentPacket appendBytes:body + bodyOffset length:segmentLength];
      bodyOffset += segmentLength;
      if (segmentLength < 255) {
        [packets addObject:[currentPacket copy]];
        [currentPacket setLength:0];
        if (packets.count == 3) {
          if (packetsOut) {
            *packetsOut = packets;
          }
          if (setupEndPageOut) {
            *setupEndPageOut = (NSInteger)pageIdx;
          }
          if (setupEndsAtPageEndOut) {
            *setupEndsAtPageEndOut = segIdx == page.segmentTable.length - 1;
          }
          return YES;
        }
      }
    }
  }
  return MFSetMetadataError(error, @"Could not find the first three OGG Vorbis packets");
}

static NSData *MFOggVorbisCommentPacket(NSData *originalPacket,
                                        NSDictionary *meta,
                                        NSData *coverData,
                                        NSString *coverMime,
                                        BOOL updateCover) {
  NSData *commentPayload = [originalPacket subdataWithRange:NSMakeRange(7, originalPacket.length - 7)];
  NSMutableDictionary<NSString *, NSString *> *comments = MFFlacParseVorbisComments(commentPayload);
  NSDictionary<NSString *, NSString *> *keyMap = MFFlacCommentKeyMap();
  for (NSString *metaKey in meta) {
    NSString *commentKey = keyMap[metaKey];
    if (commentKey.length > 0) {
      NSString *value = MFStringValue(meta, metaKey);
      if (value.length > 0) {
        comments[commentKey] = value;
      } else {
        [comments removeObjectForKey:commentKey];
      }
    }
  }

  if (updateCover) {
    [comments removeObjectForKey:@"METADATA_BLOCK_PICTURE"];
    [comments removeObjectForKey:@"COVERART"];
    [comments removeObjectForKey:@"COVERARTMIME"];
    if (coverData.length > 0) {
      NSData *picturePayload = MFFlacPictureBlock(coverData, coverMime);
      comments[@"METADATA_BLOCK_PICTURE"] = [picturePayload base64EncodedStringWithOptions:0];
    }
  }

  NSMutableData *packet = [NSMutableData data];
  uint8_t type = 0x03;
  uint8_t framing = 0x01;
  [packet appendBytes:&type length:1];
  [packet appendData:[@"vorbis" dataUsingEncoding:NSASCIIStringEncoding]];
  [packet appendData:MFFlacVorbisCommentBlock(comments)];
  [packet appendBytes:&framing length:1];
  return packet;
}

static NSArray<MFOggPage *> *MFOggPaginatePackets(NSArray<NSData *> *packets,
                                                  uint32_t serialNumber,
                                                  uint32_t startSequence,
                                                  uint8_t firstHeaderType) {
  NSMutableArray<MFOggSegment *> *allSegments = [NSMutableArray array];
  for (NSData *packet in packets) {
    if (packet.length == 0) {
      MFOggSegment *segment = [MFOggSegment new];
      segment.data = [NSData data];
      segment.offset = 0;
      segment.length = 0;
      [allSegments addObject:segment];
      continue;
    }

    NSUInteger offset = 0;
    while (offset < packet.length) {
      NSUInteger chunk = MIN((NSUInteger)255, packet.length - offset);
      MFOggSegment *segment = [MFOggSegment new];
      segment.data = packet;
      segment.offset = offset;
      segment.length = (uint8_t)chunk;
      [allSegments addObject:segment];
      offset += chunk;
      if (offset == packet.length && chunk == 255) {
        MFOggSegment *terminator = [MFOggSegment new];
        terminator.data = [NSData data];
        terminator.offset = 0;
        terminator.length = 0;
        [allSegments addObject:terminator];
      }
    }
  }

  NSMutableArray<MFOggPage *> *pages = [NSMutableArray array];
  NSUInteger segmentIndex = 0;
  uint32_t sequence = startSequence;
  BOOL continuingPacket = NO;
  BOOL firstPage = YES;
  while (segmentIndex < allSegments.count) {
    NSUInteger count = MIN((NSUInteger)255, allSegments.count - segmentIndex);
    NSMutableData *segmentTable = [NSMutableData dataWithCapacity:count];
    NSMutableData *body = [NSMutableData data];
    for (NSUInteger i = 0; i < count; ++i) {
      MFOggSegment *segment = allSegments[segmentIndex + i];
      uint8_t length = segment.length;
      [segmentTable appendBytes:&length length:1];
      if (length > 0) {
        [body appendData:[segment.data subdataWithRange:NSMakeRange(segment.offset, length)]];
      }
    }

    MFOggPage *page = [MFOggPage new];
    page.version = 0;
    page.headerType = continuingPacket ? 0x01 : (firstPage ? firstHeaderType : 0x00);
    page.granulePosition = 0;
    page.serialNumber = serialNumber;
    page.pageSequenceNumber = sequence++;
    page.segmentTable = segmentTable;
    page.body = body;
    [pages addObject:page];

    MFOggSegment *last = allSegments[segmentIndex + count - 1];
    continuingPacket = last.length == 255;
    firstPage = NO;
    segmentIndex += count;
  }
  return pages;
}

static BOOL MFWriteOggMetadata(NSString *filePath,
                               NSDictionary *meta,
                               NSData *coverData,
                               NSString *coverMime,
                               BOOL updateCover,
                               NSError **error) {
  NSData *input = [NSData dataWithContentsOfFile:filePath options:0 error:error];
  if (!input) {
    return NO;
  }
  NSArray<MFOggPage *> *pages = MFOggParsePages(input, error);
  if (!pages) {
    return NO;
  }

  NSMutableArray<NSData *> *packets = nil;
  NSInteger setupEndPage = NSNotFound;
  BOOL setupEndsAtPageEnd = NO;
  if (!MFOggHeaderPackets(pages, &packets, &setupEndPage, &setupEndsAtPageEnd, error)) {
    return NO;
  }
  if (!MFOggIsVorbisPacket(packets[0], 0x01) ||
      !MFOggIsVorbisPacket(packets[1], 0x03) ||
      !MFOggIsVorbisPacket(packets[2], 0x05)) {
    return MFSetMetadataError(error, @"Only OGG Vorbis metadata writing is supported");
  }
  if (!setupEndsAtPageEnd) {
    return MFSetMetadataError(error, @"Unsupported OGG layout: audio data starts on the setup header page");
  }

  MFOggPage *originalBosPage = pages[0];
  const uint8_t *bosSegments = originalBosPage.segmentTable.bytes;
  if (originalBosPage.segmentTable.length != 1 ||
      bosSegments[0] == 255 ||
      ![originalBosPage.body isEqualToData:packets[0]]) {
    return MFSetMetadataError(error, @"Unsupported OGG layout: first page must contain only the Vorbis identification packet");
  }

  NSData *newCommentPacket = MFOggVorbisCommentPacket(packets[1], meta ?: @{}, coverData, coverMime, updateCover);
  NSArray<MFOggPage *> *newHeaderPages = MFOggPaginatePackets(
      @[newCommentPacket, packets[2]],
      ((MFOggPage *)pages[0]).serialNumber,
      1,
      0x00);

  NSMutableData *output = [NSMutableData dataWithCapacity:input.length + (coverData ? coverData.length : 0) + 4096];
  MFOggPage *bosPage = [MFOggPage new];
  bosPage.version = originalBosPage.version;
  bosPage.headerType = originalBosPage.headerType;
  bosPage.granulePosition = originalBosPage.granulePosition;
  bosPage.serialNumber = originalBosPage.serialNumber;
  bosPage.pageSequenceNumber = 0;
  bosPage.segmentTable = originalBosPage.segmentTable;
  bosPage.body = originalBosPage.body;
  [output appendData:MFOggPageData(bosPage)];

  uint32_t nextSequence = 1;
  for (MFOggPage *page in newHeaderPages) {
    page.pageSequenceNumber = nextSequence++;
    [output appendData:MFOggPageData(page)];
  }

  NSUInteger firstAudioPage = (NSUInteger)setupEndPage + 1;
  for (NSUInteger i = firstAudioPage; i < pages.count; ++i) {
    MFOggPage *orig = pages[i];
    MFOggPage *page = [MFOggPage new];
    page.version = orig.version;
    page.headerType = orig.headerType;
    page.granulePosition = orig.granulePosition;
    page.serialNumber = orig.serialNumber;
    page.pageSequenceNumber = nextSequence++;
    page.segmentTable = orig.segmentTable;
    page.body = orig.body;
    [output appendData:MFOggPageData(page)];
  }
  return MFReplaceFileWithData(filePath, output, error);
}

static AVMutableMetadataItem *MFMP4TextItem(NSString *key, NSString *value) {
  AVMutableMetadataItem *item = [AVMutableMetadataItem metadataItem];
  item.keySpace = AVMetadataKeySpaceiTunes;
  item.key = key;
  item.value = value;
  item.dataType = @"com.apple.metadata.datatype.UTF-8";
  return item;
}

static AVMutableMetadataItem *MFMP4CoverItem(NSData *coverData, NSString *mimeType) {
  AVMutableMetadataItem *item = [AVMutableMetadataItem metadataItem];
  item.keySpace = AVMetadataKeySpaceiTunes;
  item.key = @"covr";
  item.value = coverData;
  item.dataType = [mimeType isEqualToString:@"image/png"]
      ? @"com.apple.metadata.datatype.PNG"
      : @"com.apple.metadata.datatype.JPEG";
  return item;
}

static NSDictionary<NSString *, NSString *> *MFMP4KeyMap(void) {
  static NSDictionary<NSString *, NSString *> *map;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    map = @{
      @"title": @"©nam",
      @"artist": @"©ART",
      @"album": @"©alb",
      @"lyric": @"©lyr",
      @"comment": @"©cmt",
      @"albumArtist": @"aART",
      @"composer": @"©wrt",
      @"year": @"©day",
      @"genre": @"©gen",
      @"encoder": @"©too",
    };
  });
  return map;
}

static BOOL MFWriteMP4Metadata(NSString *filePath,
                               NSDictionary *meta,
                               NSData *coverData,
                               NSString *coverMime,
                               BOOL updateCover,
                               NSError **error) {
  NSURL *inputURL = [NSURL fileURLWithPath:filePath];
  AVURLAsset *asset = [AVURLAsset URLAssetWithURL:inputURL options:nil];
  AVAssetExportSession *exporter = [AVAssetExportSession exportSessionWithAsset:asset presetName:AVAssetExportPresetPassthrough];
  if (!exporter) {
    return MFSetMetadataError(error, @"Unable to create MP4 metadata exporter");
  }

  NSDictionary<NSString *, NSString *> *keyMap = MFMP4KeyMap();
  NSMutableSet<NSString *> *replaceKeys = [NSMutableSet set];
  for (NSString *metaKey in meta) {
    NSString *mp4Key = keyMap[metaKey];
    if (mp4Key.length > 0) {
      [replaceKeys addObject:mp4Key];
    }
  }
  if (updateCover) {
    [replaceKeys addObject:@"covr"];
  }

  NSMutableArray<AVMetadataItem *> *metadata = [NSMutableArray array];
  for (AVMetadataItem *item in asset.metadata) {
    NSString *key = [item.key isKindOfClass:[NSString class]] ? (NSString *)item.key : nil;
    if ([item.keySpace isEqualToString:AVMetadataKeySpaceiTunes] && key && [replaceKeys containsObject:key]) {
      continue;
    }
    [metadata addObject:item];
  }

  for (NSString *metaKey in keyMap) {
    if (!MFHasKey(meta, metaKey)) {
      continue;
    }
    NSString *value = MFStringValue(meta, metaKey);
    if (value.length > 0) {
      [metadata addObject:MFMP4TextItem(keyMap[metaKey], value)];
    }
  }
  if (updateCover && coverData.length > 0) {
    [metadata addObject:MFMP4CoverItem(coverData, coverMime)];
  }

  NSString *ext = [[filePath pathExtension] lowercaseString];
  NSString *tempPath = [NSString stringWithFormat:@"%@.%@.%@", [filePath stringByDeletingPathExtension], [[NSUUID UUID] UUIDString], ext.length ? ext : @"m4a"];
  NSURL *outputURL = [NSURL fileURLWithPath:tempPath];
  exporter.outputURL = outputURL;
  exporter.outputFileType = [ext isEqualToString:@"mp4"] ? AVFileTypeMPEG4 : AVFileTypeAppleM4A;
  exporter.metadata = metadata;
  exporter.shouldOptimizeForNetworkUse = NO;

  dispatch_semaphore_t sema = dispatch_semaphore_create(0);
  [exporter exportAsynchronouslyWithCompletionHandler:^{
    dispatch_semaphore_signal(sema);
  }];
  dispatch_semaphore_wait(sema, DISPATCH_TIME_FOREVER);

  if (exporter.status != AVAssetExportSessionStatusCompleted) {
    if (error) {
      *error = exporter.error ?: MFMetadataError(@"MP4 metadata export failed");
    }
    [[NSFileManager defaultManager] removeItemAtPath:tempPath error:nil];
    return NO;
  }

  NSFileManager *manager = [NSFileManager defaultManager];
  if ([manager fileExistsAtPath:filePath]) {
    [manager removeItemAtPath:filePath error:nil];
  }
  if (![manager moveItemAtPath:tempPath toPath:filePath error:error]) {
    [manager removeItemAtPath:tempPath error:nil];
    return NO;
  }
  return YES;
}

static BOOL MFWriteMetadata(NSString *filePath,
                            NSDictionary *meta,
                            NSData *coverData,
                            NSString *coverMime,
                            BOOL updateCover,
                            NSError **error) {
  NSString *path = MFNormalizePath(filePath);
  if (![[NSFileManager defaultManager] fileExistsAtPath:path]) {
    return MFSetMetadataError(error, @"Music file not found");
  }
  NSString *ext = [[path pathExtension] lowercaseString];
  if ([ext isEqualToString:@"mp3"]) {
    return MFWriteMP3Metadata(path, meta ?: @{}, coverData, coverMime, updateCover, error);
  }
  if ([ext isEqualToString:@"m4a"] || [ext isEqualToString:@"mp4"]) {
    return MFWriteMP4Metadata(path, meta ?: @{}, coverData, coverMime, updateCover, error);
  }
  if ([ext isEqualToString:@"flac"]) {
    return MFWriteFlacMetadata(path, meta ?: @{}, coverData, coverMime, updateCover, error);
  }
  if ([ext isEqualToString:@"ogg"]) {
    return MFWriteOggMetadata(path, meta ?: @{}, coverData, coverMime, updateCover, error);
  }
  return MFSetMetadataError(error, [NSString stringWithFormat:@"Writing metadata for .%@ is not supported on iOS yet", ext ?: @""]);
}

@interface Mp3Util : RCTEventEmitter <RCTBridgeModule>
@end

@implementation Mp3Util

RCT_EXPORT_MODULE();

- (NSArray<NSString *> *)supportedEvents {
  return @[@"downloadProgress", @"downloadComplete", @"downloadError"];
}

RCT_EXPORT_METHOD(getBasicMeta:(NSString *)filePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSURL *url = [NSURL fileURLWithPath:filePath];
  AVAsset *asset = [AVAsset assetWithURL:url];

  NSMutableDictionary *meta = [NSMutableDictionary dictionary];

  for (AVMetadataItem *item in [asset commonMetadata]) {
    if ([item.commonKey isEqualToString:AVMetadataCommonKeyTitle]) {
      meta[@"title"] = item.stringValue ?: @"";
    } else if ([item.commonKey isEqualToString:AVMetadataCommonKeyArtist]) {
      meta[@"artist"] = item.stringValue ?: @"";
    } else if ([item.commonKey isEqualToString:AVMetadataCommonKeyAlbumName]) {
      meta[@"album"] = item.stringValue ?: @"";
    } else if ([item.commonKey isEqualToString:AVMetadataCommonKeyAuthor]) {
      meta[@"author"] = item.stringValue ?: @"";
    }
  }

  CMTime duration = asset.duration;
  if (CMTIME_IS_VALID(duration)) {
    meta[@"duration"] = @((int)(CMTimeGetSeconds(duration) * 1000));
  }

  resolve(meta);
}

RCT_EXPORT_METHOD(getMediaMeta:(NSArray *)filePaths
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSMutableArray *results = [NSMutableArray array];

  for (NSString *path in filePaths) {
    NSURL *url = [NSURL fileURLWithPath:path];
    AVAsset *asset = [AVAsset assetWithURL:url];
    NSMutableDictionary *meta = [NSMutableDictionary dictionary];

    for (AVMetadataItem *item in [asset commonMetadata]) {
      if ([item.commonKey isEqualToString:AVMetadataCommonKeyTitle]) {
        meta[@"title"] = item.stringValue ?: @"";
      } else if ([item.commonKey isEqualToString:AVMetadataCommonKeyArtist]) {
        meta[@"artist"] = item.stringValue ?: @"";
      } else if ([item.commonKey isEqualToString:AVMetadataCommonKeyAlbumName]) {
        meta[@"album"] = item.stringValue ?: @"";
      }
    }

    CMTime duration = asset.duration;
    if (CMTIME_IS_VALID(duration)) {
      meta[@"duration"] = @((int)(CMTimeGetSeconds(duration) * 1000));
    }

    [results addObject:meta];
  }

  resolve(results);
}

RCT_EXPORT_METHOD(getMediaCoverImg:(NSString *)filePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSURL *url = [NSURL fileURLWithPath:filePath];
  AVAsset *asset = [AVAsset assetWithURL:url];

  for (AVMetadataItem *item in [asset commonMetadata]) {
    if ([item.commonKey isEqualToString:AVMetadataCommonKeyArtwork]) {
      NSData *imageData = nil;
      if ([item.value isKindOfClass:[NSData class]]) {
        imageData = (NSData *)item.value;
      } else if ([item.value isKindOfClass:[NSDictionary class]]) {
        imageData = ((NSDictionary *)item.value)[@"data"];
      }

      if (imageData) {
        NSString *base64 = [imageData base64EncodedStringWithOptions:0];
        resolve([NSString stringWithFormat:@"data:image/jpeg;base64,%@", base64]);
        return;
      }
    }
  }

  resolve(@"");
}

RCT_EXPORT_METHOD(getLyric:(NSString *)filePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSURL *url = [NSURL fileURLWithPath:filePath];
  AVAsset *asset = [AVAsset assetWithURL:url];

  for (AVMetadataItem *item in [asset metadata]) {
    NSString *key = item.identifier;
    if ([key containsString:@"lyrics"] || [key containsString:@"USLT"]) {
      resolve(item.stringValue ?: @"");
      return;
    }
  }

  resolve(@"");
}

RCT_EXPORT_METHOD(setMediaTag:(NSString *)filePath
                  meta:(NSDictionary *)meta
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSError *error = nil;
    BOOL success = MFWriteMetadata(filePath, meta ?: @{}, nil, nil, NO, &error);
    if (success) {
      resolve(@YES);
    } else {
      reject(@"MetadataWriteError", error.localizedDescription ?: @"Writing metadata failed", error);
    }
  });
}

RCT_EXPORT_METHOD(getMediaTag:(NSString *)filePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // 复用getBasicMeta
  NSURL *url = [NSURL fileURLWithPath:filePath];
  AVAsset *asset = [AVAsset assetWithURL:url];

  NSMutableDictionary *meta = [NSMutableDictionary dictionary];

  for (AVMetadataItem *item in [asset commonMetadata]) {
    if ([item.commonKey isEqualToString:AVMetadataCommonKeyTitle]) {
      meta[@"title"] = item.stringValue ?: @"";
    } else if ([item.commonKey isEqualToString:AVMetadataCommonKeyArtist]) {
      meta[@"artist"] = item.stringValue ?: @"";
    } else if ([item.commonKey isEqualToString:AVMetadataCommonKeyAlbumName]) {
      meta[@"album"] = item.stringValue ?: @"";
    }
  }

  resolve(meta);
}

RCT_EXPORT_METHOD(setMediaCover:(NSString *)filePath
                  coverPath:(NSString *)coverPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSError *error = nil;
    NSString *mimeType = nil;
    NSData *coverData = MFReadCoverData(coverPath, &mimeType, &error);
    BOOL success = coverData.length > 0 && MFWriteMetadata(filePath, @{}, coverData, mimeType, YES, &error);
    if (success) {
      resolve(@YES);
    } else {
      reject(@"CoverWriteError", error.localizedDescription ?: @"Writing cover failed", error);
    }
  });
}

RCT_EXPORT_METHOD(setMediaTagWithCover:(NSString *)filePath
                  meta:(NSDictionary *)meta
                  coverPath:(NSString *)coverPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSError *error = nil;
    NSString *mimeType = nil;
    NSData *coverData = nil;
    BOOL shouldUpdateCover = coverPath.length > 0;
    if (shouldUpdateCover) {
      coverData = MFReadCoverData(coverPath, &mimeType, &error);
      if (coverData.length == 0) {
        reject(@"CoverReadError", error.localizedDescription ?: @"Reading cover failed", error);
        return;
      }
    }
    BOOL success = MFWriteMetadata(filePath, meta ?: @{}, coverData, mimeType, shouldUpdateCover, &error);
    if (success) {
      resolve(@YES);
    } else {
      reject(@"MetadataWriteError", error.localizedDescription ?: @"Writing metadata failed", error);
    }
  });
}

RCT_EXPORT_METHOD(downloadWithSystemManager:(NSString *)url
                  destinationPath:(NSString *)destinationPath
                  title:(NSString *)title
                  description:(NSString *)description
                  headers:(NSDictionary *)headers
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // 使用NSURLSession下载
  NSURLSessionConfiguration *config = [NSURLSessionConfiguration backgroundSessionConfigurationWithIdentifier:[[NSUUID UUID] UUIDString]];
  NSURLSession *session = [NSURLSession sessionWithConfiguration:config];

  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:url]];
  if (headers) {
    for (NSString *key in headers) {
      [request setValue:headers[key] forHTTPHeaderField:key];
    }
  }

  NSURLSessionDownloadTask *task = [session downloadTaskWithRequest:request completionHandler:^(NSURL *location, NSURLResponse *response, NSError *error) {
    if (error) {
      reject(@"DOWNLOAD_ERROR", error.localizedDescription, error);
      return;
    }

    NSError *moveError;
    [[NSFileManager defaultManager] moveItemAtURL:location toURL:[NSURL fileURLWithPath:destinationPath] error:&moveError];
    if (moveError) {
      reject(@"MOVE_ERROR", moveError.localizedDescription, moveError);
      return;
    }

    resolve(@"success");
  }];

  [task resume];
  resolve([[NSUUID UUID] UUIDString]);
}

RCT_EXPORT_METHOD(downloadWithHttp:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *url = options[@"url"];
  NSString *destinationPath = options[@"destinationPath"];
  NSDictionary *headers = options[@"headers"];

  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:url]];
  if (headers) {
    for (NSString *key in headers) {
      [request setValue:headers[key] forHTTPHeaderField:key];
    }
  }

  NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    if (error) {
      reject(@"DOWNLOAD_ERROR", error.localizedDescription, error);
      return;
    }

    [data writeToFile:destinationPath atomically:YES];
    resolve(@"success");
  }];

  [task resume];
}

RCT_EXPORT_METHOD(decryptMflacToFlac:(NSString *)inputPath
                  outputPath:(NSString *)outputPath
                  ekey:(NSString *)ekey
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSError *error = nil;
    BOOL success = [MFMflacSupport decryptFileAtPath:inputPath outputPath:outputPath ekey:ekey error:&error];
    if (success) {
      resolve(@YES);
    } else {
      reject(@"DecryptError", error.localizedDescription ?: @"MFLAC decryption failed", error);
    }
  });
}

RCT_EXPORT_METHOD(cancelHttpDownload:(NSString *)downloadId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@NO);
}

RCT_EXPORT_METHOD(cancelSystemDownload:(NSString *)downloadId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@NO);
}

RCT_EXPORT_METHOD(startMflacProxy:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSError *error = nil;
  NSString *baseURL = [MFMflacSupport startProxyWithError:&error];
  if (baseURL) {
    resolve(baseURL);
  } else {
    reject(@"ProxyStartError", error.localizedDescription ?: @"MFLAC proxy start failed", error);
  }
}

RCT_EXPORT_METHOD(registerMflacStream:(NSString *)src
                  ekey:(NSString *)ekey
                  headers:(NSDictionary *)headers
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSError *error = nil;
    NSString *localURL = [MFMflacSupport registerStream:src ekey:ekey headers:headers error:&error];
    if (localURL) {
      resolve(localURL);
    } else {
      reject(@"RegisterStreamError", error.localizedDescription ?: @"MFLAC stream registration failed", error);
    }
  });
}

@end
