import React from "react";
import MvPlayer from "@/components/panels/types/mvPlayer";
import { mvPlayerStore } from "./useMvPlayer";

/**
 * Root-level MV host. It is intentionally outside the generic Panels
 * registry: MV owns a full-window native Modal and has a different lifecycle
 * from bottom sheets and dialogs.
 */
export default function MvPlayerHost() {
    const payload = mvPlayerStore.useValue();
    if (!payload) return null;

    return (
        <MvPlayer
            musicItem={payload.musicItem}
            initialSource={payload.initialSource}
            onClosed={() => mvPlayerStore.setValue(null)}
        />
    );
}
