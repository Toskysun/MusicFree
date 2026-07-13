# React Native New Architecture requires the appmodules shared library
# (OnLoad.cpp + autolinking). Keep no *.cpp in this directory so
# ReactNative-application.cmake uses the default OnLoad.cpp.
cmake_minimum_required(VERSION 3.22.1)

project(appmodules)

include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# Custom CENC decoder (separate .so, loaded via System.loadLibrary)
add_library(
    musicfree-cenc
    SHARED
    cenc/cenc_jni.cpp
    cenc/aes.cpp
    cenc/cenc_decoder.cpp
    cenc/mp4.cpp
)

target_include_directories(musicfree-cenc PRIVATE cenc)
target_compile_features(musicfree-cenc PRIVATE cxx_std_17)
target_compile_options(musicfree-cenc PRIVATE -fno-exceptions)

find_library(log-lib log)
target_link_libraries(musicfree-cenc ${log-lib})
