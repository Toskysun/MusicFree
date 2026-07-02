cmake_minimum_required(VERSION 3.22.1)

project(musicfree_cenc LANGUAGES CXX)

add_library(
    musicfree-cenc
    SHARED
    cenc_jni.cpp
    cenc/aes.cpp
    cenc/cenc_decoder.cpp
    cenc/mp4.cpp
)

target_include_directories(musicfree-cenc PRIVATE cenc)
target_compile_features(musicfree-cenc PRIVATE cxx_std_17)
target_compile_options(musicfree-cenc PRIVATE -fno-exceptions)

find_library(log-lib log)
target_link_libraries(musicfree-cenc ${log-lib})
