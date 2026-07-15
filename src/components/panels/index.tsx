import React from "react";
import panels from "./types";
import { panelInfoStore } from "./usePanel";

function Panels() {
    const panelInfoState = panelInfoStore.useValue();

    const Component = panelInfoState.name ? panels[panelInfoState.name] : null;

    // Only mount panel tree when open. A permanent absoluteFill host can steal
    // touches on some Android/Fabric builds even with pointerEvents="box-none".
    if (!Component) {
        return null;
    }

    return (
        <Component
            key={panelInfoState.name}
            {...(panelInfoState.payload ?? {})}
        />
    );
}

export default React.memo(Panels, () => true);
