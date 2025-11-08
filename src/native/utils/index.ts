import { NativeModule, NativeModules } from "react-native";

interface INativeUtils extends NativeModule {
    exitApp: () => void;
    checkStoragePermission: () => Promise<boolean>;
    requestStoragePermission: () => void;
    getWindowDimensions: () => { width: number, height: number }; // Fix bug: https://github.com/facebook/react-native/issues/47080
    desDecrypt: (data: number[], key: string) => Promise<number[]>;
    desEncrypt: (data: number[], key: string) => Promise<number[]>;
    desEncryptZeroBlock: (key: string) => Promise<number[]>;
}

const NativeUtils = NativeModules.NativeUtils;

export default NativeUtils as INativeUtils;
