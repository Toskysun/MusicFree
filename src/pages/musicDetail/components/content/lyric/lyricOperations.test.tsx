import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import LyricOperations from "./lyricOperations";

const mockCurrentMusic = {
    id: "song-1",
    platform: "test",
    title: "Song",
};
const mockHidePanel = jest.fn();
const mockShowPanel = jest.fn();
const mockUpdateLyricOffset = jest.fn(async () => ({ index: 4 }));

jest.mock("@/constants/uiConst", () => ({
    iconSizeConst: { normal: 42 },
}));
jest.mock("@/assets/icons/translation.svg", () => "TranslationIcon");
jest.mock("@/assets/icons/language.svg", () => "LanguageIcon");
jest.mock("@/core/appConfig", () => ({
    __esModule: true,
    default: { setConfig: jest.fn() },
    useAppConfig: () => undefined,
}));
jest.mock("@/hooks/useColors", () => () => ({ primary: "#fff" }));
jest.mock("@/utils/toast", () => ({
    __esModule: true,
    default: { warn: jest.fn() },
}));
jest.mock("@/components/panels/usePanel", () => ({
    hidePanel: () => mockHidePanel(),
    showPanel: (...args: unknown[]) => mockShowPanel(...args),
}));
jest.mock("@/core/trackPlayer", () => ({
    __esModule: true,
    get default() {
        return { currentMusic: mockCurrentMusic };
    },
}));
jest.mock("@/utils/persistStatus", () => ({
    __esModule: true,
    default: {
        useValue: (_key: string, fallback: unknown) => fallback,
    },
}));
jest.mock("@/components/base/icon.tsx", () => "Icon");
jest.mock("@/core/lyricManager", () => ({
    __esModule: true,
    get default() {
        return { updateLyricOffset: mockUpdateLyricOffset };
    },
    useLyricState: () => ({
        hasTranslation: false,
        hasRomanization: false,
    }),
}));
jest.mock("@/utils/log", () => ({ devLog: jest.fn() }));
jest.mock("@/utils/rpx", () => ({
    __esModule: true,
    default: (value: number) => value,
}));

describe("LyricOperations", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("requests the refreshed current line before closing the offset panel", async () => {
        const scrollToCurrentLrcItem = jest.fn();
        let renderer: TestRenderer.ReactTestRenderer;

        act(() => {
            renderer = TestRenderer.create(
                <LyricOperations
                    scrollToCurrentLrcItem={scrollToCurrentLrcItem}
                />,
            );
        });

        const offsetButton = renderer!.root
            .findAllByType("Icon" as any)
            .find(node => node.props.name === "arrows-left-right");
        expect(offsetButton).toBeDefined();

        act(() => {
            offsetButton!.props.onPress();
        });

        const panelPayload = mockShowPanel.mock.calls[0][1];
        await act(async () => {
            await panelPayload.onSubmit(0.2);
        });

        expect(mockUpdateLyricOffset).toHaveBeenCalledWith(
            mockCurrentMusic,
            0.2,
        );
        expect(mockHidePanel).toHaveBeenCalledTimes(1);
        expect(scrollToCurrentLrcItem).toHaveBeenCalledWith(4);

        act(() => {
            renderer!.unmount();
        });
    });
});
