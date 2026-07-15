import Config from "@/core/appConfig";

import {
    DarkTheme as _DarkTheme,
    DefaultTheme as _DefaultTheme,
    type Theme as NavigationTheme,
} from "@react-navigation/native";
import { GlobalState } from "@/utils/stateMapper";
import { CustomizedColors } from "@/hooks/useColors";
import Color from "color";
import { Appearance, Image as RNImage } from "react-native";

/** RN Navigation 7+ reads theme.fonts.regular in native-stack headers. */
const navigationFonts: NavigationTheme["fonts"] =
    _DefaultTheme.fonts ?? _DarkTheme.fonts;

function ensureNavigationFonts<T extends { fonts?: NavigationTheme["fonts"] }>(
    theme: T,
): T & { fonts: NavigationTheme["fonts"] } {
    return {
        ...theme,
        fonts: theme.fonts ?? navigationFonts,
    };
}

export const lightTheme = {
    id: "p-light",
    ..._DefaultTheme,
    fonts: navigationFonts,
    colors: {
        ..._DefaultTheme.colors,
        background: "transparent",
        text: "#191815",
        textSecondary: Color("#191815").alpha(0.62).toString(),
        primary: "#D94B32",
        pageBackground: "#F3F0E9",
        shadow: "#201D18",
        appBar: "#F3F0E9",
        appBarText: "#191815",
        musicBar: "#FAF7F0",
        musicBarText: "#191815",
        divider: "rgba(25,24,21,0.13)",
        border: "rgba(25,24,21,0.14)",
        listActive: "rgba(25,24,21,0.08)", // 使用文本颜色的半透明
        mask: "rgba(25,24,21,0.24)",
        backdrop: "#E9E4DA",
        surface: "#ECE7DD",
        surfaceElevated: "#FAF7F0",
        accentWarm: "#D94B32",
        accentCool: "#3F899B",
        tabBar: "#E9E4DA",
        placeholder: "#E4DED3",
        success: "#08A34C",
        danger: "#FC5F5F",
        info: "#0A95C8",
        card: "#EAE4D9",
        notification: "#E9E4DA",
    },
};

export const darkTheme = {
    id: "p-dark",
    ..._DarkTheme,
    fonts: navigationFonts,
    colors: {
        ..._DarkTheme.colors,
        background: "transparent",
        text: "#F5F2EB",
        textSecondary: Color("#F5F2EB").alpha(0.64).toString(),
        primary: "#FF7650",
        pageBackground: "#101419",
        shadow: "#000000",
        appBar: "#101419",
        appBarText: "#F5F2EB",
        musicBar: "#1A2027",
        musicBarText: "#F8F5EE",
        divider: "rgba(245,242,235,0.11)",
        border: "rgba(245,242,235,0.12)",
        listActive: "rgba(245,242,235,0.10)", // 使用文本颜色的半透明
        mask: "rgba(8,11,14,0.82)",
        backdrop: "#171C22",
        surface: "#171D24",
        surfaceElevated: "#202730",
        accentWarm: "#FF7650",
        accentCool: "#54A5B8",
        tabBar: "#171C22",
        placeholder: "#20262E",
        success: "#08A34C",
        danger: "#FC5F5F",
        info: "#0A95C8",
        card: "#192028",
        notification: "#171C22",
    },
};

interface IBackgroundInfo {
    url?: string;
    blur?: number;
    opacity?: number;
}

export const customBackgroundSurfaceColors: Partial<CustomizedColors> = {
    pageBackground: "rgba(0,0,0,0.12)",
    card: "rgba(0,0,0,0.22)",
    surface: "rgba(0,0,0,0.18)",
    surfaceElevated: "rgba(0,0,0,0.30)",
    appBar: "rgba(0,0,0,0.18)",
    tabBar: "rgba(0,0,0,0.22)",
    notification: "rgba(0,0,0,0.32)",
    backdrop: "rgba(0,0,0,0.62)",
    placeholder: "rgba(0,0,0,0.20)",
};

const themeStore = new GlobalState(ensureNavigationFonts(darkTheme));
const backgroundStore = new GlobalState<IBackgroundInfo | null>(null);

function sameColor(a?: string, b?: string) {
    if (!a || !b) {
        return false;
    }

    try {
        return Color(a).hexa().toLowerCase() === Color(b).hexa().toLowerCase();
    } catch {
        return a.toLowerCase() === b.toLowerCase();
    }
}

function normalizeCustomBackgroundColors(
    colors: CustomizedColors,
    hasBackground: boolean,
) {
    if (!hasBackground) {
        return colors;
    }

    const normalized = { ...colors };
    if (
        sameColor(normalized.appBar, normalized.primary) ||
        sameColor(normalized.appBar, darkTheme.colors.appBar)
    ) {
        normalized.appBar = customBackgroundSurfaceColors.appBar;
    }

    (Object.keys(customBackgroundSurfaceColors) as Array<
        keyof CustomizedColors
    >).forEach(key => {
        const current = normalized[key] as string | undefined;
        const preset =
            (darkTheme.colors as CustomizedColors)[key] ??
            (lightTheme.colors as CustomizedColors)[key];

        if (!current || sameColor(current, preset as string | undefined)) {
            // @ts-ignore key is constrained to CustomizedColors string colors here.
            normalized[key] = customBackgroundSurfaceColors[key];
        }
    });

    return normalized;
}

function getCardDerivedSurfaceElevated(card: string, dark: boolean) {
    try {
        return Color(card).lighten(dark ? 0.24 : 0.12).toString();
    } catch {
        return card;
    }
}

function isDefaultLikeColor(
    color: string | undefined,
    candidates: Array<string | undefined>,
) {
    if (!color) {
        return true;
    }
    return candidates.some(candidate => sameColor(color, candidate));
}

function syncCardSurfaceColors(
    colors: CustomizedColors,
    options: {
        force?: boolean;
        dark?: boolean;
    } = {},
) {
    const { force = false, dark = true } = options;
    if (!colors.card) {
        return {
            colors,
            changed: false,
        };
    }

    const cardIsCustomized =
        force ||
        !isDefaultLikeColor(colors.card, [
            darkTheme.colors.card,
            lightTheme.colors.card,
            customBackgroundSurfaceColors.card,
        ]);

    if (!cardIsCustomized) {
        return {
            colors,
            changed: false,
        };
    }

    let changed = false;
    const nextColors = { ...colors };
    if (
        force ||
        isDefaultLikeColor(nextColors.surface, [
            darkTheme.colors.surface,
            lightTheme.colors.surface,
            customBackgroundSurfaceColors.surface,
        ])
    ) {
        nextColors.surface = colors.card;
        changed = true;
    }

    if (
        force ||
        isDefaultLikeColor(nextColors.surfaceElevated, [
            darkTheme.colors.surfaceElevated,
            lightTheme.colors.surfaceElevated,
            customBackgroundSurfaceColors.surfaceElevated,
        ])
    ) {
        nextColors.surfaceElevated = getCardDerivedSurfaceElevated(
            colors.card,
            dark,
        );
        changed = true;
    }

    return {
        colors: nextColors,
        changed,
    };
}

function setup() {
    const configuredTheme = Config.getConfig("theme.selectedTheme") ?? "p-dark";
    const followSystem = Config.getConfig("theme.followSystem");
    const systemTheme = followSystem ? Appearance.getColorScheme() : null;
    const currentTheme =
        systemTheme === "light"
            ? "p-light"
            : systemTheme === "dark"
                ? "p-dark"
                : configuredTheme;
    const bgUrl = Config.getConfig("theme.background");

    if (currentTheme === "p-dark") {
        themeStore.setValue(ensureNavigationFonts(darkTheme));
    } else if (currentTheme === "p-light") {
        themeStore.setValue(ensureNavigationFonts(lightTheme));
    } else {
        const savedColors = (Config.getConfig("theme.colors") as CustomizedColors) ??
            darkTheme.colors;

        // 修复旧版本中错误的 listActive 配置
        // 如果 listActive 存在但与 primary 不匹配，重新生成
        const fixedColors = { ...savedColors };
        if (fixedColors.primary && fixedColors.listActive) {
            const expectedListActive = Color(fixedColors.primary).alpha(0.12).toString();
            // 检查现有的 listActive 是否基于 primary 颜色
            try {
                const currentListActiveColor = Color(fixedColors.listActive);
                const primaryColor = Color(fixedColors.primary);
                // 如果色相差异超过10度，或者不是半透明，则重新生成
                if (
                    Math.abs(currentListActiveColor.hue() - primaryColor.hue()) > 10 ||
                    currentListActiveColor.alpha() > 0.2
                ) {
                    fixedColors.listActive = expectedListActive;
                    Config.setConfig("theme.colors", fixedColors);
                }
            } catch {
                // 解析失败，重新生成
                fixedColors.listActive = expectedListActive;
                Config.setConfig("theme.colors", fixedColors);
            }
        }

        const cardSynced = syncCardSurfaceColors(fixedColors);
        if (cardSynced.changed) {
            Config.setConfig("theme.colors", cardSynced.colors);
        }

        // Custom themes previously omitted `fonts`, which crashes RN Navigation 7
        // native-stack (Cannot read property 'regular' of undefined).
        themeStore.setValue(
            ensureNavigationFonts({
                ...darkTheme,
                id: currentTheme,
                dark: true,
                // @ts-ignore
                colors: normalizeCustomBackgroundColors(
                    cardSynced.colors,
                    !!bgUrl,
                ),
            }),
        );
    }

    const bgBlur = Config.getConfig("theme.backgroundBlur");
    const bgOpacity = Config.getConfig("theme.backgroundOpacity");

    backgroundStore.setValue({
        url: bgUrl,
        blur: bgBlur ?? 20,
        opacity: bgOpacity ?? 0.6,
    });

    // Warm the native image cache while the splash screen is still visible.
    // This is fire-and-forget: a slow/corrupt image must never delay startup.
    if (bgUrl && typeof RNImage.prefetch === "function") {
        try {
            RNImage.prefetch(bgUrl).catch(() => false);
        } catch {
            // A malformed persisted URI must not abort the bootstrap path.
        }
    }
}

function setTheme(
    themeName: string,
    extra?: {
        colors?: Partial<CustomizedColors>;
        background?: IBackgroundInfo;
    },
) {
    if (themeName === "p-light") {
        themeStore.setValue(ensureNavigationFonts(lightTheme));
    } else if (themeName === "p-dark") {
        themeStore.setValue(ensureNavigationFonts(darkTheme));
    } else {
        const hasBackground = !!(
            extra?.background?.url ??
            backgroundStore.getValue()?.url ??
            Config.getConfig("theme.background")
        );
        themeStore.setValue(
            ensureNavigationFonts({
                ...darkTheme,
                id: themeName,
                dark: true,
                colors: normalizeCustomBackgroundColors(
                    {
                        ...darkTheme.colors,
                        ...(extra?.colors ?? {}),
                    },
                    hasBackground,
                ) as typeof darkTheme.colors,
            }),
        );
    }

    Config.setConfig("theme.selectedTheme", themeName);
    Config.setConfig("theme.colors", themeStore.getValue().colors);

    if (extra?.background) {
        const currentBg = backgroundStore.getValue();
        let newBg: IBackgroundInfo = {
            blur: 20,
            opacity: 0.6,
            ...(currentBg ?? {}),
            url: undefined,
        };
        if (typeof extra.background.blur === "number") {
            newBg.blur = extra.background.blur;
        }
        if (typeof extra.background.opacity === "number") {
            newBg.opacity = extra.background.opacity;
        }
        if (extra.background.url) {
            newBg.url = extra.background.url;
        }

        Config.setConfig("theme.background", newBg.url);
        Config.setConfig("theme.backgroundBlur", newBg.blur);
        Config.setConfig("theme.backgroundOpacity", newBg.opacity);

        backgroundStore.setValue(newBg);
    }
}

function setColors(colors: Partial<CustomizedColors>) {
    const currentTheme = themeStore.getValue();
    const persistedColors = Config.getConfig("theme.colors") as
        | CustomizedColors
        | undefined;

    // 如果设置了 primary 但没有明确设置 listActive，自动生成 listActive
    const colorsWithListActive = { ...colors };
    if (colors.primary && !colors.listActive) {
        colorsWithListActive.listActive = Color(colors.primary).alpha(0.12).toString();
    }

    const mergedColors = {
        ...darkTheme.colors,
        ...(persistedColors ?? {}),
        ...currentTheme.colors,
        ...colorsWithListActive,
    } as CustomizedColors;
    const newColors = syncCardSurfaceColors(mergedColors, {
        force: !!colors.card,
        dark: currentTheme.dark,
    }).colors;

    Config.setConfig("theme.customColors", newColors);
    Config.setConfig("theme.colors", newColors);

    if (currentTheme.id !== "p-light" && currentTheme.id !== "p-dark") {
        const hasBackground = !!(
            backgroundStore.getValue()?.url ?? Config.getConfig("theme.background")
        );
        const newTheme = ensureNavigationFonts({
            ...currentTheme,
            colors: normalizeCustomBackgroundColors(
                newColors,
                hasBackground,
            ) as typeof currentTheme.colors,
        });
        Config.setConfig("theme.colors", newTheme.colors);
        themeStore.setValue(newTheme);
    }
}

function setBackground(backgroundInfo: Partial<IBackgroundInfo>) {
    const currentBackgroundInfo = backgroundStore.getValue();
    let newBgInfo = {
        ...(currentBackgroundInfo ?? {
            opacity: 0.6,
            blur: 20,
        }),
    };
    if (typeof backgroundInfo.blur === "number") {
        Config.setConfig("theme.backgroundBlur", backgroundInfo.blur);
        newBgInfo.blur = backgroundInfo.blur;
    }
    if (typeof backgroundInfo.opacity === "number") {
        Config.setConfig("theme.backgroundOpacity", backgroundInfo.opacity);
        newBgInfo.opacity = backgroundInfo.opacity;
    }
    if (backgroundInfo.url !== undefined) {
        Config.setConfig("theme.background", backgroundInfo.url);
        newBgInfo.url = backgroundInfo.url;
    }
    backgroundStore.setValue(newBgInfo);
}

const configableColorKey: Array<keyof CustomizedColors> = [
    "primary",
    "text",
    "appBar",
    "appBarText",
    "musicBar",
    "musicBarText",
    "pageBackground",
    "backdrop",
    "card",
    "placeholder",
    "tabBar",
    "notification",
];

const Theme = {
    setup,
    setTheme,
    setBackground,
    setColors,
    useTheme: themeStore.useValue,
    getTheme: themeStore.getValue,
    useBackground: backgroundStore.useValue,
    configableColorKey,
};

export default Theme;
