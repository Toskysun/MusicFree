import { NativeModules } from "react-native";

interface ICencNativeModule {
    registerStream(
        src: string,
        cek: string,
        headers?: Record<string, string> | null,
    ): Promise<string>;
    decryptFile(inputPath: string, outputPath: string, cek: string): Promise<boolean>;
}

const nativeModule = NativeModules.Cenc as ICencNativeModule | undefined;

const Cenc = {
    /** CENC 解密能力是否可用（iOS 等平台没有对应原生模块） */
    isAvailable(): boolean {
        return !!nativeModule?.decryptFile;
    },

    async registerStream(
        src: string,
        cek: string,
        headers?: Record<string, string>,
    ): Promise<string> {
        if (!nativeModule?.registerStream) {
            throw new Error("CENC native module is unavailable");
        }
        return nativeModule.registerStream(src, cek, headers ?? null);
    },

    async decryptFile(
        inputPath: string,
        outputPath: string,
        cek: string,
    ): Promise<boolean> {
        if (!nativeModule?.decryptFile) {
            throw new Error("CENC file decryption is unavailable");
        }
        return nativeModule.decryptFile(inputPath, outputPath, cek);
    },
};

export default Cenc;
