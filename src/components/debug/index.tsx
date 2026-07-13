import React from "react";
import VDebug from "@/lib/react-native-vdebug";
import { useAppConfig } from "@/core/appConfig";

/**
 * Debug entry.
 *
 * Android FAB: native decorView child (no PopupWindow — avoids EGL_BAD_ACCESS).
 * Log panel: absolute pixel overlay inside the app root (no flex reflow).
 */
export default function Debug() {
    const showDebug = useAppConfig("debug.devLog");
    return showDebug ? <VDebug /> : null;
}
