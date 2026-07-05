import { Dimensions } from "react-native";
import rpx, { fontRpx, fontRpxRound, rpxRound, vmin, vmax } from "./rpx";

const originalWindow = Dimensions.get("window");
const originalScreen = Dimensions.get("screen");

function setDimensions(width: number, height: number) {
    const size = {
        width,
        height,
        scale: 1,
        fontScale: 1,
    };

    Dimensions.set({
        window: size,
        screen: size,
    });
}

describe("rpx", () => {
    afterEach(() => {
        Dimensions.set({
            window: originalWindow,
            screen: originalScreen,
        });
    });

    it("keeps layout scaling based on the current short edge", () => {
        setDimensions(390, 844);

        expect(rpx(750)).toBe(390);
        expect(rpxRound(750)).toBe(390);

        setDimensions(1024, 768);

        expect(rpx(750)).toBe(768);
        expect(rpxRound(750)).toBe(768);
    });

    it("caps font scaling on large screens", () => {
        setDimensions(390, 844);

        expect(fontRpx(750)).toBe(390);

        setDimensions(1024, 768);

        expect(fontRpx(750)).toBe(430);
        expect(fontRpxRound(42)).toBe(24);
    });

    it("reads vmin and vmax from the current window size", () => {
        setDimensions(390, 844);

        expect(vmin(50)).toBe(195);
        expect(vmax(50)).toBe(422);

        setDimensions(1024, 768);

        expect(vmin(50)).toBe(384);
        expect(vmax(50)).toBe(512);
    });
});
