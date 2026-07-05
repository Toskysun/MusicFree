import rpx from "@/utils/rpx";

export const IMMERSIVE_CONTENT_TOP_GAP = rpx(48);
export const IMMERSIVE_CLEAR_VISIBLE_RATIO = 0.62;

export function getImmersiveCoverHeight(windowWidth: number) {
    return windowWidth;
}
