import Divider from "@/components/base/divider";
import { IIconName } from "@/components/base/icon.tsx";
import ListItem from "@/components/base/listItem";
import PageBackground from "@/components/base/pageBackground";
import ThemeText from "@/components/base/themeText";
import { showDialog } from "@/components/dialogs/useDialog";
import { showPanel } from "@/components/panels/usePanel";
import { useI18N } from "@/core/i18n";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import TrackPlayer from "@/core/trackPlayer";
import { checkUpdateAndShowResult } from "@/hooks/useCheckUpdate.ts";
import rpx from "@/utils/rpx";
import { forceExitApp } from "@/utils/forceExitApp";
import { useScheduleCloseCountDown } from "@/utils/scheduleClose";
import timeformat from "@/utils/timeformat";
import { DrawerContentScrollView } from "@react-navigation/drawer";
import React, { memo } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import {
    default as DeviceInfo,
    default as deviceInfoModule,
} from "react-native-device-info";
import useColors from "@/hooks/useColors";

const ITEM_HEIGHT = rpx(108);

interface ISettingOptions {
    icon: IIconName;
    title: string;
    onPress?: () => void;
}

function HomeDrawer(props: any) {
    const navigate = useNavigate();
    const colors = useColors();
    function navigateToSetting(settingType: string) {
        navigate(ROUTE_PATH.SETTING, {
            type: settingType,
        });
    }

    const { t, getSupportedLanguages, getLanguage, setLanguage } = useI18N();

    const basicSetting: ISettingOptions[] = [
        {
            icon: "cog-8-tooth",
            title: t("sidebar.basicSettings"),
            onPress: () => {
                navigateToSetting("basic");
            },
        },
        {
            icon: "javascript",
            title: t("sidebar.pluginManagement"),
            onPress: () => {
                navigateToSetting("plugin");
            },
        },
        {
            icon: "t-shirt-outline",
            title: t("sidebar.themeSettings"),
            onPress: () => {
                navigateToSetting("theme");
            },
        },
    ];

    const otherSetting: ISettingOptions[] = [
        {
            icon: "circle-stack",
            title: t("sidebar.backupAndResume"),
            onPress: () => {
                navigateToSetting("backup");
            },
        },
    ];

    if (Platform.OS === "android") {
        otherSetting.push({
            icon: "shield-keyhole-outline",
            title: t("sidebar.permissionManagement"),
            onPress: () => {
                navigate(ROUTE_PATH.PERMISSIONS);
            },
        });
    }

    return (
        <>
            <PageBackground />
            <DrawerContentScrollView {...[props]} style={style.scrollWrapper}>
                <View style={style.header}>
                    <View>
                        <View
                            style={[
                                style.brandRule,
                                { backgroundColor: colors.accentWarm },
                            ]}
                        />
                        <ThemeText fontSize="section" fontWeight="bold">
                            {DeviceInfo.getApplicationName()}
                        </ThemeText>
                        <ThemeText
                            fontSize="caption"
                            fontColor="textSecondary"
                            style={style.brandCaption}>
                            LIBRARY / PLAYER
                        </ThemeText>
                    </View>
                    {/* <IconButton icon={'qrcode-scan'} size={rpx(36)} /> */}
                </View>
                <View
                    style={[
                        style.card,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                        },
                    ]}>
                    <ListItem withHorizontalPadding heightType="smallest">
                        <ListItem.ListItemText
                            fontSize="subTitle"
                            fontWeight="bold">
                            {t("common.setting")}
                        </ListItem.ListItemText>
                    </ListItem>
                    {basicSetting.map((item, index) => (
                        <ListItem
                            withHorizontalPadding
                            key={"basic-setting-" + index}
                            onPress={item.onPress}>
                            <ListItem.ListItemIcon
                                icon={item.icon}
                                width={rpx(48)}
                            />
                            <ListItem.Content title={item.title} />
                        </ListItem>
                    ))}
                </View>
                <View
                    style={[
                        style.card,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                        },
                    ]}>
                    <ListItem withHorizontalPadding heightType="smallest">
                        <ListItem.ListItemText
                            fontSize="subTitle"
                            fontWeight="bold">
                            {t("common.other")}
                        </ListItem.ListItemText>
                    </ListItem>
                    <CountDownItem />
                    {otherSetting.map((item, index) => (
                        <ListItem
                            withHorizontalPadding
                            key={"other-setting-" + index}
                            onPress={item.onPress}>
                            <ListItem.ListItemIcon
                                icon={item.icon}
                                width={rpx(48)}
                            />
                            <ListItem.Content title={item.title} />
                        </ListItem>
                    ))}
                    <ListItem
                        withHorizontalPadding
                        key="language"
                        onPress={() => {
                            showDialog("RadioDialog", {
                                content: getSupportedLanguages().map(item => ({
                                    title: item.name,
                                    value: item.locale,
                                    label: item.name,
                                })),
                                title: t("sidebar.languageSettings"),
                                onOk(value) {
                                    setLanguage(value as string);
                                },
                                defaultSelected: getLanguage().locale,
                            });
                        }}>
                        <ListItem.ListItemIcon
                            icon="language"
                            width={rpx(48)}
                        />
                        <ListItem.Content
                            title={t("sidebar.languageSettings")}
                        />
                        <ListItem.ListItemText
                            fontSize="subTitle"
                            position="right">
                            {getLanguage().name}
                        </ListItem.ListItemText>
                    </ListItem>
                </View>

                <View
                    style={[
                        style.card,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                        },
                    ]}>
                    <ListItem withHorizontalPadding heightType="smallest">
                        <ListItem.ListItemText
                            fontSize="subTitle"
                            fontWeight="bold">
                            {t("common.software")}
                        </ListItem.ListItemText>
                    </ListItem>

                    <ListItem
                        withHorizontalPadding
                        key={"update"}
                        onPress={() => {
                            checkUpdateAndShowResult(true);
                        }}>
                        <ListItem.ListItemIcon
                            icon={"arrow-path"}
                            width={rpx(48)}
                        />
                        <ListItem.Content title={t("sidebar.checkUpdate")} />
                        <ListItem.ListItemText
                            position="right"
                            fontSize="subTitle">
                            {`${t(
                                "sidebar.currentVersion",
                            )}${deviceInfoModule.getVersion()}`}
                        </ListItem.ListItemText>
                    </ListItem>
                    <ListItem
                        withHorizontalPadding
                        key={"about"}
                        onPress={() => {
                            navigateToSetting("about");
                        }}>
                        <ListItem.ListItemIcon
                            icon={"information-circle"}
                            width={rpx(48)}
                        />
                        <ListItem.Content
                            title={`${t(
                                "common.about",
                            )} ${deviceInfoModule.getApplicationName()}`}
                        />
                    </ListItem>
                </View>

                <View
                    style={[
                        style.card,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                        },
                    ]}>
                    <Divider />
                    <ListItem
                        withHorizontalPadding
                        onPress={() => {
                            // 仅安卓生效
                            BackHandler.exitApp();
                        }}>
                        <ListItem.ListItemIcon
                            icon={"home-outline"}
                            width={rpx(48)}
                        />
                        <ListItem.Content title={t("sidebar.backToDesktop")} />
                    </ListItem>
                    <ListItem
                        withHorizontalPadding
                        onPress={async () => {
                            try {
                                await TrackPlayer.reset();
                            } catch {
                                // ignore
                            }
                            forceExitApp();
                        }}>
                        <ListItem.ListItemIcon
                            icon={"power-outline"}
                            width={rpx(48)}
                        />
                        <ListItem.Content title={t("sidebar.exitApp")} />
                    </ListItem>
                </View>
            </DrawerContentScrollView>
        </>
    );
}

export default memo(HomeDrawer, () => true);

const style = StyleSheet.create({
    wrapper: {
        flex: 1,
        backgroundColor: "#999999",
    },
    scrollWrapper: {
        paddingTop: rpx(12),
    },

    header: {
        height: rpx(156),
        width: "100%",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: rpx(30),
    },
    card: {
        marginHorizontal: rpx(16),
        marginBottom: rpx(16),
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: rpx(24),
        overflow: "hidden",
    },
    cardContent: {
        paddingHorizontal: 0,
    },

    /** 倒计时 */
    countDownText: {
        height: ITEM_HEIGHT,
        textAlignVertical: "center",
    },
    brandRule: {
        width: rpx(32),
        height: rpx(5),
        borderRadius: rpx(3),
        marginBottom: rpx(12),
    },
    brandCaption: {
        marginTop: rpx(8),
        letterSpacing: rpx(2),
    },
});

function CountDownItemInner() {
    const countDown = useScheduleCloseCountDown();
    const { t } = useI18N();

    return (
        <ListItem
            withHorizontalPadding
            onPress={() => {
                showPanel("TimingClose");
            }}>
            <ListItem.ListItemIcon icon="alarm-outline" width={rpx(48)} />
            <ListItem.Content title={t("sidebar.scheduleClose")} />
            <ListItem.ListItemText position="right" fontSize="subTitle">
                {countDown ? timeformat(countDown) : ""}
            </ListItem.ListItemText>
        </ListItem>
    );
}

const CountDownItem = memo(CountDownItemInner, () => true);
