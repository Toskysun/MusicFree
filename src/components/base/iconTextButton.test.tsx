import React from "react";
import { TouchableOpacity } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import IconTextButton from "./iconTextButton";

jest.mock("./themeText", () => "ThemeText");
jest.mock("@/components/base/icon.tsx", () => "Icon");
jest.mock("@/hooks/useColors", () => () => ({ text: "#fff" }));
jest.mock("@/utils/rpx", () => ({
    __esModule: true,
    default: (value: number) => value,
    fontRpx: (value: number) => value,
    fontRpxRound: (value: number) => value,
}));

describe("IconTextButton", () => {
    it("uses a React Native touch target that works inside Modal panels", () => {
        const onPress = jest.fn();
        let renderer: TestRenderer.ReactTestRenderer;

        act(() => {
            renderer = TestRenderer.create(
                <IconTextButton icon="trash-outline" onPress={onPress}>
                    Clear
                </IconTextButton>,
            );
        });

        const button = renderer!.root.findByType(TouchableOpacity);
        act(() => {
            button.props.onPress();
        });

        expect(onPress).toHaveBeenCalledTimes(1);
    });
});
