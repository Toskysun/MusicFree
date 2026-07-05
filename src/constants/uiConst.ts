import { CustomizedColors } from "@/hooks/useColors";
import { fontRpx, fontRpxRound } from "@/utils/rpx";

const fontSizeConst = {
    /** 辅助标记 */
    caption: fontRpx(18),
    /** 标签 */
    tag: fontRpx(20),
    /** 描述文本等字体 */
    description: fontRpx(22),
    /** 副标题 */
    subTitle: fontRpx(26),
    /** 正文字体 */
    content: fontRpx(28),
    /** 标题字体 */
    title: fontRpx(32),
    /** appbar的字体 */
    appbar: fontRpx(36),
    /** 分区标题 */
    section: fontRpx(40),
    /** 首页大标题 */
    hero: fontRpx(54),
};

const fontWeightConst = {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    bolder: "800",
} as const;

const iconSizeConst = {
    small: fontRpxRound(30),
    light: fontRpxRound(36),
    normal: fontRpxRound(42),
    big: fontRpxRound(60),
    large: fontRpxRound(72),
};

type ColorKey = "normal" | "secondary" | "highlight" | "primary";
const colorMap: Record<ColorKey, keyof CustomizedColors> = {
    normal: "text",
    secondary: "textSecondary",
    highlight: "textHighlight",
    primary: "primary",
} as const;

export { fontSizeConst, fontWeightConst, iconSizeConst, colorMap };
export type { ColorKey };
