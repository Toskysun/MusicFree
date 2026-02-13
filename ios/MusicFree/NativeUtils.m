#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <CommonCrypto/CommonCryptor.h>

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
  // iOS does not need storage permission requests like Android
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getWindowDimensions) {
  CGRect bounds = [UIScreen mainScreen].bounds;
  return @{
    @"width": @(bounds.size.width),
    @"height": @(bounds.size.height)
  };
}

// Helper to perform DES operation
- (NSData *)performDES:(NSData *)data key:(NSString *)key operation:(CCOperation)operation error:(NSError **)error {
    char keyPtr[kCCKeySizeDES + 1];
    bzero(keyPtr, sizeof(keyPtr));

    [key getCString:keyPtr maxLength:sizeof(keyPtr) encoding:NSUTF8StringEncoding];

    // Android uses NoPadding. We simulate this by NOT using kCCOptionPKCS7Padding.
    // However, input must be a multiple of 8.
    if ([data length] % kCCBlockSizeDES != 0) {
        if (error) {
            *error = [NSError errorWithDomain:@"NativeUtils" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Data length must be multiple of 8"}];
        }
        return nil;
    }

    size_t bufferSize = [data length] + kCCBlockSizeDES;
    void *buffer = malloc(bufferSize);

    size_t numBytesMoved = 0;
    CCCryptorStatus cryptStatus = CCCrypt(operation,
                                          kCCAlgorithmDES,
                                          kCCOptionECBMode, // ECB Mode, No Padding (default if PKCS7 not specified)
                                          keyPtr,
                                          kCCKeySizeDES,
                                          NULL, // IV is ignored in ECB
                                          [data bytes],
                                          [data length],
                                          buffer,
                                          bufferSize,
                                          &numBytesMoved);

    if (cryptStatus == kCCSuccess) {
        // For NoPadding, output size should equal input size
        return [NSData dataWithBytesNoCopy:buffer length:numBytesMoved];
    }

    free(buffer);
    if (error) {
        *error = [NSError errorWithDomain:@"NativeUtils" code:cryptStatus userInfo:@{NSLocalizedDescriptionKey: @"DES operation failed"}];
    }
    return nil;
}

RCT_EXPORT_METHOD(desDecrypt:(NSArray *)data
                  key:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (!data || !key) {
        reject(@"INVALID_ARGS", @"Data or key is null", nil);
        return;
    }

    NSMutableData *inputData = [NSMutableData dataWithCapacity:[data count]];
    for (NSNumber *byteVal in data) {
        unsigned char byte = [byteVal unsignedCharValue];
        [inputData appendBytes:&byte length:1];
    }

    NSError *error = nil;
    NSData *result = [self performDES:inputData key:key operation:kCCDecrypt error:&error];

    if (error) {
        reject(@"DES_DECRYPT_ERROR", error.localizedDescription, error);
        return;
    }

    if (result.length != inputData.length) {
         reject(@"DES_DECRYPT_ERROR", [NSString stringWithFormat:@"Output size mismatch: input=%lu, output=%lu", (unsigned long)inputData.length, (unsigned long)result.length], nil);
         return;
    }

    NSMutableArray *outputArray = [NSMutableArray arrayWithCapacity:[result length]];
    const unsigned char *bytes = [result bytes];
    for (NSUInteger i = 0; i < [result length]; i++) {
        [outputArray addObject:@(bytes[i])];
    }

    resolve(outputArray);
}

RCT_EXPORT_METHOD(desEncrypt:(NSArray *)data
                  key:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (!data || !key) {
        reject(@"INVALID_ARGS", @"Data or key is null", nil);
        return;
    }

    NSMutableData *inputData = [NSMutableData dataWithCapacity:[data count]];
    for (NSNumber *byteVal in data) {
        unsigned char byte = [byteVal unsignedCharValue];
        [inputData appendBytes:&byte length:1];
    }

    NSError *error = nil;
    NSData *result = [self performDES:inputData key:key operation:kCCEncrypt error:&error];

    if (error) {
        reject(@"DES_ENCRYPT_ERROR", error.localizedDescription, error);
        return;
    }

    if (result.length != inputData.length) {
         reject(@"DES_ENCRYPT_ERROR", [NSString stringWithFormat:@"Output size mismatch: input=%lu, output=%lu", (unsigned long)inputData.length, (unsigned long)result.length], nil);
         return;
    }

    NSMutableArray *outputArray = [NSMutableArray arrayWithCapacity:[result length]];
    const unsigned char *bytes = [result bytes];
    for (NSUInteger i = 0; i < [result length]; i++) {
        [outputArray addObject:@(bytes[i])];
    }

    resolve(outputArray);
}

RCT_EXPORT_METHOD(desEncryptZeroBlock:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (!key) {
        reject(@"INVALID_ARGS", @"Key is null", nil);
        return;
    }

    // 8 bytes of zeros
    unsigned char zeros[8] = {0};
    NSData *inputData = [NSData dataWithBytes:zeros length:8];

    NSError *error = nil;
    NSData *result = [self performDES:inputData key:key operation:kCCEncrypt error:&error];

    if (error) {
        reject(@"DES_ENCRYPT_ERROR", error.localizedDescription, error);
        return;
    }

    NSMutableArray *outputArray = [NSMutableArray arrayWithCapacity:[result length]];
    const unsigned char *bytes = [result bytes];
    for (NSUInteger i = 0; i < [result length]; i++) {
        [outputArray addObject:@(bytes[i])];
    }

    resolve(outputArray);
}

@end
