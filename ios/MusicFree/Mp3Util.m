#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <AVFoundation/AVFoundation.h>

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
  // iOS AVFoundation不支持直接写入元数据，需要第三方库
  reject(@"UNSUPPORTED", @"Writing metadata not supported on iOS", nil);
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
  reject(@"UNSUPPORTED", @"Writing cover not supported on iOS", nil);
}

RCT_EXPORT_METHOD(setMediaTagWithCover:(NSString *)filePath
                  meta:(NSDictionary *)meta
                  coverPath:(NSString *)coverPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  reject(@"UNSUPPORTED", @"Writing metadata not supported on iOS", nil);
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
  reject(@"UNSUPPORTED", @"MFLAC decryption not supported on iOS", nil);
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
  reject(@"UNSUPPORTED", @"MFLAC proxy not supported on iOS", nil);
}

RCT_EXPORT_METHOD(registerMflacStream:(NSString *)src
                  ekey:(NSString *)ekey
                  headers:(NSDictionary *)headers
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  reject(@"UNSUPPORTED", @"MFLAC streaming not supported on iOS", nil);
}

@end
