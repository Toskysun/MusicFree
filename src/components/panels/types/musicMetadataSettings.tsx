import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import rpx, { vmax } from "@/utils/rpx";
import { fontSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import ThemeText from "@/components/base/themeText";
import PanelBase from "../base/panelBase";
import { hidePanel } from "../usePanel";
import PanelHeader from "../base/panelHeader";
import Config, { useAppConfig } from "@/core/appConfig";
import ListItem from "@/components/base/listItem";
import ThemeSwitch from "@/components/base/switch";
import Toast from "@/utils/toast";

interface IMusicMetadataSettingsProps {
    // Reserved for future props
}

export default function MusicMetadataSettings(_props: IMusicMetadataSettingsProps) {
    const colors = useColors();

    // Get current configuration values
    const currentWriteMetadata = useAppConfig("basic.writeMetadata");
    const currentWriteMetadataCover = useAppConfig("basic.writeMetadataCover");
    const currentWriteMetadataLyric = useAppConfig("basic.writeMetadataLyric");
    const currentWriteMetadataExtended = useAppConfig("basic.writeMetadataExtended");
    const currentWriteLyricOriginal = useAppConfig("basic.writeMetadataLyricOriginal");
    const currentWriteLyricTranslation = useAppConfig("basic.writeMetadataLyricTranslation");
    const currentWriteLyricRomanization = useAppConfig("basic.writeMetadataLyricRomanization");

    // Local state management
    const [settings, setSettings] = useState({
        writeMetadata: currentWriteMetadata ?? false,
        writeMetadataCover: currentWriteMetadataCover ?? true,
        writeMetadataLyric: currentWriteMetadataLyric ?? true,
        writeMetadataExtended: currentWriteMetadataExtended ?? false,
        writeLyricOriginal: currentWriteLyricOriginal ?? true,
        writeLyricTranslation: currentWriteLyricTranslation ?? true,
        writeLyricRomanization: currentWriteLyricRomanization ?? true,
    });

    const handleSave = () => {
        // Save all settings to configuration
        Config.setConfig("basic.writeMetadata", settings.writeMetadata);
        Config.setConfig("basic.writeMetadataCover", settings.writeMetadataCover);
        Config.setConfig("basic.writeMetadataLyric", settings.writeMetadataLyric);
        Config.setConfig("basic.writeMetadataExtended", settings.writeMetadataExtended);
        Config.setConfig("basic.writeMetadataLyricOriginal", settings.writeLyricOriginal);
        Config.setConfig("basic.writeMetadataLyricTranslation", settings.writeLyricTranslation);
        Config.setConfig("basic.writeMetadataLyricRomanization", settings.writeLyricRomanization);

        Toast.success("音乐标签设置已保存");
        hidePanel();
    };

    const handleReset = () => {
        // Reset to default values
        setSettings({
            writeMetadata: false,
            writeMetadataCover: true,
            writeMetadataLyric: true,
            writeMetadataExtended: false,
            writeLyricOriginal: true,
            writeLyricTranslation: true,
            writeLyricRomanization: true,
        });
        Toast.success("已重置为默认值");
    };

    const createSwitchHandler = (key: keyof typeof settings) => {
        return (value: boolean) => {
            setSettings(prev => ({
                ...prev,
                [key]: value
            }));
        };
    };

    const renderCard = (children: React.ReactNode, style?: any) => (
        <View style={[styles.card, {
            backgroundColor: colors.card,
            borderColor: colors.border,
        }, style]}>
            {children}
        </View>
    );

    const renderSwitchItem = (
        title: string,
        description: string,
        value: boolean,
        onValueChange: (value: boolean) => void,
        options?: {
            icon?: string;
            level?: number;
        }
    ) => {
        const level = options?.level ?? 0;

        return (
            <View
                key={title}
                style={[
                    styles.itemContainer,
                    level === 1 && styles.subItemContainer,
                    level === 2 && styles.subSubItemContainer,
                ]}
            >
                <View style={styles.switchRow}>
                    <View style={styles.textContainer}>
                        {options?.icon && (
                            <ThemeText
                                fontSize="content"
                                style={styles.itemIcon}>
                                {options.icon}
                            </ThemeText>
                        )}
                        <View style={styles.textContent}>
                            <ThemeText
                                fontSize="content"
                                fontWeight={level === 0 ? "semibold" : "normal"}
                                style={level > 0 && styles.subItemTitle}>
                                {title}
                            </ThemeText>
                            <ThemeText
                                fontSize="description"
                                fontColor="textSecondary"
                                style={styles.descriptionText}>
                                {description}
                            </ThemeText>
                        </View>
                    </View>
                    <ThemeSwitch value={value} onValueChange={onValueChange} />
                </View>
            </View>
        );
    };

    const renderDivider = () => (
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
    );

    return (
        <PanelBase
            keyboardAvoidBehavior="height"
            height={vmax(70)}
            renderBody={() => (
                <>
                    <PanelHeader
                        title="音乐标签设置"
                        onCancel={() => {
                            hidePanel();
                        }}
                        onOk={handleSave}
                    />
                    <ScrollView style={styles.scrollView}>
                        {/* Header Description */}
                        <View style={styles.headerSection}>
                            <ThemeText
                                fontSize="subTitle"
                                fontColor="textSecondary"
                                style={styles.headerDescription}>
                                为下载的音乐自动写入标签信息，让音乐文件更加完整和专业
                            </ThemeText>
                        </View>

                        {/* Main Switch Card */}
                        {renderCard(
                            renderSwitchItem(
                                "下载时写入音乐标签",
                                "启用后将自动为下载的音乐文件写入元数据",
                                settings.writeMetadata,
                                createSwitchHandler('writeMetadata'),
                                { icon: "🏷️" }
                            )
                        )}

                        {/* Detail Options - Only show when main switch is enabled */}
                        {settings.writeMetadata && (
                            <>
                                {/* Cover & Extended Info Card */}
                                {renderCard(
                                    <>
                                        {renderSwitchItem(
                                            "写入封面",
                                            "自动下载并嵌入高质量专辑封面图片",
                                            settings.writeMetadataCover,
                                            createSwitchHandler('writeMetadataCover'),
                                            { icon: "🖼️", level: 1 }
                                        )}
                                        {renderDivider()}
                                        {renderSwitchItem(
                                            "获取扩展信息",
                                            "写入更多详细标签（作曲者、发行年份、流派等）",
                                            settings.writeMetadataExtended,
                                            createSwitchHandler('writeMetadataExtended'),
                                            { icon: "📝", level: 1 }
                                        )}
                                    </>
                                )}

                                {/* Lyric Options Card */}
                                {renderCard(
                                    <>
                                        {renderSwitchItem(
                                            "写入歌词",
                                            "自动获取并嵌入 LRC 格式歌词文件",
                                            settings.writeMetadataLyric,
                                            createSwitchHandler('writeMetadataLyric'),
                                            { icon: "🎵", level: 1 }
                                        )}

                                        {/* Lyric Detail Options - Only show when lyric switch is enabled */}
                                        {settings.writeMetadataLyric && (
                                            <>
                                                {renderDivider()}
                                                <View style={styles.lyricOptionsContainer}>
                                                    <ThemeText
                                                        fontSize="description"
                                                        fontColor="textSecondary"
                                                        style={styles.lyricOptionsTitle}>
                                                        歌词内容选项
                                                    </ThemeText>

                                                    {renderSwitchItem(
                                                        "原文歌词",
                                                        "包含原始语言的歌词文本",
                                                        settings.writeLyricOriginal,
                                                        createSwitchHandler('writeLyricOriginal'),
                                                        { level: 2 }
                                                    )}

                                                    {renderSwitchItem(
                                                        "翻译歌词",
                                                        "包含歌词的中文翻译内容",
                                                        settings.writeLyricTranslation,
                                                        createSwitchHandler('writeLyricTranslation'),
                                                        { level: 2 }
                                                    )}

                                                    {renderSwitchItem(
                                                        "音译歌词（罗马音）",
                                                        "包含歌词的罗马音拼读内容",
                                                        settings.writeLyricRomanization,
                                                        createSwitchHandler('writeLyricRomanization'),
                                                        { level: 2 }
                                                    )}

                                                    <ThemeText
                                                        fontSize="description"
                                                        fontColor="textSecondary"
                                                        style={styles.lyricOptionsHint}>
                                                        适用于支持多行显示的播放器
                                                    </ThemeText>
                                                </View>
                                            </>
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {/* Reset Button */}
                        <View style={styles.resetContainer}>
                            <ListItem
                                withHorizontalPadding
                                heightType="small"
                                onPress={handleReset}>
                                <ListItem.Content
                                    title="重置为默认值"
                                    description="恢复所有设置为系统推荐配置"
                                />
                            </ListItem>
                        </View>

                        <View style={styles.bottomPadding} />
                    </ScrollView>
                </>
            )}
        />
    );
}

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    headerSection: {
        paddingHorizontal: rpx(24),
        paddingTop: rpx(20),
        paddingBottom: rpx(16),
    },
    headerDescription: {
        lineHeight: rpx(40),
    },
    card: {
        marginHorizontal: rpx(16),
        marginBottom: rpx(16),
        borderRadius: rpx(16),
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    itemContainer: {
        paddingHorizontal: rpx(20),
        paddingVertical: rpx(16),
    },
    subItemContainer: {
        paddingLeft: rpx(20),
        paddingRight: rpx(20),
    },
    subSubItemContainer: {
        paddingLeft: rpx(32),
        paddingRight: rpx(20),
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    textContainer: {
        flex: 1,
        marginRight: rpx(16),
        flexDirection: 'row',
        alignItems: 'center',
    },
    itemIcon: {
        marginRight: rpx(12),
        fontSize: rpx(40),
    },
    textContent: {
        flex: 1,
    },
    subItemTitle: {
        opacity: 0.9,
    },
    descriptionText: {
        marginTop: rpx(6),
        lineHeight: fontSizeConst.description * 1.5,
    },
    divider: {
        height: 1,
        marginHorizontal: rpx(20),
        opacity: 0.3,
    },
    lyricOptionsContainer: {
        paddingTop: rpx(8),
    },
    lyricOptionsTitle: {
        paddingHorizontal: rpx(32),
        paddingTop: rpx(8),
        paddingBottom: rpx(4),
        fontWeight: '600',
        textTransform: 'uppercase',
        fontSize: fontSizeConst.description * 0.9,
        letterSpacing: 0.5,
    },
    lyricOptionsHint: {
        paddingHorizontal: rpx(32),
        paddingTop: rpx(12),
        paddingBottom: rpx(4),
        fontStyle: 'italic',
        opacity: 0.7,
        lineHeight: fontSizeConst.description * 1.4,
    },
    resetContainer: {
        marginTop: rpx(8),
        marginBottom: rpx(16),
        borderTopWidth: 1,
        borderTopColor: "#e0e0e0",
        paddingTop: rpx(16),
    },
    bottomPadding: {
        height: rpx(80),
    },
});
