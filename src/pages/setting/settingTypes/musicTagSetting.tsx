import React from "react";
import { ScrollView, StyleSheet, View, Alert, Switch, TouchableOpacity } from "react-native";
import rpx from "@/utils/rpx";
import Config from "@/core/appConfig";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import ThemeText from "@/components/base/themeText";
import HorizontalRule from "@/components/base/divider";
import ListItem from "@/components/base/listItem";
import Toast from "@/utils/toast";
import useColors from "@/hooks/useColors";
import musicMetadataAPI from "@/api/musicMetadata";
import { Button } from "@/components/base/button";
import Chip from "@/components/base/chip";

// Extracted components to avoid nested component definitions
const EnableSwitch = ({ enabled, onValueChange, colors }: {
    enabled: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
}) => (
    <Switch
        value={enabled}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
    />
);

// Custom RadioButton component to replace react-native-paper RadioButton
const CustomRadioButton = ({ 
    value: _value, 
    status, 
    onPress, 
    color, 
}: {
    value: string;
    status: "checked" | "unchecked";
    onPress: () => void;
    color: string;
}) => (
    <TouchableOpacity onPress={onPress} style={styles.radioButton}>
        <View style={[
            styles.radioOuter, 
            { borderColor: color },
        ]}>
            {status === "checked" && (
                <View style={[
                    styles.radioInner, 
                    { backgroundColor: color },
                ]} />
            )}
        </View>
    </TouchableOpacity>
);

const PluginRadioButton = ({ tagSource, setTagSource, colors }: {
    tagSource: string;
    setTagSource: (source: "plugin" | "api") => void;
    colors: any;
}) => (
    <CustomRadioButton
        value="plugin"
        status={tagSource === "plugin" ? "checked" : "unchecked"}
        onPress={() => setTagSource("plugin")}
        color={colors.primary}
    />
);

const ApiRadioButton = ({ tagSource, setTagSource, colors }: {
    tagSource: string;
    setTagSource: (source: "plugin" | "api") => void;
    colors: any;
}) => (
    <CustomRadioButton
        value="api"
        status={tagSource === "api" ? "checked" : "unchecked"}
        onPress={() => setTagSource("api")}
        color={colors.primary}
    />
);

const WriteTagsSwitch = ({ value, onValueChange, colors }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
}) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
    />
);

const WriteLyricsSwitch = ({ value, onValueChange, colors }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
}) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
    />
);

const WriteCoverSwitch = ({ value, onValueChange, colors }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
}) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
    />
);

const BasicFieldsSwitch = ({ value, onValueChange, colors, disabled }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
    disabled: boolean;
}) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
        disabled={disabled}
    />
);

const ExtendedFieldsSwitch = ({ value, onValueChange, colors, disabled }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
    disabled: boolean;
}) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
        disabled={disabled}
    />
);

const TechnicalFieldsSwitch = ({ value, onValueChange, colors, disabled }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
    disabled: boolean;
}) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
        disabled={disabled}
    />
);

const QualityCheckmark = ({ isSelected, colors }: {
    isSelected: boolean;
    colors: any;
}) => isSelected ? <ThemeText style={{ color: colors.primary }}>✓</ThemeText> : null;

const PreferTranslatedSwitch = ({ value, onValueChange, colors }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
}) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
    />
);

const EmbedTimestampSwitch = ({ value, onValueChange, colors }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
}) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
    />
);

const OverwriteExistingSwitch = ({ value, onValueChange, colors }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
}) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
    />
);

const AutoRetrySwitch = ({ value, onValueChange, colors }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    colors: any;
}) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.textSecondary, true: colors.primary }}
    />
);

export default function MusicTagSetting() {
    const navigate = useNavigate();
    const colors = useColors();
    
    // 主开关
    const [enabled, setEnabled] = React.useState(Config.getConfig("musicTag.enabled") ?? true);
    
    // 标签来源选择（plugin: 插件源, api: API源）
    const [tagSource, setTagSource] = React.useState<"plugin" | "api">(
        Config.getConfig("musicTag.source") ?? "plugin"
    );
    
    // 独立的写入开关
    const [writeOptions, setWriteOptions] = React.useState({
        tags: Config.getConfig("musicTag.write.tags") ?? true,        // 写入标签
        lyrics: Config.getConfig("musicTag.write.lyrics") ?? true,    // 写入歌词
        cover: Config.getConfig("musicTag.write.cover") ?? true,      // 写入封面
    });
    
    // API源音乐平台选择
    const [apiSources, setApiSources] = React.useState<string[]>(
        Config.getConfig("musicTag.apiSources") ?? ["netease", "qqmusic", "kugou", "kuwo"]
    );
    
    // 平台映射配置
    const [platformMapping, setPlatformMapping] = React.useState({
        autoMap: Config.getConfig("musicTag.platformMapping.autoMap") ?? true,
        // 手动映射规则（插件平台 -> API平台）
        mapping: Config.getConfig("musicTag.platformMapping.mapping") ?? {
            "qq": "qqmusic",     // QQ音乐
            "wy": "netease",     // 网易云
            "kg": "kugou",       // 酷狗
            "kw": "kuwo",        // 酷我
            "mg": "migu",        // 咪咕
        },
    });
    
    // 字段配置
    const [fields, setFields] = React.useState({
        basic: Config.getConfig("musicTag.fields.basic") ?? true,           // 基础信息(标题/艺术家/专辑)
        extended: Config.getConfig("musicTag.fields.extended") ?? true,     // 扩展信息(年份/流派等)
        technical: Config.getConfig("musicTag.fields.technical") ?? false,  // 技术信息(编码器/比特率等)
    });
    
    // 封面设置
    const [coverQuality, setCoverQuality] = React.useState(
        Config.getConfig("musicTag.coverQuality") ?? "high" // high, medium, low
    );
    
    // 歌词设置
    const [lyricOptions, setLyricOptions] = React.useState({
        preferTranslated: Config.getConfig("musicTag.lyric.preferTranslated") ?? false,
        embedTimestamp: Config.getConfig("musicTag.lyric.embedTimestamp") ?? true,
    });
    
    // 高级选项
    const [advanced, setAdvanced] = React.useState({
        overwriteExisting: Config.getConfig("musicTag.advanced.overwriteExisting") ?? true,
        autoRetry: Config.getConfig("musicTag.advanced.autoRetry") ?? true,
        retryCount: Config.getConfig("musicTag.advanced.retryCount") ?? 3,
        timeout: Config.getConfig("musicTag.advanced.timeout") ?? 10000,
    });

    const apiSourceOptions = [
        { key: "netease", label: "网易云音乐", desc: "歌词质量好，元数据准确" },
        { key: "qqmusic", label: "QQ音乐", desc: "封面质量高，版权曲目多" },
        { key: "kugou", label: "酷狗音乐", desc: "曲库丰富，KRC歌词" },
        { key: "kuwo", label: "酷我音乐", desc: "无损音质信息" },
        { key: "migu", label: "咪咕音乐", desc: "正版音源多" },
    ];

    const platformMappingDisplay = [
        { plugin: "qq", api: "QQ音乐", desc: "QQ音乐插件 → QQ音乐API" },
        { plugin: "wy", api: "网易云", desc: "网易云插件 → 网易云API" },
        { plugin: "kg", api: "酷狗", desc: "酷狗插件 → 酷狗API" },
        { plugin: "kw", api: "酷我", desc: "酷我插件 → 酷我API" },
        { plugin: "mg", api: "咪咕", desc: "咪咕插件 → 咪咕API" },
    ];

    const handleSave = () => {
        // 保存所有配置
        Config.setConfig("musicTag.enabled", enabled);
        Config.setConfig("musicTag.source", tagSource);
        Config.setConfig("musicTag.write.tags", writeOptions.tags);
        Config.setConfig("musicTag.write.lyrics", writeOptions.lyrics);
        Config.setConfig("musicTag.write.cover", writeOptions.cover);
        Config.setConfig("musicTag.apiSources", apiSources);
        Config.setConfig("musicTag.platformMapping.autoMap", platformMapping.autoMap);
        Config.setConfig("musicTag.platformMapping.mapping", platformMapping.mapping);
        Config.setConfig("musicTag.fields.basic", fields.basic);
        Config.setConfig("musicTag.fields.extended", fields.extended);
        Config.setConfig("musicTag.fields.technical", fields.technical);
        Config.setConfig("musicTag.coverQuality", coverQuality);
        Config.setConfig("musicTag.lyric.preferTranslated", lyricOptions.preferTranslated);
        Config.setConfig("musicTag.lyric.embedTimestamp", lyricOptions.embedTimestamp);
        Config.setConfig("musicTag.advanced.overwriteExisting", advanced.overwriteExisting);
        Config.setConfig("musicTag.advanced.autoRetry", advanced.autoRetry);
        Config.setConfig("musicTag.advanced.retryCount", advanced.retryCount);
        Config.setConfig("musicTag.advanced.timeout", advanced.timeout);
        
        Toast.success("音乐标签设置已保存");
        navigate(ROUTE_PATH.SETTING);
    };

    const toggleApiSource = (sourceKey: string) => {
        if (apiSources.includes(sourceKey)) {
            if (apiSources.length > 1) { // 至少保留一个源
                setApiSources(apiSources.filter(s => s !== sourceKey));
            } else {
                Toast.warn("至少需要选择一个音乐源");
            }
        } else {
            setApiSources([...apiSources, sourceKey]);
        }
    };

    const handleTestMetadata = async () => {
        Alert.prompt(
            "测试元数据获取",
            `当前使用${tagSource === "plugin" ? "插件源" : "API源"}，输入歌曲名和歌手（用空格分隔）`,
            async (text) => {
                if (!text) return;
                
                try {
                    Toast.success("正在搜索元数据...");
                    const [title, artist] = text.split(" ");
                    
                    if (tagSource === "api") {
                        const result = await musicMetadataAPI.searchBestMatch(title, artist);
                        
                        if (result) {
                            Alert.alert(
                                "获取成功（API源）",
                                `标题: ${result.title || "无"}\n` +
                                `艺术家: ${result.artist || "无"}\n` +
                                `专辑: ${result.album || "无"}\n` +
                                `年份: ${result.year || "无"}\n` +
                                `有歌词: ${result.lyrics ? "是" : "否"}\n` +
                                `有封面: ${result.albumArt ? "是" : "否"}`
                            );
                        } else {
                            Alert.alert("未找到", "没有找到匹配的元数据");
                        }
                    } else {
                        Alert.alert("提示", "插件源将使用歌曲原有信息，下载时自动处理");
                    }
                } catch (error) {
                    Alert.alert("错误", "获取失败: " + error.message);
                }
            }
        );
    };

    // Handler functions for write options
    const handleTagsToggle = (value: boolean) => {
        setWriteOptions({ ...writeOptions, tags: value });
    };

    const handleLyricsToggle = (value: boolean) => {
        setWriteOptions({ ...writeOptions, lyrics: value });
    };

    const handleCoverToggle = (value: boolean) => {
        setWriteOptions({ ...writeOptions, cover: value });
    };

    // Handler functions for fields
    const handleBasicFieldsToggle = (value: boolean) => {
        setFields({ ...fields, basic: value });
    };

    const handleExtendedFieldsToggle = (value: boolean) => {
        setFields({ ...fields, extended: value });
    };

    const handleTechnicalFieldsToggle = (value: boolean) => {
        setFields({ ...fields, technical: value });
    };

    // Handler functions for lyric options
    const handlePreferTranslatedToggle = (value: boolean) => {
        setLyricOptions({ ...lyricOptions, preferTranslated: value });
    };

    const handleEmbedTimestampToggle = (value: boolean) => {
        setLyricOptions({ ...lyricOptions, embedTimestamp: value });
    };

    // Handler functions for advanced options
    const handleOverwriteExistingToggle = (value: boolean) => {
        setAdvanced({ ...advanced, overwriteExisting: value });
    };

    const handleAutoRetryToggle = (value: boolean) => {
        setAdvanced({ ...advanced, autoRetry: value });
    };

    return (
        <ScrollView style={styles.container}>
            {/* 主开关 */}
            <View style={styles.section}>
                <ListItem
                    title="启用音乐标签内嵌"
                    desc="下载时自动获取并内嵌音乐元数据"
                    right={<EnableSwitch enabled={enabled} onValueChange={setEnabled} colors={colors} />}
                />
            </View>
            
            {enabled && (
                <>
                    <HorizontalRule />
                    
                    {/* 标签来源选择 */}
                    <View style={styles.section}>
                        <ThemeText fontSize="title" style={styles.sectionTitle}>
                            标签来源
                        </ThemeText>
                        <ThemeText style={styles.desc}>
                            选择元数据的获取方式
                        </ThemeText>
                        
                        <View style={styles.radioGroup}>
                            <ListItem
                                title="插件源"
                                desc="使用MusicFree插件提供的原始信息"
                                onPress={() => setTagSource("plugin")}
                                right={<PluginRadioButton tagSource={tagSource} setTagSource={setTagSource} colors={colors} />}
                            />
                            
                            <ListItem
                                title="API源"
                                desc="从音乐平台API获取更准确的元数据"
                                onPress={() => setTagSource("api")}
                                right={<ApiRadioButton tagSource={tagSource} setTagSource={setTagSource} colors={colors} />}
                            />
                        </View>
                        
                        {tagSource === "plugin" && (
                            <View style={styles.infoBox}>
                                <ThemeText style={styles.infoText}>
                                    📌 使用插件提供的信息，保持原始数据不变
                                </ThemeText>
                            </View>
                        )}
                        
                        {tagSource === "api" && (
                            <View style={styles.infoBox}>
                                <ThemeText style={styles.infoText}>
                                    📌 自动匹配并获取更准确的元数据、歌词和高清封面
                                </ThemeText>
                            </View>
                        )}
                    </View>
                    
                    <HorizontalRule />
                    
                    {/* 独立写入开关 */}
                    <View style={styles.section}>
                        <ThemeText fontSize="title" style={styles.sectionTitle}>
                            写入控制
                        </ThemeText>
                        <ThemeText style={styles.desc}>
                            选择要写入文件的内容
                        </ThemeText>
                        
                        <ListItem
                            title="写入标签"
                            desc="标题、艺术家、专辑、年份等基本信息"
                            right={<WriteTagsSwitch value={writeOptions.tags} onValueChange={handleTagsToggle} colors={colors} />}
                        />
                        
                        <ListItem
                            title="写入歌词"
                            desc="LRC格式歌词文本"
                            right={<WriteLyricsSwitch value={writeOptions.lyrics} onValueChange={handleLyricsToggle} colors={colors} />}
                        />
                        
                        <ListItem
                            title="写入封面"
                            desc="专辑封面图片"
                            right={<WriteCoverSwitch value={writeOptions.cover} onValueChange={handleCoverToggle} colors={colors} />}
                        />
                    </View>
                    
                    {/* API源设置 - 仅在选择API源时显示 */}
                    {tagSource === "api" && (
                        <>
                            <HorizontalRule />
                            <View style={styles.section}>
                                <ThemeText fontSize="title" style={styles.sectionTitle}>
                                    API数据源
                                </ThemeText>
                                <ThemeText style={styles.desc}>
                                    选择要使用的音乐平台API（按优先级顺序）
                                </ThemeText>
                                
                                <View style={styles.sourceOrder}>
                                    <ThemeText style={styles.orderLabel}>
                                        已选择的数据源：
                                    </ThemeText>
                                    <View style={styles.chips}>
                                        {apiSources.map(sourceKey => {
                                            const sourceInfo = apiSourceOptions.find(s => s.key === sourceKey);
                                            return sourceInfo ? (
                                                <Chip
                                                    key={sourceKey}
                                                    containerStyle={styles.chip}
                                                    onPress={() => toggleApiSource(sourceKey)}
                                                    onClose={() => toggleApiSource(sourceKey)}
                                                >
                                                    {sourceInfo.label}
                                                </Chip>
                                            ) : null;
                                        })}
                                    </View>
                                </View>
                                
                                <View>
                                    <ThemeText style={styles.desc}>
                                        点击添加或移除数据源：
                                    </ThemeText>
                                    {apiSourceOptions.map(source => (
                                        <ListItem
                                            key={source.key}
                                            title={source.label}
                                            desc={source.desc}
                                            onPress={() => toggleApiSource(source.key)}
                                            right={apiSources.includes(source.key) ? 
                                                <ThemeText style={{ color: colors.primary }}>✓</ThemeText> : 
                                                null
                                            }
                                        />
                                    ))}
                                </View>
                            </View>
                            
                            {/* 平台映射 */}
                            <HorizontalRule />
                            <View style={styles.section}>
                                <ThemeText fontSize="title" style={styles.sectionTitle}>
                                    平台智能映射
                                </ThemeText>
                                <ThemeText style={styles.desc}>
                                    根据歌曲来源自动选择对应的API平台
                                </ThemeText>
                                
                                <ListItem
                                    title="启用自动映射"
                                    desc="根据歌曲来源插件自动选择最匹配的API"
                                    right={
                                        <Switch
                                            value={platformMapping.autoMap}
                                            onValueChange={(v) => setPlatformMapping({ ...platformMapping, autoMap: v })}
                                            trackColor={{ false: colors.textSecondary, true: colors.primary }}
                                        />
                                    }
                                />
                                
                                {platformMapping.autoMap && (
                                    <View style={styles.mappingInfo}>
                                        <ThemeText style={styles.mappingTitle}>
                                            当前映射关系：
                                        </ThemeText>
                                        {platformMappingDisplay.map(mapping => (
                                            <View key={mapping.plugin} style={styles.mappingItem}>
                                                <ThemeText style={styles.mappingText}>
                                                    {mapping.desc}
                                                </ThemeText>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </>
                    )}
                    
                    {/* 字段选择 - 仅在启用标签写入时显示 */}
                    {writeOptions.tags && (
                        <>
                            <HorizontalRule />
                            <View style={styles.section}>
                                <ThemeText fontSize="title" style={styles.sectionTitle}>
                                    标签字段
                                </ThemeText>
                                <ThemeText style={styles.desc}>
                                    选择要写入的标签字段
                                </ThemeText>
                                
                                <ListItem
                                    title="基础信息"
                                    desc="标题、艺术家、专辑名称"
                                    right={<BasicFieldsSwitch value={fields.basic} onValueChange={handleBasicFieldsToggle} colors={colors} disabled={!writeOptions.tags} />}
                                />
                                
                                <ListItem
                                    title="扩展信息"
                                    desc="发行年份、流派、专辑艺术家"
                                    right={<ExtendedFieldsSwitch value={fields.extended} onValueChange={handleExtendedFieldsToggle} colors={colors} disabled={!writeOptions.tags} />}
                                />
                                
                                <ListItem
                                    title="技术信息"
                                    desc="编码器、下载时间、来源平台"
                                    right={<TechnicalFieldsSwitch value={fields.technical} onValueChange={handleTechnicalFieldsToggle} colors={colors} disabled={!writeOptions.tags} />}
                                />
                            </View>
                        </>
                    )}
                    
                    {/* 封面设置 */}
                    {writeOptions.cover && (
                        <>
                            <HorizontalRule />
                            <View style={styles.section}>
                                <ThemeText fontSize="title" style={styles.sectionTitle}>
                                    封面设置
                                </ThemeText>
                                
                                <View style={styles.qualityOptions}>
                                    {["high", "medium", "low"].map(quality => (
                                        <ListItem
                                            key={quality}
                                            title={
                                                quality === "high" ? "高质量 (800x800)" :
                                                    quality === "medium" ? "中等质量 (500x500)" :
                                                        "低质量 (300x300)"
                                            }
                                            desc={
                                                quality === "high" ? "文件较大，画质最佳" :
                                                    quality === "medium" ? "平衡画质和大小" :
                                                        "节省空间"
                                            }
                                            onPress={() => setCoverQuality(quality)}
                                            right={<QualityCheckmark isSelected={coverQuality === quality} colors={colors} />}
                                        />
                                    ))}
                                </View>
                            </View>
                        </>
                    )}
                    
                    {/* 歌词设置 */}
                    {writeOptions.lyrics && (
                        <>
                            <HorizontalRule />
                            <View style={styles.section}>
                                <ThemeText fontSize="title" style={styles.sectionTitle}>
                                    歌词设置
                                </ThemeText>
                                
                                <ListItem
                                    title="优先翻译歌词"
                                    desc="如果有翻译版本，优先使用"
                                    right={<PreferTranslatedSwitch value={lyricOptions.preferTranslated} onValueChange={handlePreferTranslatedToggle} colors={colors} />}
                                />
                                
                                <ListItem
                                    title="保留时间戳"
                                    desc="保留LRC格式的时间标记"
                                    right={<EmbedTimestampSwitch value={lyricOptions.embedTimestamp} onValueChange={handleEmbedTimestampToggle} colors={colors} />}
                                />
                            </View>
                        </>
                    )}
                    
                    <HorizontalRule />
                    
                    {/* 高级选项 */}
                    <View style={styles.section}>
                        <ThemeText fontSize="title" style={styles.sectionTitle}>
                            高级选项
                        </ThemeText>
                        
                        <ListItem
                            title="覆盖已有标签"
                            desc="用新获取的数据覆盖文件中已有的标签"
                            right={<OverwriteExistingSwitch value={advanced.overwriteExisting} onValueChange={handleOverwriteExistingToggle} colors={colors} />}
                        />
                        
                        {tagSource === "api" && (
                            <>
                                <ListItem
                                    title="自动重试"
                                    desc="获取失败时自动尝试其他数据源"
                                    right={<AutoRetrySwitch value={advanced.autoRetry} onValueChange={handleAutoRetryToggle} colors={colors} />}
                                />
                                
                                {advanced.autoRetry && (
                                    <ListItem
                                        title="重试次数"
                                        desc={`最多重试 ${advanced.retryCount} 次`}
                                        onPress={() => {
                                            Alert.prompt(
                                                "设置重试次数",
                                                "输入1-5之间的数字",
                                                (text) => {
                                                    const num = parseInt(text, 10);
                                                    if (num >= 1 && num <= 5) {
                                                        setAdvanced({ ...advanced, retryCount: num });
                                                    }
                                                },
                                                "plain-text",
                                                String(advanced.retryCount)
                                            );
                                        }}
                                    />
                                )}
                                
                                <ListItem
                                    title="超时时间"
                                    desc={`${advanced.timeout / 1000} 秒`}
                                    onPress={() => {
                                        Alert.prompt(
                                            "设置超时时间（秒）",
                                            "输入5-30之间的数字",
                                            (text) => {
                                                const num = parseInt(text, 10);
                                                if (num >= 5 && num <= 30) {
                                                    setAdvanced({ ...advanced, timeout: num * 1000 });
                                                }
                                            },
                                            "plain-text",
                                            String(advanced.timeout / 1000)
                                        );
                                    }}
                                />
                            </>
                        )}
                    </View>
                    
                    <HorizontalRule />
                    
                    {/* 测试功能 */}
                    <View style={styles.section}>
                        <ThemeText fontSize="title" style={styles.sectionTitle}>
                            测试功能
                        </ThemeText>
                        
                        <Button
                            type="normal"
                            text="测试元数据获取"
                            onPress={handleTestMetadata}
                            style={styles.testButton}
                        />
                    </View>
                </>
            )}
            
            {/* 说明 */}
            <View style={styles.section}>
                <ThemeText fontSize="subTitle" style={styles.helpTitle}>
                    说明
                </ThemeText>
                <ThemeText style={styles.helpText}>
                    • 插件源：使用MusicFree插件提供的原始信息
                </ThemeText>
                <ThemeText style={styles.helpText}>
                    • API源：从音乐平台API获取更准确的元数据
                </ThemeText>
                <ThemeText style={styles.helpText}>
                    • 平台自动映射：根据歌曲来源自动选择对应的API
                </ThemeText>
                <ThemeText style={styles.helpText}>
                    • 支持独立控制标签、歌词、封面的写入
                </ThemeText>
                <ThemeText style={styles.helpText}>
                    • 支持MP3、M4A、FLAC等常见音频格式
                </ThemeText>
            </View>
            
            {/* 保存按钮 */}
            <View style={styles.buttonContainer}>
                <Button
                    type="primary"
                    text="保存设置"
                    onPress={handleSave}
                    style={styles.saveButton}
                />
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: rpx(24),
    },
    section: {
        marginBottom: rpx(24),
    },
    sectionTitle: {
        marginBottom: rpx(12),
        fontWeight: "bold",
    },
    desc: {
        fontSize: rpx(24),
        opacity: 0.7,
        marginBottom: rpx(12),
    },
    radioGroup: {
        marginTop: rpx(8),
    },
    radioButton: {
        padding: rpx(8),
    },
    radioOuter: {
        width: rpx(40),
        height: rpx(40),
        borderRadius: rpx(20),
        borderWidth: rpx(4),
        alignItems: "center",
        justifyContent: "center",
    },
    radioInner: {
        width: rpx(20),
        height: rpx(20),
        borderRadius: rpx(10),
    },
    infoBox: {
        marginTop: rpx(12),
        padding: rpx(12),
        borderRadius: rpx(8),
        backgroundColor: "rgba(128,128,128,0.1)",
    },
    infoText: {
        fontSize: rpx(24),
        lineHeight: rpx(32),
    },
    sourceOrder: {
        marginTop: rpx(16),
        padding: rpx(12),
        borderRadius: rpx(8),
        backgroundColor: "rgba(128,128,128,0.1)",
    },
    orderLabel: {
        fontSize: rpx(24),
        marginBottom: rpx(8),
        opacity: 0.7,
    },
    chips: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: rpx(8),
    },
    chip: {
        height: rpx(56),
        marginRight: rpx(8),
        marginBottom: rpx(8),
    },
    mappingInfo: {
        marginTop: rpx(12),
        padding: rpx(12),
        borderRadius: rpx(8),
        backgroundColor: "rgba(128,128,128,0.05)",
    },
    mappingTitle: {
        fontSize: rpx(24),
        marginBottom: rpx(8),
        fontWeight: "bold",
    },
    mappingItem: {
        paddingVertical: rpx(4),
    },
    mappingText: {
        fontSize: rpx(22),
        opacity: 0.8,
    },
    qualityOptions: {
        marginTop: rpx(8),
    },
    testButton: {
        marginTop: rpx(12),
    },
    helpTitle: {
        marginBottom: rpx(12),
        fontWeight: "bold",
    },
    helpText: {
        fontSize: rpx(24),
        opacity: 0.7,
        marginBottom: rpx(8),
        lineHeight: rpx(36),
    },
    buttonContainer: {
        marginTop: rpx(24),
        marginBottom: rpx(48),
    },
    saveButton: {
        paddingVertical: rpx(8),
    },
});