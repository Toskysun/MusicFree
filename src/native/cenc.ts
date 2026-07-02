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
