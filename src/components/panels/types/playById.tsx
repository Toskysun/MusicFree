import React, { useState } from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import rpx, { vmax } from "@/utils/rpx";
import { fontSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import ThemeText from "@/components/base/themeText";
import { TextInput } from "react-native-gesture-handler";
import PanelBase from "../base/panelBase";
import { hidePanel } from "../usePanel";
import PanelHeader from "../base/panelHeader";
import { useI18N } from "@/core/i18n";
import PluginManager from "@/core/pluginManager";
import NoPlugin from "@/components/base/noPlugin";
import Toast from "@/utils/toast";
import TrackPlayer from "@/core/trackPlayer";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import Plugin from "@/core/pluginManager/plugin";

export default function PlayById() {
    const { t } = useI18N();
    const colors = useColors();
    const navigate = useNavigate();

    const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
    const [musicId, setMusicId] = useState("");
    const [loading, setLoading] = useState(false);

    // Get all sorted plugins
    const allPlugins = PluginManager.getSortedPlugins();

    const handlePlay = async () => {
        if (!selectedPlugin) {
            Toast.warn(t("panel.playById.selectPluginFirst"));
            return;
        }
        if (!musicId.trim()) {
            Toast.warn(t("panel.playById.inputIdFirst"));
            return;
        }

        setLoading(true);
        try {
            const inputValue = musicId.trim();

            // Create music item with multiple possible ID fields
            // Different plugins use different fields:
            // - QQ音乐: songmid
            // - 网易云: id
            // - 酷狗: hash
            // - 咪咕: id, copyrightId
            const musicBase = {
                id: inputValue,
                songid: inputValue,
                songmid: inputValue,  // QQ音乐需要这个
                mid: inputValue,
                hash: inputValue,     // 酷狗需要这个
                copyrightId: inputValue,  // 咪咕可能需要
                platform: selectedPlugin.name,
            };

            let musicItem: IMusic.IMusicItem;

            // Try to get music info if plugin supports it
            if (selectedPlugin.methods.getMusicInfo) {
                const musicInfo = await selectedPlugin.methods.getMusicInfo(musicBase);
                if (musicInfo && (musicInfo.title || musicInfo.id)) {
                    musicItem = {
                        id: musicInfo.id || inputValue,
                        songid: musicInfo.songid || inputValue,
                        songmid: musicInfo.songmid || musicInfo.mid || inputValue,
                        mid: musicInfo.mid || inputValue,
                        hash: musicInfo.hash || inputValue,
                        platform: selectedPlugin.name,
                        title: musicInfo.title || inputValue,
                        artist: musicInfo.artist || t("panel.playById.unknownArtist"),
                        artwork: musicInfo.artwork,
                        album: musicInfo.album,
                        duration: musicInfo.duration,
                        ...musicInfo,
                    } as IMusic.IMusicItem;
                } else {
                    // Fall back to basic music item
                    musicItem = {
                        id: inputValue,
                        songid: inputValue,
                        songmid: inputValue,
                        mid: inputValue,
                        hash: inputValue,
                        platform: selectedPlugin.name,
                        title: inputValue,
                        artist: t("panel.playById.unknownArtist"),
                    } as IMusic.IMusicItem;
                }
            } else {
                // Plugin doesn't support getMusicInfo, use basic music item
                musicItem = {
                    id: inputValue,
                    songid: inputValue,
                    songmid: inputValue,
                    mid: inputValue,
                    hash: inputValue,
                    platform: selectedPlugin.name,
                    title: inputValue,
                    artist: t("panel.playById.unknownArtist"),
                } as IMusic.IMusicItem;
            }

            hidePanel();

            // Play the music
            await TrackPlayer.play(musicItem);

            // Navigate to music detail page
            navigate(ROUTE_PATH.MUSIC_DETAIL);

            Toast.success(t("panel.playById.playingNow"));
        } catch (error) {
            Toast.warn(t("panel.playById.fetchFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <PanelBase
            keyboardAvoidBehavior="height"
            height={vmax(45)}
            renderBody={() => (
                <>
                    <PanelHeader
                        title={t("panel.playById.title")}
                        onCancel={() => {
                            hidePanel();
                        }}
                        onOk={handlePlay}
                        loading={loading}
                    />

                    {allPlugins.length ? (
                        <>
                            {/* Plugin selection - wrap layout, max 4 per row */}
                            <View style={styles.pluginSection}>
                                <ThemeText
                                    fontSize="subTitle"
                                    fontColor="textSecondary"
                                    style={styles.sectionLabel}>
                                    {t("panel.playById.selectPlugin")}
                                </ThemeText>
                                <View style={styles.pluginGrid}>
                                    {allPlugins.map(plugin => {
                                        const isSelected = selectedPlugin?.hash === plugin.hash;
                                        return (
                                            <TouchableOpacity
                                                key={plugin.hash}
                                                style={[
                                                    styles.pluginChip,
                                                    {
                                                        backgroundColor: isSelected
                                                            ? colors.primary
                                                            : colors.placeholder,
                                                        borderColor: isSelected
                                                            ? colors.primary
                                                            : colors.divider,
                                                    },
                                                ]}
                                                onPress={() => setSelectedPlugin(plugin)}>
                                                <ThemeText
                                                    fontSize="subTitle"
                                                    numberOfLines={1}
                                                    style={{
                                                        color: isSelected
                                                            ? "#fff"
                                                            : colors.text,
                                                    }}>
                                                    {plugin.name}
                                                </ThemeText>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* ID input section */}
                            <View style={styles.inputSection}>
                                <TextInput
                                    value={musicId}
                                    accessible
                                    accessibilityLabel={t("panel.playById.inputLabel")}
                                    accessibilityHint={t("panel.playById.placeholder")}
                                    onChangeText={setMusicId}
                                    style={[
                                        styles.input,
                                        {
                                            color: colors.text,
                                            backgroundColor: colors.placeholder,
                                        },
                                    ]}
                                    placeholderTextColor={colors.textSecondary}
                                    placeholder={t("panel.playById.placeholder")}
                                    maxLength={200}
                                />
                                <View style={styles.hints}>
                                    <ThemeText
                                        style={styles.hintLine}
                                        fontSize="description"
                                        fontColor="textSecondary">
                                        {t("panel.playById.hint")}
                                    </ThemeText>
                                    {(selectedPlugin?.name === "QQ音乐" || selectedPlugin?.name?.startsWith("QQ音乐")) && (
                                        <ThemeText
                                            style={styles.hintLine}
                                            fontSize="description"
                                            fontColor="textSecondary">
                                            {t("panel.playById.qqHint")}
                                        </ThemeText>
                                    )}
                                </View>
                            </View>
                        </>
                    ) : (
                        <NoPlugin notSupportType={t("panel.playById.title")} />
                    )}
                </>
            )}
        />
    );
}

const styles = StyleSheet.create({
    pluginSection: {
        paddingHorizontal: rpx(24),
        marginTop: rpx(8),
    },
    sectionLabel: {
        marginBottom: rpx(12),
    },
    pluginGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: rpx(12),
    },
    pluginChip: {
        width: "23%",
        paddingVertical: rpx(12),
        borderRadius: rpx(20),
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    inputSection: {
        marginTop: rpx(24),
    },
    input: {
        marginHorizontal: rpx(24),
        borderRadius: rpx(12),
        fontSize: fontSizeConst.content,
        lineHeight: fontSizeConst.content * 1.5,
        padding: rpx(12),
    },
    hints: {
        paddingHorizontal: rpx(24),
        marginTop: rpx(16),
    },
    hintLine: {
        marginBottom: rpx(12),
    },
});
