import React from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";
import ListItem from "@/components/base/listItem";
import ThemeSwitch from "@/components/base/switch";
import Config, { useAppConfig } from "@/core/appConfig";
import { useI18N } from "@/core/i18n";

export default function HomeDisplay() {
    const { t } = useI18N();
    const hideHomeHeroCard = useAppConfig("theme.hideHomeHeroCard") ?? false;
    const hideHomeOperations = useAppConfig("theme.hideHomeOperations") ?? false;

    return (
        <View>
            <ThemeText
                fontSize="subTitle"
                fontWeight="bold"
                style={styles.header}>
                {t("themeSettings.homeDisplay")}
            </ThemeText>
            <View style={styles.sectionWrapper}>
                <ListItem withHorizontalPadding>
                    <ListItem.Content>
                        <View style={styles.itemRow}>
                            <ThemeText>{t("themeSettings.hideHomeHeroCard")}</ThemeText>
                            <ThemeSwitch
                                value={hideHomeHeroCard}
                                onValueChange={value => {
                                    Config.setConfig("theme.hideHomeHeroCard", value);
                                }}
                            />
                        </View>
                    </ListItem.Content>
                </ListItem>
                <ListItem withHorizontalPadding>
                    <ListItem.Content>
                        <View style={styles.itemRow}>
                            <ThemeText>{t("themeSettings.hideHomeOperations")}</ThemeText>
                            <ThemeSwitch
                                value={hideHomeOperations}
                                onValueChange={value => {
                                    Config.setConfig("theme.hideHomeOperations", value);
                                }}
                            />
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
    itemRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
});
