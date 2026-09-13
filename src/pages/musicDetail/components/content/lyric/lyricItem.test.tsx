import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { StyleSheet, Text, View } from "react-native";
import LyricItemComponent from "./lyricItem";

jest.mock("react-native-reanimated", () => {
    const native = require("react-native");
    return {
        __esModule: true,
        default: { Text: native.Text, View: native.View },
        useSharedValue: (value: number) => ({ value }),
        useAnimatedStyle: (factory: () => unknown) => factory(),
        withTiming: (value: number) => value,
        Easing: { bezier: jest.fn() },
    };
});
jest.mock("@/utils/rpx", () => ({
    __esModule: true,
    default: (value: number) => value,
}));
jest.mock("@/hooks/useColors", () => () => ({ primary: "#fff" }));
jest.mock("@/constants/uiConst", () => ({
    fontSizeConst: { content: 28 },
}));
jest.mock("@/core/lyricManager", () => ({}));
jest.mock("@/core/appConfig", () => ({ useAppConfig: () => undefined }));

describe("regular lyric row spacing", () => {
    it.each([true, false])("honors mini lyric spacing (highlight=%s)", highlight => {
        let renderer!: TestRenderer.ReactTestRenderer;
        const onLayout = jest.fn();
        act(() => {
            renderer = TestRenderer.create(
                <LyricItemComponent
                    text="逐行歌词"
                    align="left"
                    highlight={highlight}
                    index={2}
                    onLayout={onLayout}
                    containerStyle={{ paddingHorizontal: 0, paddingVertical: 4 }}
                />,
            );
        });
        const row = renderer.root.findByType(View);
        expect(StyleSheet.flatten(row.props.style)).toMatchObject({
            paddingHorizontal: 0,
            paddingVertical: 4,
            width: "100%",
        });
        const textStyle = StyleSheet.flatten(renderer.root.findByType(Text).props.style);
        expect(textStyle.textAlign).toBe("left");
        expect(textStyle.paddingHorizontal ?? 0).toBe(0);
        expect(textStyle.paddingVertical ?? 0).toBe(0);
        act(() => {
            row.props.onLayout({ nativeEvent: { layout: { height: 42 } } });
        });
        expect(onLayout).toHaveBeenCalledWith(2, 42);
        act(() => renderer.unmount());
    });

    it("preserves default detail-page spacing and center alignment", () => {
        let renderer!: TestRenderer.ReactTestRenderer;
        act(() => {
            renderer = TestRenderer.create(<LyricItemComponent text="普通歌词" />);
        });
        expect(StyleSheet.flatten(renderer.root.findByType(View).props.style)).toMatchObject({
            paddingHorizontal: 64,
            paddingVertical: 24,
        });
        expect(StyleSheet.flatten(renderer.root.findByType(Text).props.style).textAlign).toBe("center");
        act(() => renderer.unmount());
    });
});
