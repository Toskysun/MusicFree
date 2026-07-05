import { Dimensions } from "react-native";

const DESIGN_WIDTH = 750;
const MAX_FONT_BASE_SIZE = 430;

function getWindowEdge() {
    const { width, height } = Dimensions.get("window");

    return {
        min: Math.min(height, width),
        max: Math.max(height, width),
    };
}

function scale(rpx: number, baseSize: number) {
    return (rpx / DESIGN_WIDTH) * baseSize;
}

function getRpxBaseSize() {
    return getWindowEdge().min;
}

function getFontBaseSize() {
    return Math.min(getRpxBaseSize(), MAX_FONT_BASE_SIZE);
}

export default function (rpx: number) {
    return scale(rpx, getRpxBaseSize());
}

/**
 * 返回取整后的 rpx 值，用于图标等需要精确像素对齐的场景
 * 避免浮点数尺寸导致的 SVG 渲染伪影（如横线/竖线）
 */
export function rpxRound(rpx: number) {
    return Math.round(scale(rpx, getRpxBaseSize()));
}

/**
 * 字体和常用图标的缩放需要封顶，避免平板短边过大时看起来像 DPI 异常。
 */
export function fontRpx(rpx: number) {
    return scale(rpx, getFontBaseSize());
}

export function fontRpxRound(rpx: number) {
    return Math.round(fontRpx(rpx));
}

export function vh(pct: number) {
    return (pct / 100) * Dimensions.get("window").height;
}

export function vw(pct: number) {
    return (pct / 100) * Dimensions.get("window").width;
}

export function vmin(pct: number) {
    return (pct / 100) * getWindowEdge().min;
}

export function vmax(pct: number) {
    return (pct / 100) * getWindowEdge().max;
}

export function sh(pct: number) {
    return (pct / 100) * Dimensions.get("screen").height;
}

export function sw(pct: number) {
    return (pct / 100) * Dimensions.get("screen").width;
}
