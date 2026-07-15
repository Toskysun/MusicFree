import React from "react";
import { TouchableOpacity } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import PanelHeader from "./panelHeader";

jest.mock("@/components/base/themeText", () => "ThemeText");
jest.mock("@/components/base/divider", () => "Divider");
jest.mock("@/core/i18n", () => ({
    t: (key: string) => key,
}));
jest.mock("@/utils/rpx", () => (value: number) => value);

describe("PanelHeader", () => {
    it("uses React Native touch targets for Modal-hosted actions", () => {
        const onCancel = jest.fn();
        const onOk = jest.fn();
        let renderer: TestRenderer.ReactTestRenderer;

        act(() => {
            renderer = TestRenderer.create(
                <PanelHeader
                    title="Panel"
                    onCancel={onCancel}
                    onOk={onOk}
                />,
            );
        });

        const buttons = renderer!.root.findAllByType(TouchableOpacity);
        expect(buttons).toHaveLength(2);

        act(() => {
            buttons[0].props.onPress();
            buttons[1].props.onPress();
        });

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onOk).toHaveBeenCalledTimes(1);
    });
});
