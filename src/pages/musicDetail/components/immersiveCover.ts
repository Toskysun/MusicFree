import rpx from "@/utils/rpx";

export const IMMERSIVE_CONTENT_HORIZONTAL_PADDING = rpx(64);
export const IMMERSIVE_CONTENT_TOP_GAP = rpx(48);
export const IMMERSIVE_CLEAR_VISIBLE_RATIO = 0.62;
export const IMMERSIVE_STRETCH_BLEND_HEIGHT = rpx(420);
export const IMMERSIVE_STRETCH_BLEND_TOP_RATIO = 0.5;

export function getImmersiveCoverHeight(windowWidth: number) {
    return windowWidth;
}
