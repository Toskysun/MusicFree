#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface MFMflacSupport : NSObject

+ (BOOL)decryptFileAtPath:(NSString *)inputPath
               outputPath:(NSString *)outputPath
                     ekey:(NSString *)ekey
                    error:(NSError **)error;

+ (nullable NSString *)startProxyWithError:(NSError **)error;

+ (nullable NSString *)registerStream:(NSString *)src
                                  ekey:(NSString *)ekey
                               headers:(nullable NSDictionary *)headers
                                 error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
