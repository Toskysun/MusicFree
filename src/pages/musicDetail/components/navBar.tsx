import React from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import { useNavigation } from "@react-navigation/native";
import IconButton from "@/components/base/iconButton";
import useOrientation from "@/hooks/useOrientation";
import HeartIcon from "./content/heartIcon";

interface INavBarProps {
    onBack?: () => void;
}

export default function NavBar(props: INavBarProps) {
    const { onBack } = props;
    const navigation = useNavigation();
    const orientation = useOrientation();
    const isHorizontal = orientation === "horizontal";

    return (
        <View style={styles.container}>
            <IconButton
                name="arrow-left"
                sizeType={"normal"}
                color="white"
                style={styles.button}
                onPress={() => {
                    onBack?.();
                    requestAnimationFrame(() => {
                        navigation.goBack();
                    });
                }}
            />
            {isHorizontal ? (
                <View style={styles.rightButton}>
                    <HeartIcon />
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        height: rpx(100),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    button: {
        marginHorizontal: rpx(24),
    },
    rightButton: {
        marginHorizontal: rpx(24),
    },
});
