import { BackHandler, Platform } from "react-native";
import NativeUtils from "@/native/utils";

/**
 * Best-effort app exit.
 * - Android: finish affinity / native exit
 * - iOS: no public quit API; native still exits on main queue for explicit user action
 */
export function forceExitApp() {
    try {
        if (Platform.OS === "android") {
            BackHandler.exitApp();
        }
    } catch {
        // fall through to native
    }
    try {
        NativeUtils.exitApp();
    } catch {
        // ignore
    }
}
