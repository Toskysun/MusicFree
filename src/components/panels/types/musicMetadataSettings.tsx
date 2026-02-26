import React, { useState } from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
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
import Checkbox from "@/components/base/checkbox";
import Toast from "@/utils/toast";

type LyricOrderItem = "original" | "translation" | "romanization";

const lyricOrderLabels: Record<LyricOrderItem, { label: string; desc: string }> = {
    original: { label: "原文歌词", desc: "歌曲原始语言的歌词" },
    translation: { label: "翻译歌词", desc: "歌词的中文翻译" },
    romanization: { label: "音译歌词", desc: "罗马音/拼音注音" },
};

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
    const currentDownloadLyricFile = useAppConfig("basic.downloadLyricFile");
    const currentLyricFileFormat = useAppConfig("basic.lyricFileFormat");
    const currentLyricOrder = useAppConfig("basic.lyricOrder");
    const currentEnableWordByWord = useAppConfig("basic.enableWordByWordLyric");

    // Local state management
    const [settings, setSettings] = useState({
        writeMetadata: currentWriteMetadata ?? false,
        writeMetadataCover: currentWriteMetadataCover ?? true,
        writeMetadataLyric: currentWriteMetadataLyric ?? true,
        writeMetadataExtended: currentWriteMetadataExtended ?? false,
        downloadLyricFile: currentDownloadLyricFile ?? false,
        lyricFileFormat: currentLyricFileFormat ?? "lrc" as "lrc" | "txt",
        lyricOrder: currentLyricOrder ?? ["romanization", "original", "translation"] as LyricOrderItem[],
        enableWordByWord: currentEnableWordByWord ?? false,
    });

    const handleSave = () => {
        Config.setConfig("basic.writeMetadata", settings.writeMetadata);
        Config.setConfig("basic.writeMetadataCover", settings.writeMetadataCover);
        Config.setConfig("basic.writeMetadataLyric", settings.writeMetadataLyric);
        Config.setConfig("basic.writeMetadataExtended", settings.writeMetadataExtended);
        Config.setConfig("basic.downloadLyricFile", settings.downloadLyricFile);
        Config.setConfig("basic.lyricFileFormat", settings.lyricFileFormat);
        Config.setConfig("basic.lyricOrder", settings.lyricOrder);
        Config.setConfig("basic.enableWordByWordLyric", settings.enableWordByWord);

        Toast.success("音乐标签设置已保存");
        hidePanel();
    };

    const handleReset = () => {
        setSettings({
            writeMetadata: false,
            writeMetadataCover: true,
            writeMetadataLyric: true,
            writeMetadataExtended: false,
            downloadLyricFile: false,
            lyricFileFormat: "lrc",
            lyricOrder: ["romanization", "original", "translation"],
            enableWordByWord: false,
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
                                fontWeight={level === 0 ? "semibold" : "regular"}
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

    // Lyric order toggle handler
    const toggleLyricOrderItem = (item: LyricOrderItem) => {
        setSettings(prev => {
            const currentOrder = prev.lyricOrder;
            if (currentOrder.includes(item)) {
                // Remove item (allow empty)
                return {
                    ...prev,
                    lyricOrder: currentOrder.filter(i => i !== item)
                };
            } else {
                // Add item to end
                return {
                    ...prev,
                    lyricOrder: [...currentOrder, item]
                };
            }
        });
    };

    // Move item up in order
    const moveLyricOrderUp = (item: LyricOrderItem) => {
        setSettings(prev => {
            const currentOrder = [...prev.lyricOrder];
            const index = currentOrder.indexOf(item);
            if (index > 0) {
                [currentOrder[index - 1], currentOrder[index]] = [currentOrder[index], currentOrder[index - 1]];
            }
            return { ...prev, lyricOrder: currentOrder };
        });
    };

    // Move item down in order
    const moveLyricOrderDown = (item: LyricOrderItem) => {
        setSettings(prev => {
            const currentOrder = [...prev.lyricOrder];
            const index = currentOrder.indexOf(item);
            if (index >= 0 && index < currentOrder.length - 1) {
                [currentOrder[index], currentOrder[index + 1]] = [currentOrder[index + 1], currentOrder[index]];
            }
            return { ...prev, lyricOrder: currentOrder };
        });
    };

    // Format type toggle handler
    const setLyricFileFormat = (format: "lrc" | "txt") => {
        setSettings(prev => ({
            ...prev,
            lyricFileFormat: format
        }));
    };

    // Render lyric order item with reorder buttons
    const renderLyricOrderItem = (item: LyricOrderItem) => {
        const isChecked = settings.lyricOrder.includes(item);
        const index = settings.lyricOrder.indexOf(item);
        const { label, desc } = lyricOrderLabels[item];

        return (
            <View key={item} style={styles.lyricOrderItemRow}>
                <TouchableOpacity
                    style={styles.lyricOrderItemLeft}
                    onPress={() => toggleLyricOrderItem(item)}
                    activeOpacity={0.7}
                >
                    <Checkbox
                        checked={isChecked}
                        onPress={() => toggleLyricOrderItem(item)}
                    />
                    <View style={styles.lyricOrderTextContainer}>
                        <ThemeText fontSize="content">{label}</ThemeText>
                        <ThemeText
                            fontSize="description"
                            fontColor="textSecondary"
                            style={styles.lyricOrderDescription}>
                            {desc}
                        </ThemeText>
                    </View>
                </TouchableOpacity>
                {isChecked && (
                    <View style={styles.reorderButtons}>
                        <TouchableOpacity
                            style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}
                            onPress={() => moveLyricOrderUp(item)}
                            disabled={index === 0}
                        >
                            <ThemeText fontSize="description" fontColor={index === 0 ? "textSecondary" : "text"}>▲</ThemeText>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.reorderButton, index === settings.lyricOrder.length - 1 && styles.reorderButtonDisabled]}
                            onPress={() => moveLyricOrderDown(item)}
                            disabled={index === settings.lyricOrder.length - 1}
                        >
                            <ThemeText fontSize="description" fontColor={index === settings.lyricOrder.length - 1 ? "textSecondary" : "text"}>▼</ThemeText>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    // Render format selector
    const renderFormatSelector = () => {
        return (
            <View style={styles.formatSelectorContainer}>
                <TouchableOpacity
                    style={[
                        styles.formatOption,
                        settings.lyricFileFormat === "lrc" && {
                            backgroundColor: colors.primary + '20',
                            borderColor: colors.primary,
                        }
                    ]}
                    onPress={() => setLyricFileFormat("lrc")}
                    activeOpacity={0.7}
                >
                    <ThemeText
                        fontSize="content"
                        fontColor={settings.lyricFileFormat === "lrc" ? "primary" : "text"}>
                        .lrc
                    </ThemeText>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.formatOption,
                        settings.lyricFileFormat === "txt" && {
                            backgroundColor: colors.primary + '20',
                            borderColor: colors.primary,
                        }
                    ]}
                    onPress={() => setLyricFileFormat("txt")}
                    activeOpacity={0.7}
                >
                    <ThemeText
                        fontSize="content"
                        fontColor={settings.lyricFileFormat === "txt" ? "primary" : "text"}>
                        .txt
                    </ThemeText>
                </TouchableOpacity>
            </View>
        );
    };

    // Check if lyric features are enabled
    const lyricFeaturesEnabled = (settings.writeMetadata && settings.writeMetadataLyric) || settings.downloadLyricFile;

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
                                        {renderDivider()}
                                        {renderSwitchItem(
                                            "写入歌词",
                                            "自动获取并嵌入歌词到音乐文件",
                                            settings.writeMetadataLyric,
                                            createSwitchHandler('writeMetadataLyric'),
                                            { icon: "🎵", level: 1 }
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {/* Lyric File Download Card */}
                        {renderCard(
                            renderSwitchItem(
                                "下载歌词文件",
                                "下载音乐时同时保存独立的歌词文件",
                                settings.downloadLyricFile,
                                createSwitchHandler('downloadLyricFile'),
                                { icon: "📄" }
                            )
                        )}

                        {/* Lyric Order Settings - Show when either lyric feature is enabled */}
                        {lyricFeaturesEnabled && (
                            renderCard(
                                <View style={styles.lyricOrderContainer}>
                                    <ThemeText
                                        fontSize="content"
                                        fontWeight="semibold"
                                        style={styles.lyricOrderTitle}>
                                        歌词内容设置
                                    </ThemeText>
                                    <ThemeText
                                        fontSize="description"
                                        fontColor="textSecondary"
                                        style={styles.lyricOrderSubtitle}>
                                        选择要包含的歌词类型，可调整顺序
                                    </ThemeText>

                                    {renderLyricOrderItem("original")}
                                    {renderLyricOrderItem("translation")}
                                    {renderLyricOrderItem("romanization")}

                                    {settings.lyricOrder.length > 0 && (
                                        <ThemeText
                                            fontSize="description"
                                            fontColor="textSecondary"
                                            style={styles.lyricOrderHint}>
                                            当前顺序：{settings.lyricOrder.map(i => lyricOrderLabels[i].label).join(" → ")}
                                        </ThemeText>
                                    )}

                                    {renderDivider()}
                                    <View style={styles.wordByWordSection}>
                                        {renderSwitchItem(
                                            "逐字歌词",
                                            "保留QRC格式的逐字时间戳（如有）",
                                            settings.enableWordByWord,
                                            createSwitchHandler('enableWordByWord'),
                                            { level: 1 }
                                        )}
                                    </View>

                                    {settings.downloadLyricFile && (
                                        <>
                                            {renderDivider()}
                                            <View style={styles.formatSection}>
                                                <ThemeText
                                                    fontSize="description"
                                                    fontColor="textSecondary"
                                                    style={styles.formatLabel}>
                                                    歌词文件格式
                                                </ThemeText>
                                                {renderFormatSelector()}
                                            </View>
                                        </>
                                    )}
                                </View>
                            )
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
    lyricOrderContainer: {
        paddingHorizontal: rpx(20),
        paddingVertical: rpx(16),
    },
    lyricOrderTitle: {
        marginBottom: rpx(4),
    },
    lyricOrderSubtitle: {
        marginBottom: rpx(12),
    },
    lyricOrderItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: rpx(10),
    },
    lyricOrderItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: rpx(12),
    },
    lyricOrderTextContainer: {
        flex: 1,
    },
    lyricOrderDescription: {
        marginTop: rpx(2),
    },
    reorderButtons: {
        flexDirection: 'row',
        gap: rpx(8),
    },
    reorderButton: {
        width: rpx(48),
        height: rpx(48),
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: rpx(8),
        backgroundColor: 'rgba(128,128,128,0.1)',
    },
    reorderButtonDisabled: {
        opacity: 0.3,
    },
    lyricOrderHint: {
        marginTop: rpx(12),
        fontStyle: 'italic',
    },
    wordByWordSection: {
        marginTop: rpx(8),
    },
    formatSection: {
        paddingTop: rpx(16),
    },
    formatLabel: {
        marginBottom: rpx(8),
    },
    formatSelectorContainer: {
        flexDirection: 'row',
        gap: rpx(16),
    },
    formatOption: {
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(12),
        borderRadius: rpx(8),
        borderWidth: 1,
        borderColor: '#ccc',
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
