import React from "react";
import { StatusBar, StatusBarProps, View, StyleSheet } from "react-native";
import useColors from "@/hooks/useColors";

interface IStatusBarProps extends StatusBarProps {}

export default function (props: IStatusBarProps) {
    const colors = useColors();
    const { backgroundColor, barStyle } = props;

    return (
        <>
            <StatusBar
                backgroundColor={"rgba(0,0,0,0)"}
                barStyle={barStyle ?? "light-content"}
            />
            <View
                style={[
                    styles.statusBarView,
                    {
                        backgroundColor:
                            backgroundColor ?? colors.appBar ?? colors.primary,
                        height: StatusBar.currentHeight,
                    },
                ]}
            />
        </>
    );
}

const styles = StyleSheet.create({
    statusBarView: {
        zIndex: 10000,
        position: "absolute",
        top: 0,
        width: "100%",
    },
});
