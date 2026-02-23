import React, { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import rpx, { vmax } from "@/utils/rpx";
import { fontSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import ThemeText from "@/components/base/themeText";
import PanelBase from "../base/panelBase";
import { hidePanel } from "../usePanel";
import PanelHeader from "../base/panelHeader";
import { getQualityKeys, BUILTIN_QUALITY_KEYS, getQualityText, getQualityAbbr, builtinQualityAbbr, qualityText } from "@/utils/qualities";
import Config, { useAppConfig } from "@/core/appConfig";
import { useI18N } from "@/core/i18n";
import ListItem from "@/components/base/listItem";
import Icon from "@/components/base/icon";
import Toast from "@/utils/toast";
import { showDialog } from "@/components/dialogs/useDialog";

interface IQualityTranslationProps {
    defaultValue?: string;
    tips?: string;
}

export default function QualityTranslation(_props: IQualityTranslationProps) {
    const { getLanguage } = useI18N();
    const colors = useColors();
    const defaultQualityText = getQualityText(getLanguage().languageData);

    const savedTranslations = useAppConfig("basic.qualityTranslations");
    const savedAbbreviations = useAppConfig("basic.qualityAbbreviations");

    // 当前键列表
    const [keysList, setKeysList] = useState<string[]>(() => [...getQualityKeys()]);

    // 翻译映射
    const [translations, setTranslations] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        for (const key of getQualityKeys()) {
            initial[key] = savedTranslations?.[key] || defaultQualityText[key] || key.toUpperCase();
        }
        return initial;
    });

    // 缩写映射
    const [abbreviations, setAbbreviations] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        for (const key of getQualityKeys()) {
            initial[key] = savedAbbreviations?.[key] || getQualityAbbr(key);
        }
        return initial;
    });

    // 添加自定义键的内联输入状态
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [addKeyInput, setAddKeyInput] = useState("");

    const handleSave = () => {
        Config.setConfig("basic.qualityKeysList", keysList);
        Config.setConfig("basic.qualityTranslations", translations);
        Config.setConfig("basic.qualityAbbreviations", abbreviations);
        Toast.success("音质配置已保存");
        hidePanel();
    };

    const handleReset = () => {
        showDialog("SimpleDialog", {
            title: "恢复默认",
            content: "将恢复为内置的 12 个音质键，自定义键将被移除。确定？",
            onOk() {
                const builtinKeys = [...BUILTIN_QUALITY_KEYS];
                setKeysList(builtinKeys);
                const langData = getLanguage().languageData;
                const resetTranslations: Record<string, string> = {};
                const resetAbbreviations: Record<string, string> = {};
                for (const key of builtinKeys) {
                    // 直接用内置映射，绕过 Config
                    resetTranslations[key] =
                        (langData as any)[`quality.${key}`] ||
                        qualityText[key] ||
                        key.toUpperCase();
                    resetAbbreviations[key] =
                        builtinQualityAbbr[key] ||
                        key.slice(0, 2).toUpperCase();
                }
                setTranslations(resetTranslations);
                setAbbreviations(resetAbbreviations);
                Toast.success("已重置为默认值");
            },
        });
    };

    const handleDelete = useCallback((key: string) => {
        const isBuiltin = BUILTIN_QUALITY_KEYS.includes(key);
        const doDelete = () => {
            setKeysList(prev => prev.filter(k => k !== key));
            setTranslations(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            setAbbreviations(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            Toast.success(`已删除 ${key}`);
        };

        if (isBuiltin) {
            showDialog("SimpleDialog", {
                title: "删除内置音质",
                content: `"${key}" 是内置音质键，删除后可通过"恢复默认"找回。确定删除？`,
                onOk: doDelete,
            });
        } else {
            doDelete();
        }
    }, []);

    const handleAdd = useCallback(() => {
        setAddKeyInput("");
        setAddModalVisible(true);
    }, []);

    const handleAddConfirm = useCallback(() => {
        const key = addKeyInput.trim().toLowerCase();
        if (!key) {
            Toast.warn("键名不能为空");
            return;
        }
        if (!/^[a-z0-9_]+$/.test(key)) {
            Toast.warn("键名只能包含小写字母、数字和下划线");
            return;
        }
        if (keysList.includes(key)) {
            Toast.warn(`"${key}" 已存在`);
            return;
        }
        setKeysList(prev => [...prev, key]);
        setTranslations(prev => ({
            ...prev,
            [key]: key.toUpperCase(),
        }));
        setAbbreviations(prev => ({
            ...prev,
            [key]: key.slice(0, 2).toUpperCase(),
        }));
        setAddModalVisible(false);
        Toast.success(`已添加 ${key}`);
    }, [addKeyInput, keysList]);

    const handleMoveUp = useCallback((index: number) => {
        if (index <= 0) return;
        setKeysList(prev => {
            const next = [...prev];
            [next[index - 1], next[index]] = [next[index], next[index - 1]];
            return next;
        });
    }, []);

    const handleMoveDown = useCallback((index: number) => {
        setKeysList(prev => {
            if (index >= prev.length - 1) return prev;
            const next = [...prev];
            [next[index], next[index + 1]] = [next[index + 1], next[index]];
            return next;
        });
    }, []);

    return (
        <PanelBase
            keyboardAvoidBehavior="height"
            height={vmax(85)}
            renderBody={() => (
                <>
                    <PanelHeader
                        title="音质管理"
                        onCancel={() => {
                            hidePanel();
                        }}
                        onOk={handleSave}
                    />
                    <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
                        <View style={styles.description}>
                            <ThemeText
                                fontSize="subTitle"
                                fontColor="textSecondary"
                                style={styles.descriptionText}>
                                管理音质键列表：可增删、排序、编辑标签。保存后全局生效。
                            </ThemeText>
                        </View>

                        {keysList.map((qualityKey, index) => (
                            <View
                                key={qualityKey}
                                style={[
                                    styles.itemContainer,
                                    { borderBottomColor: colors.divider ?? "#e0e0e0" },
                                ]}>
                                <View style={styles.itemHeader}>
                                    <View style={styles.keyBadge}>
                                        <ThemeText
                                            fontSize="description"
                                            fontWeight="bold"
                                            style={styles.keyText}>
                                            {qualityKey}
                                        </ThemeText>
                                    </View>
                                    {BUILTIN_QUALITY_KEYS.includes(qualityKey) && (
                                        <ThemeText
                                            fontSize="description"
                                            fontColor="textSecondary"
                                            style={styles.builtinTag}>
                                            内置
                                        </ThemeText>
                                    )}
                                    <View style={styles.itemActions}>
                                        <Pressable
                                            onPress={() => handleMoveUp(index)}
                                            style={styles.actionBtn}
                                            hitSlop={8}>
                                            <ThemeText
                                                fontSize="content"
                                                fontColor={index > 0 ? "text" : "textSecondary"}>
                                                ▲
                                            </ThemeText>
                                        </Pressable>
                                        <Pressable
                                            onPress={() => handleMoveDown(index)}
                                            style={styles.actionBtn}
                                            hitSlop={8}>
                                            <ThemeText
                                                fontSize="content"
                                                fontColor={index < keysList.length - 1 ? "text" : "textSecondary"}>
                                                ▼
                                            </ThemeText>
                                        </Pressable>
                                        <Pressable
                                            onPress={() => handleDelete(qualityKey)}
                                            style={styles.actionBtn}
                                            hitSlop={8}>
                                            <Icon
                                                name="trash-outline"
                                                size={rpx(28)}
                                                color="#d64541"
                                            />
                                        </Pressable>
                                    </View>
                                </View>
                                <View style={styles.inputRow}>
                                    <View style={styles.inputGroup}>
                                        <ThemeText
                                            fontSize="description"
                                            fontColor="textSecondary"
                                            style={styles.inputLabel}>
                                            标签
                                        </ThemeText>
                                        <TextInput
                                            value={translations[qualityKey] ?? ""}
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
                                            placeholder={`显示标签`}
                                            maxLength={50}
                                        />
                                    </View>
                                    <View style={styles.abbrGroup}>
                                        <ThemeText
                                            fontSize="description"
                                            fontColor="textSecondary"
                                            style={styles.inputLabel}>
                                            缩写
                                        </ThemeText>
                                        <TextInput
                                            value={abbreviations[qualityKey] ?? ""}
                                            onChangeText={(text) => {
                                                setAbbreviations(prev => ({
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
                                            placeholder="缩写"
                                            maxLength={4}
                                        />
                                    </View>
                                </View>
                            </View>
                        ))}

                        <View style={styles.actionsContainer}>
                            <ListItem
                                withHorizontalPadding
                                heightType="small"
                                onPress={handleAdd}>
                                <ListItem.ListItemIcon
                                    position="left"
                                    icon="plus"
                                    color={colors.primary}
                                />
                                <ListItem.Content
                                    title="添加自定义音质"
                                    description="输入键名（如 dts、galaxy）"
                                />
                            </ListItem>
                            <ListItem
                                withHorizontalPadding
                                heightType="small"
                                onPress={handleReset}>
                                <ListItem.ListItemIcon
                                    position="left"
                                    icon="arrow-path"
                                    color={colors.textSecondary}
                                />
                                <ListItem.Content
                                    title="恢复默认"
                                    description="恢复为内置 12 个音质键"
                                />
                            </ListItem>
                        </View>

                        <View style={styles.bottomPadding} />
                    </ScrollView>
                    <Modal
                        visible={addModalVisible}
                        transparent
                        animationType="fade"
                        onRequestClose={() => setAddModalVisible(false)}>
                        <Pressable
                            style={styles.modalOverlay}
                            onPress={() => setAddModalVisible(false)}>
                            <Pressable
                                style={[
                                    styles.modalContent,
                                    { backgroundColor: colors.card ?? colors.background },
                                ]}
                                onPress={() => {}}>
                                <ThemeText
                                    fontSize="content"
                                    fontWeight="bold"
                                    style={styles.modalTitle}>
                                    添加自定义音质
                                </ThemeText>
                                <TextInput
                                    value={addKeyInput}
                                    onChangeText={setAddKeyInput}
                                    autoFocus
                                    style={[
                                        styles.input,
                                        {
                                            color: colors.text,
                                            backgroundColor: colors.placeholder,
                                        },
                                    ]}
                                    placeholderTextColor={colors.textSecondary}
                                    placeholder="输入键名（英文小写+数字，如 dts、galaxy）"
                                    maxLength={30}
                                    autoCapitalize="none"
                                    onSubmitEditing={handleAddConfirm}
                                />
                                <View style={styles.modalButtons}>
                                    <Pressable
                                        style={[styles.modalBtn, { borderColor: colors.textSecondary }]}
                                        onPress={() => setAddModalVisible(false)}>
                                        <ThemeText fontSize="content">取消</ThemeText>
                                    </Pressable>
                                    <Pressable
                                        style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
                                        onPress={handleAddConfirm}>
                                        <ThemeText fontSize="content" style={styles.modalBtnPrimaryText}>
                                            确定
                                        </ThemeText>
                                    </Pressable>
                                </View>
                            </Pressable>
                        </Pressable>
                    </Modal>
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
        paddingTop: rpx(16),
        paddingBottom: rpx(8),
    },
    descriptionText: {
        lineHeight: rpx(36),
    },
    itemContainer: {
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(12),
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    itemHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: rpx(8),
    },
    keyBadge: {
        paddingHorizontal: rpx(12),
        paddingVertical: rpx(4),
        borderRadius: rpx(8),
        backgroundColor: "rgba(100,100,100,0.15)",
    },
    keyText: {
        fontFamily: "monospace",
    },
    builtinTag: {
        marginLeft: rpx(10),
        fontSize: rpx(18),
    },
    itemActions: {
        flexDirection: "row",
        alignItems: "center",
        marginLeft: "auto",
        gap: rpx(12),
    },
    actionBtn: {
        padding: rpx(4),
    },
    input: {
        borderRadius: rpx(12),
        fontSize: fontSizeConst.content,
        lineHeight: fontSizeConst.content * 1.5,
        padding: rpx(12),
        paddingHorizontal: rpx(16),
    },
    inputRow: {
        flexDirection: "row",
        gap: rpx(12),
    },
    inputGroup: {
        flex: 1,
    },
    abbrGroup: {
        width: rpx(120),
    },
    inputLabel: {
        marginBottom: rpx(4),
    },
    actionsContainer: {
        marginTop: rpx(16),
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "#e0e0e0",
        paddingTop: rpx(8),
    },
    bottomPadding: {
        height: rpx(120),
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
    },
    modalContent: {
        width: "80%",
        borderRadius: rpx(20),
        padding: rpx(32),
    },
    modalTitle: {
        marginBottom: rpx(20),
        textAlign: "center",
    },
    modalButtons: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: rpx(16),
        marginTop: rpx(24),
    },
    modalBtn: {
        paddingHorizontal: rpx(28),
        paddingVertical: rpx(12),
        borderRadius: rpx(12),
        borderWidth: StyleSheet.hairlineWidth,
    },
    modalBtnPrimary: {
        borderWidth: 0,
    },
    modalBtnPrimaryText: {
        color: "#fff",
    },
});
