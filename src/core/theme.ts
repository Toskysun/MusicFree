import Config from "@/core/appConfig";

import {
    DarkTheme as _DarkTheme,
    DefaultTheme as _DefaultTheme,
} from "@react-navigation/native";
import { GlobalState } from "@/utils/stateMapper";
import { CustomizedColors } from "@/hooks/useColors";
import Color from "color";

export const lightTheme = {
    id: "p-light",
    ..._DefaultTheme,
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
        listActive: "rgba(217,75,50,0.10)", // 在手机上表现是ripple
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
        listActive: "rgba(255,118,80,0.13)", // 在手机上表现是ripple
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

const themeStore = new GlobalState(darkTheme);
const backgroundStore = new GlobalState<IBackgroundInfo | null>(null);

function setup() {
    const currentTheme = Config.getConfig("theme.selectedTheme") ?? "p-dark";

    if (currentTheme === "p-dark") {
        themeStore.setValue(darkTheme);
    } else if (currentTheme === "p-light") {
        themeStore.setValue(lightTheme);
    } else {
        themeStore.setValue({
            id: currentTheme,
            dark: true,
            // @ts-ignore
            colors:
                (Config.getConfig("theme.colors") as CustomizedColors) ??
                darkTheme.colors,
        });
    }

    const bgUrl = Config.getConfig("theme.background");
    const bgBlur = Config.getConfig("theme.backgroundBlur");
    const bgOpacity = Config.getConfig("theme.backgroundOpacity");

    backgroundStore.setValue({
        url: bgUrl,
        blur: bgBlur ?? 20,
        opacity: bgOpacity ?? 0.6,
    });
}

function setTheme(
    themeName: string,
    extra?: {
        colors?: Partial<CustomizedColors>;
        background?: IBackgroundInfo;
    },
) {
    if (themeName === "p-light") {
        themeStore.setValue(lightTheme);
    } else if (themeName === "p-dark") {
        themeStore.setValue(darkTheme);
    } else {
        themeStore.setValue({
            id: themeName,
            dark: true,
            colors: {
                ...darkTheme.colors,
                ...(extra?.colors ?? {}),
            },
        });
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
    if (currentTheme.id !== "p-light" && currentTheme.id !== "p-dark") {
        const newTheme = {
            ...currentTheme,
            colors: {
                ...currentTheme.colors,
                ...colors,
            },
        };
        Config.setConfig("theme.customColors", newTheme.colors);
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
