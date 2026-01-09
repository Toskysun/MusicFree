#import <React/RCTBridgeModule.h>

@interface LyricUtil : NSObject <RCTBridgeModule>
@end

@implementation LyricUtil

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(checkSystemAlertPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // iOS不支持悬浮窗
  resolve(@NO);
}

RCT_EXPORT_METHOD(requestSystemAlertPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@NO);
}

RCT_EXPORT_METHOD(showStatusBarLyric:(NSString *)initLyric
                  config:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // iOS不支持悬浮窗歌词
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

RCT_EXPORT_METHOD(decryptQRCLyric:(NSString *)encryptedHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // TODO: 实现QRC歌词解密
  reject(@"UNSUPPORTED", @"QRC decryption not implemented on iOS", nil);
}

RCT_EXPORT_METHOD(decryptKuwoLyric:(NSString *)lrcBase64
                  isGetLyricx:(BOOL)isGetLyricx
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // TODO: 实现酷我歌词解密
  reject(@"UNSUPPORTED", @"Kuwo decryption not implemented on iOS", nil);
}

@end
