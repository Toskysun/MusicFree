import { ROUTE_PATH } from "@/core/router";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import ThemeText from "@/components/base/themeText";
import IconButton from "@/components/base/iconButton";
import Icon from "@/components/base/icon.tsx";
import { useI18N } from "@/core/i18n";

// todo icon: = musicFree(引入自定义字体 居中) search
export default function NavBar() {
    const navigation = useNavigation<any>();
    const colors = useColors();
    const { t } = useI18N();

    return (
        <View style={styles.appbar}>
            <View
                style={[
                    styles.menuFrame,
                    {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                    },
                ]}>
                <IconButton
                    accessibilityLabel={t("home.openSidebar.a11y")}
                    name="bars-3"
                    color={colors.text}
                    onPress={() => {
                        navigation?.openDrawer();
                    }}
                />
            </View>

            <Pressable
                style={[
                    styles.searchBar,
                    {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                    },
                ]}
                accessible
                accessibilityLabel={t("home.clickToSearch")}
                onPress={() => {
                    navigation.navigate(ROUTE_PATH.SEARCH_PAGE);
                }}>
                <Icon
                    accessible={false}
                    name="magnifying-glass"
                    size={rpx(32)}
                    color={colors.textSecondary}
                />
                <ThemeText
                    accessible={false}
                    fontSize="subTitle"
                    fontColor="textSecondary"
                    style={styles.text}>
                    {t("home.clickToSearch")}
                </ThemeText>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    appbar: {
        backgroundColor: "transparent",
        shadowColor: "transparent",
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        height: rpx(108),
        paddingHorizontal: rpx(24),
        gap: rpx(16),
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        height: rpx(72),
        borderRadius: rpx(36),
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: rpx(24),
    },
    text: {
        marginLeft: rpx(12),
    },
    menuFrame: {
        width: rpx(72),
        height: rpx(72),
        borderRadius: rpx(36),
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: "center",
        justifyContent: "center",
    },
});
