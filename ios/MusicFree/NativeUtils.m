#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface NativeUtils : NSObject <RCTBridgeModule>
@end

@implementation NativeUtils

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(exitApp) {
  exit(0);
}

RCT_EXPORT_METHOD(checkStoragePermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@YES);
}

RCT_EXPORT_METHOD(requestStoragePermission) {
  // iOS不需要存储权限
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getWindowDimensions) {
  CGRect bounds = [UIScreen mainScreen].bounds;
  return @{
    @"width": @(bounds.size.width),
    @"height": @(bounds.size.height)
  };
}

RCT_EXPORT_METHOD(desDecrypt:(NSArray *)data
                  key:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // TODO: 实现DES解密
  resolve(@[]);
}

RCT_EXPORT_METHOD(desEncrypt:(NSArray *)data
                  key:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // TODO: 实现DES加密
  resolve(@[]);
}

RCT_EXPORT_METHOD(desEncryptZeroBlock:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@[]);
}

@end
