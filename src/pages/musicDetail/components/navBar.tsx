import React from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import { useNavigation } from "@react-navigation/native";
import IconButton from "@/components/base/iconButton";

interface INavBarProps {
    onBack?: () => void;
}

export default function NavBar(props: INavBarProps) {
    const { onBack } = props;
    const navigation = useNavigation();

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
    spacer: {
        flex: 1,
    },
});
