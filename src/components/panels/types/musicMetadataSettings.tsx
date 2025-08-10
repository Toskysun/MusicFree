import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import rpx, { vmax } from "@/utils/rpx";
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

    return (
        <PanelBase
            height={vmax(75)}
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
                                style={styles.descriptionText}>
                                配置下载音乐时自动写入的标签信息，包括基础信息、封面图片、歌词内容等。
                            </ThemeText>
                        </View>

                        {/* 主开关 */}
                        <ListItem
                            withHorizontalPadding
                            heightType="medium">
                            <ListItem.Content 
                                title="下载时写入音乐标签"
                                description="启用后将自动为下载的音乐文件写入标签信息"
                            />
                            <ThemeSwitch 
                                value={settings.writeMetadata} 
                                onValueChange={createSwitchHandler('writeMetadata')} 
                            />
                        </ListItem>

                        {/* 子选项 - 仅在主开关开启时显示 */}
                        {settings.writeMetadata && (
                            <View style={styles.subOptionsContainer}>
                                <View style={styles.subOptionsDivider} />
                                
                                <ListItem
                                    withHorizontalPadding
                                    heightType="medium"
                                    style={styles.subOption}>
                                    <ListItem.Content 
                                        title="写入封面"
                                        description="自动下载并嵌入专辑封面图片"
                                    />
                                    <ThemeSwitch 
                                        value={settings.writeMetadataCover} 
                                        onValueChange={createSwitchHandler('writeMetadataCover')} 
                                    />
                                </ListItem>

                                <ListItem
                                    withHorizontalPadding
                                    heightType="medium"
                                    style={styles.subOption}>
                                    <ListItem.Content 
                                        title="写入歌词"
                                        description="自动获取并写入LRC格式歌词"
                                    />
                                    <ThemeSwitch 
                                        value={settings.writeMetadataLyric} 
                                        onValueChange={createSwitchHandler('writeMetadataLyric')} 
                                    />
                                </ListItem>

                                <ListItem
                                    withHorizontalPadding
                                    heightType="medium"
                                    style={styles.subOption}>
                                    <ListItem.Content 
                                        title="获取扩展信息"
                                        description="写入更多详细标签信息（如作曲者、发行年份等）"
                                    />
                                    <ThemeSwitch 
                                        value={settings.writeMetadataExtended} 
                                        onValueChange={createSwitchHandler('writeMetadataExtended')} 
                                    />
                                </ListItem>
                            </View>
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

                        <View style={styles.infoContainer}>
                            <ThemeText 
                                fontSize="description" 
                                fontColor="textSecondary"
                                style={styles.infoText}>
                                • 音乐标签包括歌曲名、艺术家、专辑名等基础信息{'\n'}
                                • 封面图片会自动下载并嵌入到音频文件中{'\n'}
                                • 歌词将以标准LRC格式写入音频文件{'\n'}
                                • 标签写入失败不会影响音乐下载过程
                            </ThemeText>
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
    descriptionText: {
        lineHeight: rpx(36),
    },
    subOptionsContainer: {
        backgroundColor: 'rgba(0,0,0,0.02)',
    },
    subOptionsDivider: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.06)',
        marginHorizontal: rpx(24),
    },
    subOption: {
        paddingLeft: rpx(48), // 增加左边距表示层级关系
    },
    resetContainer: {
        marginTop: rpx(30),
        paddingTop: rpx(20),
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.06)',
    },
    infoContainer: {
        paddingHorizontal: rpx(24),
        paddingTop: rpx(20),
        backgroundColor: 'rgba(0,0,0,0.02)',
        marginTop: rpx(20),
        borderRadius: rpx(12),
        marginHorizontal: rpx(24),
    },
    infoText: {
        lineHeight: rpx(32),
        paddingVertical: rpx(16),
    },
    bottomPadding: {
        height: rpx(100),
    },
});