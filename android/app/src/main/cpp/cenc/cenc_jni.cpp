#include <jni.h>

#include <cstdint>

#include "cenc_decoder.h"

namespace {

ence::CencDecoder* decoderFrom(jlong handle) {
    return reinterpret_cast<ence::CencDecoder*>(static_cast<intptr_t>(handle));
}

jlong toHandle(ence::CencDecoder* decoder) {
    return static_cast<jlong>(reinterpret_cast<intptr_t>(decoder));
}

} // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_fun_xwj_musicfree_cenc_CencNative_nativeCreate(
    JNIEnv* env,
    jobject,
    jbyteArray ftypArray,
    jbyteArray moovArray,
    jbyteArray cekArray,
    jlong mdatFileOffset,
    jlong mdatPayloadSize) {
    if (!ftypArray || !moovArray || !cekArray || env->GetArrayLength(cekArray) != 16) {
        return 0;
    }

    jbyte* ftyp = env->GetByteArrayElements(ftypArray, nullptr);
    jbyte* moov = env->GetByteArrayElements(moovArray, nullptr);
    jbyte* cek = env->GetByteArrayElements(cekArray, nullptr);
    if (!ftyp || !moov || !cek) {
        if (ftyp) env->ReleaseByteArrayElements(ftypArray, ftyp, JNI_ABORT);
        if (moov) env->ReleaseByteArrayElements(moovArray, moov, JNI_ABORT);
        if (cek) env->ReleaseByteArrayElements(cekArray, cek, JNI_ABORT);
        return 0;
    }

    auto* decoder = new ence::CencDecoder(
        reinterpret_cast<uint8_t*>(ftyp),
        static_cast<size_t>(env->GetArrayLength(ftypArray)),
        reinterpret_cast<uint8_t*>(moov),
        static_cast<size_t>(env->GetArrayLength(moovArray)),
        reinterpret_cast<uint8_t*>(cek),
        static_cast<uint64_t>(mdatFileOffset),
        static_cast<uint64_t>(mdatPayloadSize));

    env->ReleaseByteArrayElements(ftypArray, ftyp, JNI_ABORT);
    env->ReleaseByteArrayElements(moovArray, moov, JNI_ABORT);
    env->ReleaseByteArrayElements(cekArray, cek, JNI_ABORT);
    return toHandle(decoder);
}

extern "C" JNIEXPORT jboolean JNICALL
Java_fun_xwj_musicfree_cenc_CencNative_nativeIsValid(JNIEnv*, jobject, jlong handle) {
    auto* decoder = decoderFrom(handle);
    return decoder && decoder->ok() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_fun_xwj_musicfree_cenc_CencNative_nativeGetError(JNIEnv* env, jobject, jlong handle) {
    auto* decoder = decoderFrom(handle);
    const char* message = decoder ? decoder->error().c_str() : "invalid decoder handle";
    return env->NewStringUTF(message);
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_fun_xwj_musicfree_cenc_CencNative_nativeGetHeader(JNIEnv* env, jobject, jlong handle) {
    auto* decoder = decoderFrom(handle);
    if (!decoder || !decoder->ok()) return nullptr;
    const auto& header = decoder->header();
    auto result = env->NewByteArray(static_cast<jsize>(header.size()));
    if (result && !header.empty()) {
        env->SetByteArrayRegion(
            result,
            0,
            static_cast<jsize>(header.size()),
            reinterpret_cast<const jbyte*>(header.data()));
    }
    return result;
}

extern "C" JNIEXPORT jlong JNICALL
Java_fun_xwj_musicfree_cenc_CencNative_nativeGetHeaderSize(JNIEnv*, jobject, jlong handle) {
    auto* decoder = decoderFrom(handle);
    return decoder ? static_cast<jlong>(decoder->headerSize()) : 0;
}

extern "C" JNIEXPORT jlong JNICALL
Java_fun_xwj_musicfree_cenc_CencNative_nativeGetMdatFileOffset(JNIEnv*, jobject, jlong handle) {
    auto* decoder = decoderFrom(handle);
    return decoder ? static_cast<jlong>(decoder->mdatFileOffset()) : 0;
}

extern "C" JNIEXPORT jlong JNICALL
Java_fun_xwj_musicfree_cenc_CencNative_nativeGetOutputTotalSize(JNIEnv*, jobject, jlong handle) {
    auto* decoder = decoderFrom(handle);
    return decoder ? static_cast<jlong>(decoder->outputTotalSize()) : 0;
}

extern "C" JNIEXPORT void JNICALL
Java_fun_xwj_musicfree_cenc_CencNative_nativeDecrypt(
    JNIEnv* env,
    jobject,
    jlong handle,
    jlong mdatRelativeOffset,
    jbyteArray dataArray,
    jint dataOffset,
    jint length) {
    auto* decoder = decoderFrom(handle);
    if (!decoder || !decoder->ok() || !dataArray || dataOffset < 0 || length < 0 ||
        dataOffset + length > env->GetArrayLength(dataArray)) {
        return;
    }
    jbyte* data = env->GetByteArrayElements(dataArray, nullptr);
    if (!data) return;
    decoder->decrypt(
        static_cast<uint64_t>(mdatRelativeOffset),
        reinterpret_cast<uint8_t*>(data + dataOffset),
        static_cast<size_t>(length));
    env->ReleaseByteArrayElements(dataArray, data, 0);
}

extern "C" JNIEXPORT void JNICALL
Java_fun_xwj_musicfree_cenc_CencNative_nativeDestroy(JNIEnv*, jobject, jlong handle) {
    delete decoderFrom(handle);
}
