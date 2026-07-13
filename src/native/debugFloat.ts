import { NativeEventEmitter, NativeModules, Platform } from "react-native";

interface IDebugFloatNative {
    show: () => void;
    hide: () => void;
    bringToFront: () => void;
    getPosition: () => Promise<{x: number; y: number}>;
    setPosition: (x: number, y: number) => void;
    addListener?: (eventName: string) => void;
    removeListeners?: (count: number) => void;
}

const NativeDebugFloat: IDebugFloatNative | undefined =
    Platform.OS === "android" ? NativeModules.DebugFloat : undefined;

const emitter =
    NativeDebugFloat != null
        ? new NativeEventEmitter(NativeDebugFloat as any)
        : null;

const DebugFloat = {
    isSupported: Platform.OS === "android" && NativeDebugFloat != null,

    show() {
        try {
            NativeDebugFloat?.show();
        } catch {
            // ignore
        }
    },

    hide() {
        try {
            NativeDebugFloat?.hide();
        } catch {
            // ignore
        }
    },

    /** Stack above RN Modal / dialogs. Safe to call repeatedly. */
    bringToFront() {
        try {
            if (NativeDebugFloat?.bringToFront) {
                NativeDebugFloat.bringToFront();
            } else {
                NativeDebugFloat?.show();
            }
        } catch {
            // ignore
        }
    },

    async getPosition(): Promise<{x: number; y: number} | null> {
        try {
            if (!NativeDebugFloat?.getPosition) {
                return null;
            }
            const pos = await NativeDebugFloat.getPosition();
            if (
                pos &&
                typeof pos.x === "number" &&
                typeof pos.y === "number" &&
                pos.x >= 0 &&
                pos.y >= 0
            ) {
                return { x: pos.x, y: pos.y };
            }
            return null;
        } catch {
            return null;
        }
    },

    setPosition(x: number, y: number) {
        try {
            NativeDebugFloat?.setPosition?.(x, y);
        } catch {
            // ignore
        }
    },

    addPressListener(listener: () => void) {
        if (!emitter) {
            return () => {};
        }
        const sub = emitter.addListener("DebugFloatPress", listener);
        return () => sub.remove();
    },
};

export default DebugFloat;
