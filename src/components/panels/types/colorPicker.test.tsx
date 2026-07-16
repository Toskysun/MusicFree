import React from "react";
import { TextInput } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import ColorPicker from "./colorPicker";

type TestGesture = {
    start?: (event: { x: number; y: number }) => void;
    update?: (event: { x: number; y: number }) => void;
    gestures?: TestGesture[];
    onStart: (callback: TestGesture["start"]) => TestGesture;
    onUpdate: (callback: TestGesture["update"]) => TestGesture;
    runOnJS: () => TestGesture;
};

const createGesture = (): TestGesture => {
    const gesture: TestGesture = {
        onStart(callback) {
            gesture.start = callback;
            return gesture;
        },
        onUpdate(callback) {
            gesture.update = callback;
            return gesture;
        },
        runOnJS() {
            return gesture;
        },
    };
    return gesture;
};

jest.mock("react-native-gesture-handler", () => {
    const ReactModule = require("react");

    return {
        Gesture: {
            Tap: createGesture,
            Pan: createGesture,
            Race: (...gestures: TestGesture[]) => ({ gestures }),
        },
        GestureDetector: ({ children, gesture }: {
            children: React.ReactNode;
            gesture: TestGesture;
        }) => ReactModule.createElement(
            "GestureDetector",
            { gesture },
            children,
        ),
        GestureHandlerRootView: ({ children, style }: {
            children: React.ReactNode;
            style: object;
        }) => ReactModule.createElement(
            "GestureHandlerRootView",
            { style },
            children,
        ),
    };
});
jest.mock("../base/panelBase", () => ({ renderBody }: {
    renderBody: () => React.ReactNode;
}) => renderBody());
jest.mock("../base/panelHeader", () => "PanelHeader");
jest.mock("react-native-linear-gradient", () => "LinearGradient");
jest.mock("@/constants/assetsConst", () => ({
    ImgAsset: { transparentBg: 1 },
}));
jest.mock("@/core/i18n", () => ({
    useI18N: () => ({ t: (key: string) => key }),
}));
jest.mock("../usePanel", () => ({ hidePanel: jest.fn() }));
jest.mock("@/utils/rpx", () => ({
    __esModule: true,
    default: (value: number) => value,
    fontRpx: (value: number) => value,
}));

describe("ColorPicker", () => {
    it("hosts picker gestures in the Modal window and updates from touch", () => {
        let renderer: TestRenderer.ReactTestRenderer;

        act(() => {
            renderer = TestRenderer.create(
                <ColorPicker defaultColor="#FF0000FF" />,
            );
        });

        expect(
            renderer!.root.findAllByType("GestureHandlerRootView" as any),
        ).toHaveLength(1);

        const detectors = renderer!.root.findAllByType("GestureDetector" as any);
        const colorInput = () => renderer!.root.findByType(TextInput);
        expect(colorInput().props.value).toBe("#FF0000FF");

        act(() => {
            detectors[1].props.gesture.gestures[1].update({ x: 0, y: 210 });
        });
        expect(colorInput().props.value).toBe("#00FFFFFF");

        act(() => {
            detectors[0].props.gesture.gestures[0].start({ x: 0, y: 210 });
        });
        expect(colorInput().props.value).toBe("#808080FF");

        act(() => {
            renderer!.unmount();
        });
    });
});
