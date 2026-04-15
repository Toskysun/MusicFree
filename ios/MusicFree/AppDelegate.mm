#import "AppDelegate.h"

#if __has_include(<React-RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>)
#import <React-RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React-RCTAppDelegate/RCTReactNativeFactory.h>
#elif __has_include(<React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>)
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React_RCTAppDelegate/RCTReactNativeFactory.h>
#else
#import <RCTDefaultReactNativeFactoryDelegate.h>
#import <RCTReactNativeFactory.h>
#endif

#import <React/RCTAssert.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTConstants.h>
static NSString *const MusicFreeRCTUntruncatedMessageKey = @"RCTUntruncatedMessageKey";

static NSString *MusicFreeLaunchSessionId(void)
{
  static NSString *sessionId = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    sessionId = [NSUUID UUID].UUIDString;
  });
  return sessionId;
}

static NSString *MusicFreeNativeLogPath(void)
{
  NSArray<NSString *> *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSString *documentsPath = paths.firstObject;
  if (documentsPath.length == 0) {
    return nil;
  }

  NSString *logDirectory = [documentsPath stringByAppendingPathComponent:@"log"];
  [[NSFileManager defaultManager] createDirectoryAtPath:logDirectory
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:nil];
  return [logDirectory stringByAppendingPathComponent:@"ios-native-startup.log"];
}

static id MusicFreeJSONSafeValue(id value)
{
  if (value == nil || value == (id)kCFNull) {
    return [NSNull null];
  }

  if ([value isKindOfClass:NSString.class] || [value isKindOfClass:NSNumber.class] || [value isKindOfClass:NSNull.class]) {
    return value;
  }

  if ([value isKindOfClass:NSURL.class]) {
    return ((NSURL *)value).absoluteString ?: @"";
  }

  if ([value isKindOfClass:NSDate.class]) {
    return @([(NSDate *)value timeIntervalSince1970]);
  }

  if ([value isKindOfClass:NSError.class]) {
    NSError *error = (NSError *)value;
    return @{
      @"domain" : error.domain ?: @"",
      @"code" : @(error.code),
      @"localizedDescription" : error.localizedDescription ?: @"",
      @"userInfo" : MusicFreeJSONSafeValue(error.userInfo ?: @{}),
    };
  }

  if ([value isKindOfClass:NSArray.class]) {
    NSMutableArray *items = [NSMutableArray arrayWithCapacity:((NSArray *)value).count];
    for (id item in (NSArray *)value) {
      [items addObject:MusicFreeJSONSafeValue(item) ?: [NSNull null]];
    }
    return items;
  }

  if ([value isKindOfClass:NSDictionary.class]) {
    NSMutableDictionary<NSString *, id> *result = [NSMutableDictionary dictionaryWithCapacity:((NSDictionary *)value).count];
    for (id key in (NSDictionary *)value) {
      NSString *safeKey = [key isKindOfClass:NSString.class] ? key : [key description];
      result[safeKey] = MusicFreeJSONSafeValue(((NSDictionary *)value)[key]) ?: [NSNull null];
    }
    return result;
  }

  return [value description] ?: @"";
}

static NSString *MusicFreeISO8601Timestamp(void)
{
  static NSISO8601DateFormatter *formatter = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    formatter = [NSISO8601DateFormatter new];
    formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime | NSISO8601DateFormatWithFractionalSeconds;
  });
  return [formatter stringFromDate:[NSDate date]];
}

static void MusicFreeAppendNativeStartupLog(NSString *step, NSDictionary *details)
{
  @autoreleasepool {
    @try {
      NSString *path = MusicFreeNativeLogPath();
      if (path.length == 0) {
        return;
      }

      if (![[NSFileManager defaultManager] fileExistsAtPath:path]) {
        [[NSFileManager defaultManager] createFileAtPath:path contents:nil attributes:nil];
      }

      NSMutableDictionary *payload = [NSMutableDictionary dictionary];
      payload[@"ts"] = MusicFreeISO8601Timestamp();
      payload[@"sessionId"] = MusicFreeLaunchSessionId();
      payload[@"step"] = step ?: @"";
      payload[@"thread"] = [NSThread isMainThread] ? @"main" : (NSThread.currentThread.name.length > 0 ? NSThread.currentThread.name : @"background");
      payload[@"pid"] = @([[NSProcessInfo processInfo] processIdentifier]);
      if (details != nil) {
        payload[@"details"] = MusicFreeJSONSafeValue(details);
      }

      NSData *jsonData = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
      if (jsonData.length == 0) {
        return;
      }

      NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:path];
      [handle seekToEndOfFile];
      [handle writeData:jsonData];
      [handle writeData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
      [handle closeFile];
    } @catch (__unused NSException *exception) {
    }
  }
}

static void MusicFreeThrowDefaultReactFatalError(NSError *error)
{
  NSString *name = [NSString stringWithFormat:@"%@: %@", RCTFatalExceptionName, error.localizedDescription];
  NSString *message = RCTFormatError(error.localizedDescription, error.userInfo[RCTJSStackTraceKey], 175);
  NSMutableDictionary *userInfo = [error.userInfo mutableCopy] ?: [NSMutableDictionary dictionary];
  userInfo[MusicFreeRCTUntruncatedMessageKey] = RCTFormatError(error.localizedDescription, error.userInfo[RCTJSStackTraceKey], (NSUInteger)-1);
  @throw [[NSException alloc] initWithName:name reason:message userInfo:userInfo];
}

static void MusicFreeHandleUncaughtException(NSException *exception)
{
  MusicFreeAppendNativeStartupLog(@"uncaught-exception", @{
    @"name" : exception.name ?: @"",
    @"reason" : exception.reason ?: @"",
    @"userInfo" : MusicFreeJSONSafeValue(exception.userInfo ?: @{}),
    @"callStackSymbols" : exception.callStackSymbols ?: @[],
  });
}

static void MusicFreeRegisterNotificationLogger(NSString *name, NSString *step)
{
  [[NSNotificationCenter defaultCenter] addObserverForName:name
                                                    object:nil
                                                     queue:nil
                                                usingBlock:^(NSNotification *notification) {
    NSMutableDictionary *details = [NSMutableDictionary dictionary];
    if (notification.name.length > 0) {
      details[@"name"] = notification.name;
    }
    if (notification.object != nil) {
      details[@"object"] = MusicFreeJSONSafeValue(notification.object);
    }
    if (notification.userInfo.count > 0) {
      details[@"userInfo"] = MusicFreeJSONSafeValue(notification.userInfo);
    }
    MusicFreeAppendNativeStartupLog(step, details.count > 0 ? details : nil);
  }];
}

static void MusicFreeInstallNativeStartupHooks(void)
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    NSSetUncaughtExceptionHandler(&MusicFreeHandleUncaughtException);

    RCTSetFatalHandler(^(NSError *error) {
      MusicFreeAppendNativeStartupLog(@"react-fatal", @{
        @"error" : MusicFreeJSONSafeValue(error),
      });
      MusicFreeThrowDefaultReactFatalError(error);
    });

    RCTSetFatalExceptionHandler(^(NSException *exception) {
      MusicFreeAppendNativeStartupLog(@"react-fatal-exception", @{
        @"name" : exception.name ?: @"",
        @"reason" : exception.reason ?: @"",
        @"userInfo" : MusicFreeJSONSafeValue(exception.userInfo ?: @{}),
      });
      @throw exception;
    });

    MusicFreeRegisterNotificationLogger(RCTJavaScriptWillStartLoadingNotification, @"js-will-start-loading");
    MusicFreeRegisterNotificationLogger(RCTJavaScriptWillStartExecutingNotification, @"js-will-start-executing");
    MusicFreeRegisterNotificationLogger(RCTJavaScriptDidLoadNotification, @"js-did-load");
    MusicFreeRegisterNotificationLogger(RCTJavaScriptDidFailToLoadNotification, @"js-did-fail-to-load");
    MusicFreeRegisterNotificationLogger(UIApplicationDidBecomeActiveNotification, @"app-did-become-active");
    MusicFreeRegisterNotificationLogger(UIApplicationWillResignActiveNotification, @"app-will-resign-active");
    MusicFreeRegisterNotificationLogger(UIApplicationDidEnterBackgroundNotification, @"app-did-enter-background");
    MusicFreeRegisterNotificationLogger(UIApplicationWillTerminateNotification, @"app-will-terminate");
  });
}

@interface MusicFreeReactNativeFactoryDelegate : RCTDefaultReactNativeFactoryDelegate
@end

@implementation MusicFreeReactNativeFactoryDelegate

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  MusicFreeAppendNativeStartupLog(@"sourceURLForBridge", nil);
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  NSURL *url = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
  MusicFreeAppendNativeStartupLog(@"bundleURL-debug", @{
    @"url" : url.absoluteString ?: @"",
  });
  return url;
#else
  NSURL *url = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
  MusicFreeAppendNativeStartupLog(@"bundleURL-release", @{
    @"url" : url.absoluteString ?: @"",
  });
  return url;
#endif
}

- (BOOL)newArchEnabled
{
  return NO;
}

- (BOOL)bridgelessEnabled
{
  return NO;
}

@end

@interface AppDelegate () {
  UIWindow *_musicFreeWindow;
  RCTReactNativeFactory *_musicFreeReactNativeFactory;
  MusicFreeReactNativeFactoryDelegate *_musicFreeReactNativeFactoryDelegate;
}
@end

@implementation AppDelegate

- (UIWindow *)window
{
  return _musicFreeWindow;
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  MusicFreeAppendNativeStartupLog(@"didFinishLaunching-enter", @{
    @"launchOptionsKeys" : launchOptions.allKeys ?: @[],
  });
  MusicFreeInstallNativeStartupHooks();
  MusicFreeAppendNativeStartupLog(@"native-hooks-installed", nil);

  self.moduleName = @"main";
  self.initialProps = @{};
  MusicFreeAppendNativeStartupLog(@"react-config-ready", @{
    @"moduleName" : self.moduleName ?: @"",
  });

  _musicFreeWindow = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
  _musicFreeReactNativeFactoryDelegate = [MusicFreeReactNativeFactoryDelegate new];
  MusicFreeAppendNativeStartupLog(@"react-factory-delegate-ready", nil);

  Class dependencyProviderClass = NSClassFromString(@"RCTAppDependencyProvider");
  if (dependencyProviderClass != Nil) {
    id dependencyProvider = [dependencyProviderClass new];
    if ([dependencyProvider conformsToProtocol:@protocol(RCTDependencyProvider)]) {
      _musicFreeReactNativeFactoryDelegate.dependencyProvider = dependencyProvider;
      MusicFreeAppendNativeStartupLog(@"react-dependency-provider-ready", @{
        @"class" : NSStringFromClass(dependencyProviderClass),
      });
    } else {
      MusicFreeAppendNativeStartupLog(@"react-dependency-provider-invalid", @{
        @"class" : NSStringFromClass(dependencyProviderClass),
      });
    }
  } else {
    MusicFreeAppendNativeStartupLog(@"react-dependency-provider-missing", nil);
  }

  _musicFreeReactNativeFactory = [[RCTReactNativeFactory alloc] initWithDelegate:_musicFreeReactNativeFactoryDelegate];
  MusicFreeAppendNativeStartupLog(@"react-factory-ready", nil);

  // Bind factory to Expo's internal delegate via ObjC message forwarding.
  // EXAppDelegateWrapper forwards unknown selectors to EXExpoAppDelegate which owns bindReactNativeFactory:.
  @try {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
    SEL bindFactorySelector = NSSelectorFromString(@"bindReactNativeFactory:");
    [self performSelector:bindFactorySelector withObject:_musicFreeReactNativeFactory];
#pragma clang diagnostic pop
    MusicFreeAppendNativeStartupLog(@"react-factory-bound", nil);
  } @catch (NSException *exception) {
    MusicFreeAppendNativeStartupLog(@"react-factory-bind-failed", @{
      @"reason" : exception.reason ?: @"unknown",
    });
  }

  [_musicFreeReactNativeFactory startReactNativeWithModuleName:self.moduleName ?: @"main"
                                                inWindow:_musicFreeWindow
                                       initialProperties:self.initialProps
                                           launchOptions:launchOptions];
  MusicFreeAppendNativeStartupLog(@"react-native-started", nil);

  BOOL result = [super application:application didFinishLaunchingWithOptions:launchOptions];
  MusicFreeAppendNativeStartupLog(@"didFinishLaunching-super-return", @{
    @"result" : @(result),
  });
  return result;
}

@end
