import { Theme, useTheme } from "@react-navigation/native";
import Color from "color";
import { useMemo } from "react";

type IColors = Theme["colors"];

export interface CustomizedColors extends IColors {
    /** 普通文字 */
    text: string;
    /** 副标题文字颜色 */
    textSecondary?: string;
    /** 高亮文本颜色，也就是主色调 */
    textHighlight?: string;
    /** 页面背景 */
    pageBackground?: string;
    /** 阴影 */
    shadow?: string;
    /** 标题栏颜色 */
    appBar?: string;
    /** 标题栏字体颜色 */
    appBarText?: string;
    /** 音乐栏颜色 */
    musicBar?: string;
    /** 音乐栏字体颜色 */
    musicBarText?: string;
    /** 分割线 */
    divider?: string;
    /** 高亮颜色 */
    listActive?: string;
    /** 输入框背景色 */
    placeholder?: string;
    /** 弹窗、浮层、菜单背景色 */
    backdrop?: string;
    /** 卡片背景色 */
    card: string;
    /** 基础表面 */
    surface?: string;
    /** 浮起表面 */
    surfaceElevated?: string;
    /** 边框 */
    border: string;
    /** 暖色强调 */
    accentWarm?: string;
    /** 冷色强调 */
    accentCool?: string;
    success?: string;
    danger?: string;
    info?: string;
    /** paneltabbar 背景色 */
    tabBar?: string;
}

export default function useColors() {
    const { colors, dark } = useTheme();

    const cColors: CustomizedColors = useMemo(() => {
        const customColors = colors as CustomizedColors;
        return {
            ...customColors,
            textSecondary: Color(colors.text).alpha(0.64).toString(),
            surface: customColors.surface ?? colors.card,
            surfaceElevated:
                customColors.surfaceElevated ??
                (dark
                    ? Color(colors.card).lighten(0.24).toString()
                    : Color(colors.card).lighten(0.12).toString()),
            border: colors.border ?? Color(colors.text).alpha(0.12).toString(),
            accentWarm: customColors.accentWarm ?? colors.primary,
            accentCool:
                customColors.accentCool ?? customColors.info ?? colors.primary,
            // @ts-ignore
            background: colors.pageBackground ?? colors.background,
        };
    }, [colors, dark]);

    return cColors;
}
