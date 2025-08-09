import React, { useState } from "react";
import { StyleSheet, View, TextInput } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import rpx, { vmax } from "@/utils/rpx";
import { fontSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import ThemeText from "@/components/base/themeText";
import PanelBase from "../base/panelBase";
import { hidePanel } from "../usePanel";
import PanelHeader from "../base/panelHeader";
import { qualityKeys } from "@/utils/qualities";
import Config, { useAppConfig } from "@/core/appConfig";
import { useI18N } from "@/core/i18n";
import { getQualityText } from "@/utils/qualities";
import ListItem from "@/components/base/listItem";
import Toast from "@/utils/toast";

interface IQualityTranslationProps {
    defaultValue?: string;
    tips?: string;
}

export default function QualityTranslation(_props: IQualityTranslationProps) {
    const { getLanguage } = useI18N();
    const colors = useColors();
    const defaultQualityText = getQualityText(getLanguage().languageData);
    
    // 获取已保存的自定义翻译
    const savedTranslations = useAppConfig("basic.qualityTranslations");
    
    // 初始化翻译状态
    const [translations, setTranslations] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        qualityKeys.forEach(key => {
            initial[key] = savedTranslations?.[key] || defaultQualityText[key];
        });
        return initial;
    });

    const handleSave = () => {
        // 保存到配置
        Config.setConfig("basic.qualityTranslations", translations);
        Toast.success("音质翻译已保存");
        hidePanel();
    };

    const handleReset = () => {
        // 重置为默认值
        const resetTranslations: Record<string, string> = {};
        qualityKeys.forEach(key => {
            resetTranslations[key] = defaultQualityText[key];
        });
        setTranslations(resetTranslations);
        Toast.success("已重置为默认值");
    };

    return (
        <PanelBase
            keyboardAvoidBehavior="height"
            height={vmax(80)}
            renderBody={() => (
                <>
                    <PanelHeader
                        title="音质标签"
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
                                在这里您可以自定义每个音质标签的显示文本，修改后将在应用中全局生效。
                            </ThemeText>
                        </View>
                        
                        {qualityKeys.map(qualityKey => (
                            <View key={qualityKey} style={styles.itemContainer}>
                                <View style={styles.labelContainer}>
                                    <ThemeText 
                                        fontSize="content" 
                                        fontWeight="bold"
                                        style={styles.label}>
                                        {qualityKey.toUpperCase()}
                                    </ThemeText>
                                    <ThemeText 
                                        fontSize="description" 
                                        fontColor="textSecondary">
                                        默认: {defaultQualityText[qualityKey]}
                                    </ThemeText>
                                </View>
                                <TextInput
                                    value={translations[qualityKey]}
                                    onChangeText={(text) => {
                                        setTranslations(prev => ({
                                            ...prev,
                                            [qualityKey]: text,
                                        }));
                                    }}
                                    style={[
                                        styles.input,
                                        {
                                            color: colors.text,
                                            backgroundColor: colors.placeholder,
                                        },
                                    ]}
                                    placeholderTextColor={colors.textSecondary}
                                    placeholder={`输入${qualityKey}的翻译`}
                                    maxLength={50}
                                />
                            </View>
                        ))}
                        
                        <View style={styles.resetContainer}>
                            <ListItem
                                withHorizontalPadding
                                heightType="small"
                                onPress={handleReset}>
                                <ListItem.Content 
                                    title="重置为默认值" 
                                    description="恢复所有音质标签为系统默认翻译"
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
    descriptionText: {
        lineHeight: rpx(36),
    },
    itemContainer: {
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(12),
    },
    labelContainer: {
        marginBottom: rpx(8),
    },
    label: {
        marginBottom: rpx(4),
    },
    input: {
        borderRadius: rpx(12),
        fontSize: fontSizeConst.content,
        lineHeight: fontSizeConst.content * 1.5,
        padding: rpx(12),
        paddingHorizontal: rpx(16),
    },
    resetContainer: {
        marginTop: rpx(20),
        borderTopWidth: 1,
        borderTopColor: "#e0e0e0",
        paddingTop: rpx(20),
    },
    bottomPadding: {
        height: rpx(100),
    },
});