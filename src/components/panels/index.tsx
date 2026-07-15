import React from "react";
import { StyleSheet, View } from "react-native";
import panels from "./types";
import { panelInfoStore } from "./usePanel";

function Panels() {
    const panelInfoState = panelInfoStore.useValue();

    const Component = panelInfoState.name ? panels[panelInfoState.name] : null;

    // Only mount when open. Host is a real full-window ViewGroup so Fabric can
    // mount/unmount children safely and absolute children get a sized parent.
    if (!Component) {
        return null;
    }

    return (
        <View
            pointerEvents="box-none"
            collapsable={false}
            style={styles.host}>
            <Component
                key={panelInfoState.name}
                {...(panelInfoState.payload ?? {})}
            />
        </View>
    );
}

export default React.memo(Panels, () => true);

const styles = StyleSheet.create({
    host: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 15000,
        elevation: 15000,
    },
});
