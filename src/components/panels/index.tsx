import React from "react";
import { StyleSheet, View } from "react-native";
import panels from "./types";
import { panelInfoStore } from "./usePanel";

function Panels() {
    const panelInfoState = panelInfoStore.useValue();

    const Component = panelInfoState.name ? panels[panelInfoState.name] : null;

    // Stable View host so Fabric always removes panel trees from a ViewGroup.
    return (
        <View
            pointerEvents="box-none"
            collapsable={false}
            style={styles.host}>
            {Component ? (
                <Component
                    key={panelInfoState.name}
                    {...(panelInfoState.payload ?? {})}
                />
            ) : null}
        </View>
    );
}

export default React.memo(Panels, () => true);

const styles = StyleSheet.create({
    host: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 15000,
    },
});