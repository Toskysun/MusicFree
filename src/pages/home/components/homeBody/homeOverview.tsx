import FastImage from "@/components/base/fastImage";
import Icon, { IIconName } from "@/components/base/icon.tsx";
import ThemeText from "@/components/base/themeText";
import { showPanel } from "@/components/panels/usePanel";
import { ImgAsset } from "@/constants/assetsConst";
import i18n, { useI18N } from "@/core/i18n";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import TrackPlayer, { useMusicState, useProgress } from "@/core/trackPlayer";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import { musicIsPaused } from "@/utils/trackUtils";
import Color from "color";
import React, { ReactNode, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { DimensionValue } from "react-native";
import type { Plugin } from "@/core/pluginManager";
import useHomeDiscovery, {
    IHomeDiscoveryPreview,
} from "./useHomeDiscovery";
import useHomeOverview from "./useHomeOverview";

function formatTime(value?: number) {
    const seconds = Math.max(0, Math.floor(value ?? 0));
    const minute = Math.floor(seconds / 60);
    const second = seconds % 60;
    return `${minute}:${String(second).padStart(2, "0")}`;
}

function getProgressPercent(
    position?: number,
    duration?: number,
): DimensionValue {
    if (!position || !duration || duration <= 0) {
        return "0%";
    }
    return `${Math.min(
        100,
        Math.max(0, (position / duration) * 100),
    )}%` as DimensionValue;
}

function getMusicDescription(musicItem?: IMusic.IMusicItem | null) {
    if (!musicItem) {
        return "";
    }
    return [musicItem.artist, musicItem.platform].filter(Boolean).join(" · ");
}

function ForwardIcon(props: { size: number; color: string }) {
    return (
        <Icon
            name="arrow-left"
            size={props.size}
            color={props.color}
            style={styles.forwardIcon}
        />
    );
}

export default function HomeOverview() {
    const data = useHomeOverview();
    const discoveryPreview = useHomeDiscovery(data.topListPlugins);

    return (
        <ScrollView
            style={styles.wrapper}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}>
            <Discovery
                topListPlugins={data.topListPlugins}
                preview={discoveryPreview}
            />
            <ContinueListening
                currentMusic={data.currentMusic}
                featuredMusic={data.featuredMusic}
            />
            <RecentListening musics={data.recentMusics} />
            <QuickAccess />
            <MyMusic
                favoriteSheet={data.favoriteSheet}
                userSheets={data.userSheets}
                starredSheets={data.starredSheets}
            />
        </ScrollView>
    );
}

function ContinueListening(props: {
    currentMusic: IMusic.IMusicItem | null;
    featuredMusic: IMusic.IMusicItem | null;
}) {
    const { currentMusic, featuredMusic } = props;
    // 进度/播放态是高频更新源，仅在本子组件内订阅，避免整个首页随进度每秒重渲染。
    const musicState = useMusicState();
    const { position, duration } = useProgress();
    const colors = useColors();
    const { t } = useI18N();
    const navigate = useNavigate();

    const isCurrent =
        !!currentMusic &&
        !!featuredMusic &&
        currentMusic.platform === featuredMusic.platform &&
        currentMusic.id === featuredMusic.id;
    const progressDuration = isCurrent
        ? duration || featuredMusic?.duration
        : featuredMusic?.duration;
    const progressPosition = isCurrent ? position : 0;

    if (!featuredMusic) {
        return (
            <Section title={t("home.continueListening")}>
                <View
                    style={[styles.emptyStart, { backgroundColor: colors.card }]}>
                    <QuickPill
                        icon="inbox-arrow-down"
                        title={t("home.importPlaylist.a11y")}
                        onPress={() => showPanel("ImportMusicSheet")}
                    />
                    <QuickPill
                        icon="folder-music-outline"
                        title={t("home.scanLocal")}
                        onPress={() => navigate(ROUTE_PATH.LOCAL)}
                    />
                </View>
            </Section>
        );
    }

    return (
        <Section title={t("home.continueListening")}>
            <Pressable
                style={[
                    styles.continueCard,
                    {
                        backgroundColor: colors.card,
                        borderColor: Color(colors.text).alpha(0.06).toString(),
                    },
                ]}
                onPress={() => {
                    if (isCurrent) {
                        navigate(ROUTE_PATH.MUSIC_DETAIL);
                    } else {
                        TrackPlayer.play(featuredMusic);
                    }
                }}>
                <FastImage
                    source={featuredMusic.artwork}
                    placeholderSource={ImgAsset.albumDefault}
                    style={styles.continueCover}
                />
                <View style={styles.continueContent}>
                    <View style={styles.continueTopLine}>
                        <ThemeText
                            numberOfLines={1}
                            fontSize="title"
                            fontWeight="bold"
                            style={styles.continueTitle}>
                            {featuredMusic.title}
                        </ThemeText>
                        <View
                            style={[
                                styles.platformBadge,
                                {
                                    backgroundColor: Color(colors.primary)
                                        .alpha(0.14)
                                        .toString(),
                                },
                            ]}>
                            <ThemeText
                                numberOfLines={1}
                                fontSize="tag"
                                color={colors.primary}>
                                {featuredMusic.platform}
                            </ThemeText>
                        </View>
                    </View>
                    <ThemeText
                        numberOfLines={1}
                        fontSize="description"
                        fontColor="textSecondary"
                        style={styles.continueDesc}>
                        {featuredMusic.artist || featuredMusic.album}
                    </ThemeText>
                    <View style={styles.progressRow}>
                        <ThemeText fontSize="tag" fontColor="textSecondary">
                            {formatTime(progressPosition)}
                        </ThemeText>
                        <View
                            style={[
                                styles.progressTrack,
                                {
                                    backgroundColor: Color(colors.text)
                                        .alpha(0.1)
                                        .toString(),
                                },
                            ]}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {
                                        backgroundColor: colors.primary,
                                        width: getProgressPercent(
                                            progressPosition,
                                            progressDuration,
                                        ),
                                    },
                                ]}
                            />
                        </View>
                        <ThemeText fontSize="tag" fontColor="textSecondary">
                            {formatTime(progressDuration)}
                        </ThemeText>
                    </View>
                </View>
                <Pressable
                    style={[
                        styles.playButton,
                        {
                            backgroundColor: Color(colors.primary)
                                .alpha(0.2)
                                .toString(),
                        },
                    ]}
                    onPress={() => {
                        if (isCurrent && !musicIsPaused(musicState)) {
                            TrackPlayer.pause();
                        } else {
                            TrackPlayer.play(featuredMusic);
                        }
                    }}>
                    <Icon
                        name={
                            isCurrent && !musicIsPaused(musicState)
                                ? "pause"
                                : "play"
                        }
                        size={rpx(36)}
                        color={colors.primary}
                    />
                </Pressable>
            </Pressable>
        </Section>
    );
}

function RecentListening(props: { musics: IMusic.IMusicItem[] }) {
    const { musics } = props;
    const colors = useColors();
    const { t } = useI18N();

    if (!musics.length) {
        return null;
    }

    return (
        <Section title={t("home.recentListening")} compact>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentContainer}>
                {musics.map(musicItem => (
                    <Pressable
                        key={`${musicItem.platform}-${musicItem.id}`}
                        style={[
                            styles.recentItem,
                            { backgroundColor: colors.card },
                        ]}
                        onPress={() => TrackPlayer.play(musicItem)}>
                        <FastImage
                            source={musicItem.artwork}
                            placeholderSource={ImgAsset.albumDefault}
                            style={styles.recentCover}
                        />
                        <View style={styles.recentText}>
                            <ThemeText
                                numberOfLines={1}
                                fontSize="description"
                                fontWeight="semibold">
                                {musicItem.title}
                            </ThemeText>
                            <ThemeText
                                numberOfLines={1}
                                fontSize="tag"
                                fontColor="textSecondary"
                                style={styles.smallTextMargin}>
                                {getMusicDescription(musicItem)}
                            </ThemeText>
                        </View>
                    </Pressable>
                ))}
            </ScrollView>
        </Section>
    );
}

function QuickAccess() {
    const colors = useColors();
    const { t } = useI18N();
    const navigate = useNavigate();

    const quickItems: {
        key: string;
        icon: IIconName;
        title: string;
        accent: string;
        action: () => void;
    }[] = [
        {
            key: "history",
            icon: "clock-outline",
            title: t("home.playHistory"),
            accent: "#64A7FF",
            action: () => navigate(ROUTE_PATH.HISTORY),
        },
        {
            key: "local",
            icon: "folder-music-outline",
            title: t("home.localMusic"),
            accent: "#8EDB7C",
            action: () => navigate(ROUTE_PATH.LOCAL),
        },
        {
            key: "download",
            icon: "arrow-down-tray",
            title: t("common.download"),
            accent: "#70D7D7",
            action: () => navigate(ROUTE_PATH.DOWNLOADING),
        },
        {
            key: "topList",
            icon: "trophy",
            title: t("home.topList"),
            accent: "#E5A1C6",
            action: () => navigate(ROUTE_PATH.TOP_LIST),
        },
        {
            key: "recommend",
            icon: "fire-outline",
            title: t("home.recommendSheet"),
            accent: "#FF8E7D",
            action: () => navigate(ROUTE_PATH.RECOMMEND_SHEETS),
        },
        {
            key: "import",
            icon: "inbox-arrow-down",
            title: t("home.import.short"),
            accent: "#A88BFF",
            action: () => showPanel("ImportMusicSheet"),
        },
        {
            key: "sourceManage",
            icon: "cog-8-tooth",
            title: t("home.manageSources.short"),
            accent: "#F4B85F",
            action: () =>
                navigate(ROUTE_PATH.SETTING, {
                    type: "plugin",
                }),
        },
        {
            key: "playById",
            icon: "identification",
            title: t("home.playById.short"),
            accent: "#A2B3C7",
            action: () => showPanel("PlayById"),
        },
    ];

    return (
        <Section title={t("home.quickAccess")}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickContainer}>
                {quickItems.map(item => (
                    <Pressable
                        key={item.key}
                        style={[
                            styles.quickItem,
                            {
                                backgroundColor: colors.card,
                                borderColor: Color(colors.text)
                                    .alpha(0.06)
                                    .toString(),
                            },
                        ]}
                        onPress={item.action}>
                        <View
                            style={[
                                styles.quickIconBox,
                                {
                                    backgroundColor: Color(item.accent)
                                        .alpha(0.16)
                                        .toString(),
                                },
                            ]}>
                            <Icon
                                name={item.icon}
                                color={item.accent}
                                size={rpx(32)}
                            />
                        </View>
                        <ThemeText
                            numberOfLines={1}
                            fontSize="description"
                            fontWeight="semibold"
                            style={styles.quickText}>
                            {item.title}
                        </ThemeText>
                    </Pressable>
                ))}
            </ScrollView>
        </Section>
    );
}

function Discovery(props: {
    topListPlugins: Plugin[];
    preview: IHomeDiscoveryPreview;
}) {
    const { topListPlugins, preview } = props;
    const colors = useColors();
    const { t } = useI18N();
    const navigate = useNavigate();

    const previewItems = useMemo(
        () =>
            preview.topLists.map((item, index) => ({
                key: `top-${preview.topListPluginHash}-${item.id ?? index}`,
                type: t("home.topList"),
                pluginHash: preview.topListPluginHash,
                pluginName: preview.topListPluginName,
                title: item.title ?? i18n.t("common.unknownName"),
                desc: item.description ?? preview.topListPluginName ?? "",
                cover: item.coverImg ?? item.artwork,
                action: () => {
                    if (preview.topListPluginHash) {
                        navigate(ROUTE_PATH.TOP_LIST_DETAIL, {
                            pluginHash: preview.topListPluginHash,
                            topList: item,
                        });
                    }
                },
            })),
        [navigate, preview, t],
    );
    const fallbackPluginName =
        preview.topListPluginName ?? topListPlugins[0]?.name ?? t("home.topList");
    const fallbackDescription = preview.hasError
        ? `${t("home.topList")} · ${t("common.failToLoad")}`
        : `${t("home.topList")} · ${t("common.emptyList")}`;

    if (!topListPlugins.length && !previewItems.length && !preview.loading) {
        return null;
    }

    return (
        <Section
            title={t("home.discovery")}
            right={
                <Pressable
                    style={styles.sectionTextButton}
                    onPress={() =>
                        navigate(ROUTE_PATH.TOP_LIST, {
                            initialPluginHash: preview.topListPluginHash,
                        })
                    }>
                    <ThemeText
                        fontSize="description"
                        fontWeight="semibold"
                        color={colors.primary}>
                        {t("common.view")}
                    </ThemeText>
                    <ForwardIcon size={rpx(26)} color={colors.primary} />
                </Pressable>
            }>
            {previewItems.length || preview.loading ? (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.discoveryPreviewContainer}>
                    {previewItems.map(item => (
                        <Pressable
                            key={item.key}
                            style={[
                                styles.discoveryPreviewCard,
                                { backgroundColor: colors.card },
                            ]}
                            onPress={item.action}>
                            <FastImage
                                source={item.cover}
                                placeholderSource={ImgAsset.albumDefault}
                                style={styles.discoveryPreviewCover}
                            />
                            <View style={styles.discoveryPreviewMeta}>
                                <View
                                    style={[
                                        styles.platformBadge,
                                        {
                                            backgroundColor: Color(
                                                colors.primary,
                                            )
                                                .alpha(0.14)
                                                .toString(),
                                        },
                                    ]}>
                                    <ThemeText
                                        numberOfLines={1}
                                        fontSize="tag"
                                        color={colors.primary}>
                                        {item.type}
                                    </ThemeText>
                                </View>
                                <ThemeText
                                    numberOfLines={1}
                                    fontSize="tag"
                                    fontColor="textSecondary"
                                    style={styles.discoverySourceName}>
                                    {item.pluginName}
                                </ThemeText>
                            </View>
                            <ThemeText
                                numberOfLines={1}
                                fontSize="subTitle"
                                fontWeight="bold"
                                style={styles.discoveryPreviewTitle}>
                                {item.title}
                            </ThemeText>
                            <ThemeText
                                numberOfLines={1}
                                fontSize="tag"
                                fontColor="textSecondary">
                                {item.desc}
                            </ThemeText>
                        </Pressable>
                    ))}
                    {preview.loading && !previewItems.length ? (
                        <View
                            style={[
                                styles.discoveryPreviewCard,
                                styles.discoveryLoadingCard,
                                { backgroundColor: colors.card },
                            ]}>
                            <ThemeText fontSize="description">
                                {t("common.loading")}
                            </ThemeText>
                        </View>
                    ) : null}
                </ScrollView>
            ) : null}
            {!previewItems.length && !preview.loading && topListPlugins.length ? (
                <Pressable
                    style={[
                        styles.discoveryFallback,
                        {
                            backgroundColor: colors.card,
                            borderColor: Color(colors.text)
                                .alpha(0.06)
                                .toString(),
                        },
                    ]}
                    onPress={() =>
                        navigate(ROUTE_PATH.TOP_LIST, {
                            initialPluginHash: topListPlugins[0]?.hash,
                        })
                    }>
                    <View
                        style={[
                            styles.discoveryIcon,
                            {
                                backgroundColor: Color(colors.primary)
                                    .alpha(0.13)
                                    .toString(),
                            },
                        ]}>
                        <Icon
                            name="trophy"
                            size={rpx(34)}
                            color={colors.primary}
                        />
                    </View>
                    <View style={styles.discoveryText}>
                        <ThemeText
                            numberOfLines={1}
                            fontSize="subTitle"
                            fontWeight="bold">
                            {fallbackPluginName}
                        </ThemeText>
                        <ThemeText
                            numberOfLines={1}
                            fontSize="tag"
                            fontColor="textSecondary"
                            style={styles.smallTextMargin}>
                            {fallbackDescription}
                        </ThemeText>
                    </View>
                    <ForwardIcon
                        size={rpx(30)}
                        color={colors.textSecondary ?? colors.text}
                    />
                </Pressable>
            ) : null}
        </Section>
    );
}

function MyMusic(props: {
    favoriteSheet: IMusic.IMusicSheetItemBase | null;
    userSheets: IMusic.IMusicSheetItemBase[];
    starredSheets: IMusic.IMusicSheetItem[];
}) {
    const { favoriteSheet, userSheets, starredSheets } = props;
    const colors = useColors();
    const { t } = useI18N();
    const navigate = useNavigate();

    const rows: {
        key: string;
        icon: IIconName;
        title: string;
        desc: string;
        accent: string;
        action: () => void;
    }[] = [
        {
            key: "favorite",
            icon: "heart",
            title: t("home.favoriteSheet"),
            desc: t("home.songCount", {
                count: favoriteSheet?.worksNum ?? 0,
            }),
            accent: "#FF8FA3",
            action: () => {
                if (favoriteSheet) {
                    navigate(ROUTE_PATH.LOCAL_SHEET_DETAIL, {
                        id: favoriteSheet.id,
                    });
                }
            },
        },
        {
            key: "localSheets",
            icon: "playlist",
            title: t("home.myPlaylists"),
            desc: t("home.playlistCount", {
                count: userSheets.length,
            }),
            accent: "#A88BFF",
            action: () =>
                navigate(ROUTE_PATH.SHEET_BROWSER, {
                    sheetType: "local",
                }),
        },
        {
            key: "starredSheets",
            icon: "bookmark-square",
            title: t("home.starredPlaylists"),
            desc: t("home.playlistCount", {
                count: starredSheets.length,
            }),
            accent: "#7DD3B8",
            action: () =>
                navigate(ROUTE_PATH.SHEET_BROWSER, {
                    sheetType: "starred",
                }),
        },
    ];

    return (
        <Section
            title={t("home.myMusic")}
            right={
                <View style={styles.myMusicActions}>
                    <Pressable
                        style={[
                            styles.headerIconAction,
                            {
                                backgroundColor: Color(colors.text)
                                    .alpha(0.07)
                                    .toString(),
                            },
                        ]}
                        onPress={() => showPanel("CreateMusicSheet")}
                        accessibilityLabel={t("home.newPlaylist.a11y")}>
                        <Icon
                            name="plus"
                            size={rpx(28)}
                            color={colors.text}
                        />
                    </Pressable>
                    <Pressable
                        style={[
                            styles.headerTextAction,
                            {
                                backgroundColor: Color(colors.primary)
                                    .alpha(0.16)
                                    .toString(),
                            },
                        ]}
                        onPress={() => showPanel("ImportMusicSheet")}
                        accessibilityLabel={t("home.importPlaylist.a11y")}>
                        <Icon
                            name="inbox-arrow-down"
                            size={rpx(26)}
                            color={colors.primary}
                        />
                        <ThemeText
                            numberOfLines={1}
                            fontSize="description"
                            fontWeight="semibold"
                            color={colors.primary}
                            style={styles.headerTextActionLabel}>
                            {t("home.import.short")}
                        </ThemeText>
                    </Pressable>
                </View>
            }>
            <View
                style={[
                    styles.myMusicList,
                    {
                        backgroundColor: colors.card,
                    },
                ]}>
                {rows.map((row, index) => (
                    <Pressable
                        key={row.key}
                        style={[
                            styles.myMusicRow,
                            index < rows.length - 1
                                ? {
                                    borderBottomColor: Color(colors.text)
                                        .alpha(0.06)
                                        .toString(),
                                    borderBottomWidth: StyleSheet.hairlineWidth,
                                }
                                : null,
                        ]}
                        onPress={row.action}>
                        <View
                            style={[
                                styles.myMusicRowIcon,
                                {
                                    backgroundColor: Color(row.accent)
                                        .alpha(0.18)
                                        .toString(),
                                },
                            ]}>
                            <Icon
                                name={row.icon}
                                size={rpx(30)}
                                color={row.accent}
                            />
                        </View>
                        <View style={styles.myMusicRowText}>
                            <ThemeText
                                numberOfLines={1}
                                fontSize="subTitle"
                                fontWeight="semibold">
                                {row.title}
                            </ThemeText>
                            <ThemeText
                                numberOfLines={1}
                                fontSize="description"
                                fontColor="textSecondary"
                                style={styles.smallTextMargin}>
                                {row.desc}
                            </ThemeText>
                        </View>
                        <ForwardIcon
                            size={rpx(30)}
                            color={colors.textSecondary ?? colors.text}
                        />
                    </Pressable>
                ))}
            </View>
        </Section>
    );
}

function QuickPill(props: {
    icon: IIconName;
    title: string;
    onPress: () => void;
}) {
    const { icon, title, onPress } = props;
    const colors = useColors();

    return (
        <Pressable
            style={[
                styles.quickPill,
                { backgroundColor: Color(colors.text).alpha(0.07).toString() },
            ]}
            onPress={onPress}>
            <Icon name={icon} size={rpx(30)} color={colors.text} />
            <ThemeText
                numberOfLines={1}
                fontSize="description"
                fontWeight="semibold"
                style={styles.quickPillText}>
                {title}
            </ThemeText>
        </Pressable>
    );
}

function Section(props: {
    title: string;
    subtitle?: string;
    right?: ReactNode;
    compact?: boolean;
    children: ReactNode;
}) {
    const { title, subtitle, right, compact, children } = props;

    return (
        <View style={[styles.section, compact ? styles.compactSection : null]}>
            <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleBlock}>
                    <ThemeText fontSize="title" fontWeight="bold">
                        {title}
                    </ThemeText>
                    {subtitle ? (
                        <ThemeText
                            numberOfLines={1}
                            fontSize="description"
                            fontColor="textSecondary"
                            style={styles.sectionSubtitle}>
                            {subtitle}
                        </ThemeText>
                    ) : null}
                </View>
                {right}
            </View>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    forwardIcon: {
        transform: [{ rotate: "180deg" }],
    },
    wrapper: {
        width: "100%",
        flex: 1,
    },
    contentContainer: {
        paddingBottom: rpx(36),
    },
    section: {
        marginTop: rpx(20),
    },
    compactSection: {
        marginTop: rpx(14),
    },
    sectionHeader: {
        minHeight: rpx(52),
        paddingHorizontal: rpx(24),
        marginBottom: rpx(14),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    sectionTitleBlock: {
        flex: 1,
        paddingRight: rpx(12),
    },
    sectionSubtitle: {
        marginTop: rpx(8),
    },
    sectionTextButton: {
        minHeight: rpx(48),
        flexDirection: "row",
        alignItems: "center",
    },
    continueCard: {
        marginHorizontal: rpx(24),
        minHeight: rpx(156),
        borderRadius: rpx(18),
        borderWidth: StyleSheet.hairlineWidth,
        padding: rpx(18),
        flexDirection: "row",
        alignItems: "center",
    },
    continueCover: {
        width: rpx(116),
        height: rpx(116),
        borderRadius: rpx(14),
    },
    continueContent: {
        flex: 1,
        minWidth: 0,
        marginLeft: rpx(18),
    },
    continueTopLine: {
        flexDirection: "row",
        alignItems: "center",
    },
    continueTitle: {
        flex: 1,
        minWidth: 0,
    },
    platformBadge: {
        maxWidth: rpx(132),
        minHeight: rpx(34),
        paddingHorizontal: rpx(12),
        borderRadius: rpx(17),
        alignItems: "center",
        justifyContent: "center",
        marginLeft: rpx(10),
    },
    continueDesc: {
        marginTop: rpx(12),
    },
    progressRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: rpx(20),
    },
    progressTrack: {
        flex: 1,
        height: rpx(6),
        borderRadius: rpx(3),
        marginHorizontal: rpx(12),
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        borderRadius: rpx(3),
    },
    playButton: {
        width: rpx(70),
        height: rpx(70),
        borderRadius: rpx(35),
        marginLeft: rpx(14),
        alignItems: "center",
        justifyContent: "center",
    },
    emptyStart: {
        marginHorizontal: rpx(24),
        minHeight: rpx(108),
        borderRadius: rpx(18),
        padding: rpx(14),
        flexDirection: "row",
        alignItems: "center",
    },
    quickPill: {
        flex: 1,
        minWidth: 0,
        height: rpx(76),
        borderRadius: rpx(16),
        marginHorizontal: rpx(4),
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        paddingHorizontal: rpx(10),
    },
    quickPillText: {
        marginLeft: rpx(8),
        flexShrink: 1,
    },
    recentContainer: {
        paddingHorizontal: rpx(24),
    },
    recentItem: {
        width: rpx(260),
        height: rpx(88),
        borderRadius: rpx(16),
        flexDirection: "row",
        alignItems: "center",
        padding: rpx(12),
        marginRight: rpx(14),
    },
    recentCover: {
        width: rpx(64),
        height: rpx(64),
        borderRadius: rpx(12),
    },
    recentText: {
        flex: 1,
        minWidth: 0,
        marginLeft: rpx(12),
    },
    smallTextMargin: {
        marginTop: rpx(8),
    },
    quickContainer: {
        paddingHorizontal: rpx(24),
    },
    quickItem: {
        width: rpx(136),
        height: rpx(112),
        borderRadius: rpx(18),
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: "center",
        justifyContent: "center",
        marginRight: rpx(14),
    },
    quickIconBox: {
        width: rpx(52),
        height: rpx(52),
        borderRadius: rpx(16),
        alignItems: "center",
        justifyContent: "center",
    },
    quickText: {
        marginTop: rpx(12),
        maxWidth: rpx(112),
    },
    discoveryPreviewContainer: {
        paddingHorizontal: rpx(24),
    },
    discoveryPreviewCard: {
        width: rpx(232),
        minHeight: rpx(318),
        borderRadius: rpx(18),
        padding: rpx(14),
        marginRight: rpx(14),
    },
    discoveryPreviewCover: {
        width: rpx(204),
        height: rpx(204),
        borderRadius: rpx(14),
    },
    discoveryPreviewMeta: {
        marginTop: rpx(14),
        flexDirection: "row",
        alignItems: "center",
    },
    discoverySourceName: {
        flex: 1,
        minWidth: 0,
        marginLeft: rpx(8),
    },
    discoveryPreviewTitle: {
        marginTop: rpx(12),
        marginBottom: rpx(8),
    },
    discoveryLoadingCard: {
        alignItems: "center",
        justifyContent: "center",
    },
    discoveryFallback: {
        marginHorizontal: rpx(24),
        minHeight: rpx(116),
        borderRadius: rpx(18),
        borderWidth: StyleSheet.hairlineWidth,
        padding: rpx(18),
        flexDirection: "row",
        alignItems: "center",
    },
    discoveryIcon: {
        width: rpx(58),
        height: rpx(58),
        borderRadius: rpx(16),
        alignItems: "center",
        justifyContent: "center",
    },
    discoveryText: {
        flex: 1,
        minWidth: 0,
        marginLeft: rpx(14),
    },
    myMusicActions: {
        flexDirection: "row",
        alignItems: "center",
    },
    headerIconAction: {
        width: rpx(52),
        height: rpx(52),
        borderRadius: rpx(26),
        alignItems: "center",
        justifyContent: "center",
        marginRight: rpx(10),
    },
    headerTextAction: {
        height: rpx(52),
        borderRadius: rpx(26),
        paddingHorizontal: rpx(16),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    headerTextActionLabel: {
        marginLeft: rpx(8),
    },
    myMusicList: {
        marginHorizontal: rpx(24),
        borderRadius: rpx(18),
        overflow: "hidden",
    },
    myMusicRow: {
        minHeight: rpx(104),
        paddingHorizontal: rpx(16),
        flexDirection: "row",
        alignItems: "center",
    },
    myMusicRowIcon: {
        width: rpx(54),
        height: rpx(54),
        borderRadius: rpx(16),
        alignItems: "center",
        justifyContent: "center",
    },
    myMusicRowText: {
        flex: 1,
        minWidth: 0,
        marginLeft: rpx(14),
        marginRight: rpx(10),
    },
});
