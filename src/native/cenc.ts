import { NativeModules } from "react-native";

interface ICencNativeModule {
    registerStream(
        src: string,
        cek: string,
        headers?: Record<string, string> | null,
    ): Promise<string>;
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
};

export default Cenc;
