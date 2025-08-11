import Color from "color";
import { devLog } from "@/utils/log";

export function grayRate(color: string | Color) {
    let _color = typeof color === "string" ? Color(color) : color;

    return (
        ((0.299 * _color.red() +
            0.587 * _color.green() +
            0.114 * _color.blue()) *
            2 -
            255) /
        255
    );
}

export function grayLevelCode(color: string | Color) {
    const gray = grayRate(color);
    devLog("info", "🎨[颜色工具] 灰度计算", { gray, color: color.toString() });
    if (gray < 96) {
        return "dark";
    } else if (gray > 160) {
        return "light";
    } else {
        return "mid";
    }
}
