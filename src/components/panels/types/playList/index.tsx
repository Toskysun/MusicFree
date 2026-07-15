import React from "react";
import { StyleSheet, View } from "react-native";

import Header from "./header";
import Body from "./body";
import PanelBase from "../../base/panelBase";
import Divider from "@/components/base/divider";
import { vh } from "@/utils/rpx";

export default function () {
    return (
        <PanelBase
            height={vh(80)}
            keyboardAvoidBehavior="none"
            renderBody={loading => (
                <View style={styles.bodyRoot}>
                    <Header />
                    <Divider />
                    <Body loading={loading} />
                </View>
            )}
        />
    );
}

const styles = StyleSheet.create({
    bodyRoot: {
        flex: 1,
        width: "100%",
        minHeight: 0,
    },
});
