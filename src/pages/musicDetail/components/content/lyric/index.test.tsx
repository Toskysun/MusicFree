import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import Lyric from "./index";

const mockScrollToOffset = jest.fn();
const mockScrollToIndex = jest.fn();
const mockTrackPlayer = {
    currentMusic: {
        id: "song-1",
        platform: "test",
        title: "Song",
    },
    play: jest.fn(async () => undefined),
    seekTo: jest.fn(async () => undefined),
};
const mockLyrics = Array.from({ length: 8 }, (_, index) => ({
    index,
    lrc: `Line ${index}`,
    time: index * 10,
}));
const mockCurrentLyric = mockLyrics[1];
const mockLyricManager = {
    currentLyricItem: mockCurrentLyric,
    syncAfterSeek: jest.fn(),
    unassociateLyric: jest.fn(),
};

jest.mock("react-native-gesture-handler", () => {
    const ReactModule = require("react");

    return {
        FlatList: ReactModule.forwardRef((props: object, ref: React.Ref<unknown>) => {
            ReactModule.useImperativeHandle(ref, () => ({
                scrollToIndex: mockScrollToIndex,
                scrollToOffset: mockScrollToOffset,
            }));
            return ReactModule.createElement("FlatList", props);
        }),
        Gesture: {
            Tap: () => {
                const gesture = {
                    onStart: () => gesture,
                    runOnJS: () => gesture,
                };
                return gesture;
            },
        },
        GestureDetector: ({ children }: { children: React.ReactNode }) => children,
        TapGestureHandler: ({ children }: { children: React.ReactNode }) => children,
    };
});
jest.mock("@/utils/rpx", () => ({
    __esModule: true,
    default: (value: number) => value,
}));
jest.mock("@/components/base/loading", () => "Loading");
jest.mock("@/constants/globalStyle", () => ({
    fwflex1: {},
    fullCenter: {},
}));
jest.mock("@/components/panels/usePanel", () => ({ showPanel: jest.fn() }));
jest.mock("@/core/trackPlayer", () => ({
    __esModule: true,
    get default() {
        return mockTrackPlayer;
    },
    useCurrentMusic: () => mockTrackPlayer.currentMusic,
    useMusicState: () => "playing",
}));
jest.mock("@/utils/trackUtils", () => ({ musicIsPaused: () => false }));
jest.mock("./draggingTime", () => "DraggingTime");
jest.mock("./lyricItem", () => "LyricItem");
jest.mock("@/utils/persistStatus", () => ({
    __esModule: true,
    default: {
        useValue: (_key: string, fallback: unknown) => fallback,
    },
}));
jest.mock("./lyricOperations", () => "LyricOperations");
jest.mock("@/components/base/iconButton.tsx", () => ({
    IconButtonWithGesture: "IconButtonWithGesture",
}));
jest.mock("@/utils/mediaExtra", () => ({
    getMediaExtraProperty: () => undefined,
}));
jest.mock("@/core/lyricManager", () => ({
    __esModule: true,
    get default() {
        return mockLyricManager;
    },
    useCurrentLyricItem: () => mockCurrentLyric,
    useLyricState: () => ({
        loading: false,
        meta: { offset: "0" },
        lyrics: mockLyrics,
        hasTranslation: false,
        hasRomanization: false,
    }),
}));
jest.mock("@/core/i18n", () => ({
    useI18N: () => ({ t: (key: string) => key }),
}));
jest.mock("@/core/appConfig", () => ({ useAppConfig: () => undefined }));
jest.mock("@/utils/log", () => ({ devLog: jest.fn() }));
jest.mock("../albumCover/songInfo", () => "SongInfo");
jest.mock("@/hooks/useOrientation", () => () => "vertical");

describe("Lyric progress seek", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("keeps the selected lyric centered instead of resetting to the start", async () => {
        let renderer: TestRenderer.ReactTestRenderer;

        act(() => {
            renderer = TestRenderer.create(<Lyric />);
        });

        const list = renderer!.root.findByType("FlatList" as any);
        expect(list.props.contentOffset).toBeUndefined();

        act(() => {
            list.props.onLayout({
                nativeEvent: {
                    layout: { x: 0, y: 0, width: 400, height: 400 },
                },
            });
            list.props.onScrollBeginDrag();
            list.props.onScroll({
                nativeEvent: {
                    contentOffset: { y: 169 },
                    layoutMeasurement: { height: 400 },
                },
            });
        });

        const seekButton = renderer!.root.findByType(
            "IconButtonWithGesture" as any,
        );
        mockScrollToOffset.mockClear();
        await act(async () => {
            await seekButton.props.onPress();
        });

        expect(mockTrackPlayer.seekTo).toHaveBeenCalledWith(40);
        expect(mockTrackPlayer.play).toHaveBeenCalledTimes(1);
        expect(mockLyricManager.syncAfterSeek).toHaveBeenCalledWith(40, true);
        expect(mockScrollToOffset).toHaveBeenCalledWith({
            animated: true,
            offset: 214,
        });
        expect(mockScrollToOffset).not.toHaveBeenCalledWith(
            expect.objectContaining({ offset: 0 }),
        );

        act(() => {
            renderer!.unmount();
            jest.runOnlyPendingTimers();
        });
    });

    it("does not expose lyric seek controls for programmatic momentum", () => {
        let renderer: TestRenderer.ReactTestRenderer;

        act(() => {
            renderer = TestRenderer.create(<Lyric />);
        });

        const list = renderer!.root.findByType("FlatList" as any);
        act(() => {
            list.props.onMomentumScrollBegin();
            list.props.onScroll({
                nativeEvent: {
                    contentOffset: { y: 300 },
                    layoutMeasurement: { height: 400 },
                },
            });
            list.props.onMomentumScrollEnd();
        });

        expect(
            renderer!.root.findAllByType("IconButtonWithGesture" as any),
        ).toHaveLength(0);

        act(() => {
            renderer!.unmount();
            jest.runOnlyPendingTimers();
        });
    });

    it("centers an operation request on its explicit lyric index", () => {
        let renderer: TestRenderer.ReactTestRenderer;

        act(() => {
            renderer = TestRenderer.create(<Lyric />);
        });

        const list = renderer!.root.findByType("FlatList" as any);
        act(() => {
            list.props.onLayout({
                nativeEvent: {
                    layout: { x: 0, y: 0, width: 400, height: 400 },
                },
            });
        });

        const operations = renderer!.root.findByType("LyricOperations" as any);
        mockScrollToOffset.mockClear();
        act(() => {
            operations.props.scrollToCurrentLrcItem(4);
        });

        expect(mockScrollToOffset).toHaveBeenCalledWith({
            animated: true,
            offset: 214,
        });

        act(() => {
            renderer!.unmount();
            jest.runOnlyPendingTimers();
        });
    });
});
