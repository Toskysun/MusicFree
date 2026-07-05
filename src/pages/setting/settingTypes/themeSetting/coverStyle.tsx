import React from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";
import ListItem from "@/components/base/listItem";
import Config, { useAppConfig } from "@/core/appConfig";
import { useI18N } from "@/core/i18n";
import useColors from "@/hooks/useColors";

export default function CoverStyle() {
    const { t } = useI18N();
    const coverStyle = useAppConfig("theme.coverStyle") ?? "square";
    const musicDetailCoverStyle =
        useAppConfig("theme.musicDetailCoverStyle") ?? "classic";
    const colors = useColors();
    const isSquareImmersive =
        coverStyle === "square" && musicDetailCoverStyle === "immersive";
    const isSquareClassic = coverStyle === "square" && !isSquareImmersive;

    return (
        <View>
            <ThemeText
                fontSize="subTitle"
                fontWeight="bold"
                style={styles.header}>
                {t("themeSettings.coverStyle")}
            </ThemeText>
            <View style={styles.sectionWrapper}>
                <ListItem withHorizontalPadding>
                    <ListItem.Content>
                        <View style={styles.optionsRow}>
                            <TouchableOpacity
                                style={[
                                    styles.optionItem,
                                    isSquareClassic && {
                                        borderColor: colors.primary,
                                        borderWidth: 2,
                                    },
                                ]}
                                onPress={() => {
                                    Config.setConfig("theme.coverStyle", "square");
                                    Config.setConfig(
                                        "theme.musicDetailCoverStyle",
                                        "classic",
                                    );
                                }}>
                                <View style={[styles.previewSquare, { backgroundColor: colors.card }]} />
                                <ThemeText fontSize="description" style={styles.optionText}>
                                    {t("themeSettings.coverStyleSquare")}
                                </ThemeText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.optionItem,
                                    isSquareImmersive && {
                                        borderColor: colors.primary,
                                        borderWidth: 2,
                                    },
                                ]}
                                onPress={() => {
                                    Config.setConfig("theme.coverStyle", "square");
                                    Config.setConfig(
                                        "theme.musicDetailCoverStyle",
                                        "immersive",
                                    );
                                }}>
                                <View
                                    style={[
                                        styles.previewImmersive,
                                        { backgroundColor: colors.card },
                                    ]}>
                                    <View
                                        style={[
                                            styles.previewImmersiveCover,
                                            { backgroundColor: colors.surface },
                                        ]}
                                    />
                                </View>
                                <ThemeText fontSize="description" style={styles.optionText}>
                                    {t("themeSettings.coverStyleSquareImmersive")}
                                </ThemeText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.optionItem,
                                    coverStyle === "circle" && {
                                        borderColor: colors.primary,
                                        borderWidth: 2,
                                    },
                                ]}
                                onPress={() => {
                                    Config.setConfig("theme.coverStyle", "circle");
                                    Config.setConfig(
                                        "theme.musicDetailCoverStyle",
                                        "classic",
                                    );
                                }}>
                                <View style={[styles.previewCircle, { backgroundColor: colors.card }]} />
                                <ThemeText fontSize="description" style={styles.optionText}>
                                    {t("themeSettings.coverStyleCircle")}
                                </ThemeText>
                            </TouchableOpacity>
                        </View>
                    </ListItem.Content>
                </ListItem>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingLeft: rpx(24),
        marginTop: rpx(36),
    },
    sectionWrapper: {
        marginTop: rpx(24),
    },
    optionsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
    },
    optionItem: {
        width: rpx(170),
        alignItems: "center",
        padding: rpx(12),
        borderRadius: rpx(12),
        borderWidth: 1,
        borderColor: "transparent",
    },
    previewSquare: {
        width: rpx(80),
        height: rpx(80),
        borderRadius: rpx(12),
    },
    previewCircle: {
        width: rpx(80),
        height: rpx(80),
        borderRadius: rpx(40),
    },
    previewImmersive: {
        width: rpx(80),
        height: rpx(80),
        borderRadius: rpx(12),
        overflow: "hidden",
    },
    previewImmersiveCover: {
        width: "100%",
        height: rpx(58),
    },
    optionText: {
        marginTop: rpx(12),
        textAlign: "center",
        width: "100%",
    },
});
