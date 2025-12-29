import StatusBar from "@/components/base/statusBar";
import globalStyle from "@/constants/globalStyle";
import useOrientation from "@/hooks/useOrientation";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Background from "./components/background";
import Bottom from "./components/bottom";
import Content from "./components/content";
import Lyric from "./components/content/lyric";
import NavBar from "./components/navBar";
import Config from "@/core/appConfig";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useNavigation } from "@react-navigation/native";

export default function MusicDetail() {
    const orientation = useOrientation();
    const navigation = useNavigation<any>();
    const [isExiting, setIsExiting] = useState(false);
    const isHorizontal = orientation === "horizontal";

    useEffect(() => {
        const needAwake = Config.getConfig("basic.musicDetailAwake");
        if (needAwake) {
            activateKeepAwakeAsync();
        }
        return () => {
            if (needAwake) {
                deactivateKeepAwake();
            }
        };
    }, []);

    useEffect(() => {
        const unsubscribeBeforeRemove = navigation.addListener(
            "beforeRemove",
            () => {
                setIsExiting(true);
            },
        );
        const unsubscribeTransitionStart = navigation.addListener(
            "transitionStart",
            (event: any) => {
                if (event?.data?.closing) {
                    setIsExiting(true);
                }
            },
        );
        const unsubscribeFocus = navigation.addListener("focus", () => {
            setIsExiting(false);
        });

        return () => {
            unsubscribeBeforeRemove();
            unsubscribeTransitionStart();
            unsubscribeFocus();
        };
    }, [navigation]);

    return (
        <>
            <Background />
            <SafeAreaView style={globalStyle.fwflex1}>
                <StatusBar backgroundColor={"transparent"} />
                <View style={style.bodyWrapper}>
                    <View
                        style={[
                            globalStyle.flex1,
                            isHorizontal ? style.leftPane : null,
                        ]}>
                        <NavBar onBack={() => setIsExiting(true)} />
                        <Content disableMaskedView={isExiting} />
                        <Bottom />
                    </View>
                    {isHorizontal ? <View style={style.divider} /> : null}
                    {isHorizontal ? (
                        <View
                            style={[
                                globalStyle.flex1,
                                style.rightPane,
                            ]}>
                            <Lyric />
                        </View>
                    ) : null}
                </View>
            </SafeAreaView>
        </>
    );
}

const style = StyleSheet.create({
    bodyWrapper: {
        width: "100%",
        flex: 1,
        flexDirection: "row",
    },
    leftPane: {
        flex: 0.44,
    },
    rightPane: {
        flex: 0.56,
    },
    divider: {
        width: StyleSheet.hairlineWidth,
        backgroundColor: "rgba(255, 255, 255, 0.12)",
    },
});
