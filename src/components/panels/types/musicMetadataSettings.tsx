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
    // 如果需要的话可以添加属性
}

export default function MusicMetadataSettings(_props: IMusicMetadataSettingsProps) {
    const colors = useColors();
    
    // 获取当前设置值
    const currentWriteMetadata = useAppConfig("basic.writeMetadata");
    const currentWriteMetadataCover = useAppConfig("basic.writeMetadataCover");
    const currentWriteMetadataLyric = useAppConfig("basic.writeMetadataLyric");
    const currentWriteMetadataExtended = useAppConfig("basic.writeMetadataExtended");

    // 本地状态管理
    const [settings, setSettings] = useState({
        writeMetadata: currentWriteMetadata ?? false,
        writeMetadataCover: currentWriteMetadataCover ?? true,
        writeMetadataLyric: currentWriteMetadataLyric ?? true,
        writeMetadataExtended: currentWriteMetadataExtended ?? false,
    });

    const handleSave = () => {
        // 保存所有设置到配置
        Config.setConfig("basic.writeMetadata", settings.writeMetadata);
        Config.setConfig("basic.writeMetadataCover", settings.writeMetadataCover);
        Config.setConfig("basic.writeMetadataLyric", settings.writeMetadataLyric);
        Config.setConfig("basic.writeMetadataExtended", settings.writeMetadataExtended);
        
        Toast.success("音乐标签设置已保存");
        hidePanel();
    };

    const handleReset = () => {
        // 重置为默认值
        setSettings({
            writeMetadata: false,
            writeMetadataCover: true,
            writeMetadataLyric: true,
            writeMetadataExtended: false,
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

    const renderSwitchItem = (title: string, description: string, value: boolean, onValueChange: (value: boolean) => void, isSubItem = false) => (
        <View key={title} style={[styles.itemContainer, isSubItem && styles.subItemContainer]}>
            <View style={styles.switchRow}>
                <View style={styles.textContainer}>
                    <ThemeText fontSize="content" fontWeight={isSubItem ? "normal" : "medium"}>
                        {title}
                    </ThemeText>
                    <ThemeText 
                        fontSize="description" 
                        fontColor="textSecondary"
                        style={styles.descriptionText}>
                        {description}
                    </ThemeText>
                </View>
                <ThemeSwitch value={value} onValueChange={onValueChange} />
            </View>
        </View>
    );

    return (
        <PanelBase
            keyboardAvoidBehavior="height"
            height={vmax(60)}
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
                        <View style={styles.description}>
                            <ThemeText 
                                fontSize="subTitle" 
                                fontColor="textSecondary"
                                style={styles.headerDescription}>
                                配置下载音乐时自动写入的标签信息，包括基础信息、封面图片、歌词内容等。
                            </ThemeText>
                        </View>

                        {/* 主开关 */}
                        {renderSwitchItem(
                            "下载时写入音乐标签", 
                            "启用后将自动为下载的音乐文件写入标签信息",
                            settings.writeMetadata,
                            createSwitchHandler('writeMetadata')
                        )}

                        {/* 子选项 - 仅在主开关开启时显示 */}
                        {settings.writeMetadata && (
                            <>
                                {renderSwitchItem(
                                    "写入封面", 
                                    "自动下载并嵌入专辑封面图片",
                                    settings.writeMetadataCover,
                                    createSwitchHandler('writeMetadataCover'),
                                    true
                                )}
                                {renderSwitchItem(
                                    "写入歌词", 
                                    "自动获取并写入LRC格式歌词",
                                    settings.writeMetadataLyric,
                                    createSwitchHandler('writeMetadataLyric'),
                                    true
                                )}
                                {renderSwitchItem(
                                    "获取扩展信息", 
                                    "写入更多详细标签信息（如作曲者、发行年份等）",
                                    settings.writeMetadataExtended,
                                    createSwitchHandler('writeMetadataExtended'),
                                    true
                                )}
                            </>
                        )}
                        
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
    description: {
        paddingHorizontal: rpx(24),
        paddingTop: rpx(20),
        paddingBottom: rpx(10),
    },
    headerDescription: {
        lineHeight: rpx(36),
    },
    itemContainer: {
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(12),
    },
    subItemContainer: {
        paddingLeft: rpx(44), // 子选项增加左边距
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    textContainer: {
        flex: 1,
        marginRight: rpx(16),
    },
    descriptionText: {
        marginTop: rpx(4),
        lineHeight: fontSizeConst.description * 1.4,
    },
    resetContainer: {
        marginTop: rpx(20),
        borderTopWidth: 1,
        borderTopColor: "#e0e0e0",
        paddingTop: rpx(20),
    },
    bottomPadding: {
        height: rpx(60),
    },
});