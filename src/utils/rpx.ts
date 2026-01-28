import { Dimensions } from "react-native";

const windowWidth = Dimensions.get("window").width;
const windowHeight = Dimensions.get("window").height;
const minWindowEdge = Math.min(windowHeight, windowWidth);
const maxWindowEdge = Math.max(windowHeight, windowWidth);

export default function (rpx: number) {
    return (rpx / 750) * minWindowEdge;
}

/**
 * 返回取整后的 rpx 值，用于图标等需要精确像素对齐的场景
 * 避免浮点数尺寸导致的 SVG 渲染伪影（如横线/竖线）
 */
export function rpxRound(rpx: number) {
    return Math.round((rpx / 750) * minWindowEdge);
}

export function vh(pct: number) {
    return (pct / 100) * Dimensions.get("window").height;
}

export function vw(pct: number) {
    return (pct / 100) * Dimensions.get("window").width;
}

export function vmin(pct: number) {
    return (pct / 100) * minWindowEdge;
}

export function vmax(pct: number) {
    return (pct / 100) * maxWindowEdge;
}

export function sh(pct: number) {
    return (pct / 100) * Dimensions.get("screen").height;
}

export function sw(pct: number) {
    return (pct / 100) * Dimensions.get("screen").width;
}
