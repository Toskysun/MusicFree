import { DeviceEventEmitter } from "react-native";
import {
    hideMvPlayer,
    type IMvPlayerPayload,
    mvPlayerStore,
    showMvPlayer,
} from "./useMvPlayer";
import { panelInfoStore } from "@/components/panels/usePanel";

jest.mock("@/components/panels/usePanel", () => ({
    panelInfoStore: {
        getValue: jest.fn(),
        setValue: jest.fn(),
    },
}));

describe("MV player host state", () => {
    const payload = {
        musicItem: { title: "MV", artist: "Artist" },
    } as IMvPlayerPayload;

    let emitSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        mvPlayerStore.setValue(null);
        emitSpy = jest.spyOn(DeviceEventEmitter, "emit");
    });

    afterEach(() => {
        emitSpy.mockRestore();
    });

    it("mounts directly when no generic panel is open", () => {
        (panelInfoStore.getValue as jest.Mock).mockReturnValue({ name: null });

        showMvPlayer(payload);

        expect(mvPlayerStore.getValue()).toBe(payload);
        expect(emitSpy).not.toHaveBeenCalledWith(
            "hidePanel",
            expect.any(Function),
        );
    });

    it("clears the generic panel before mounting after its close callback", () => {
        (panelInfoStore.getValue as jest.Mock).mockReturnValue({
            name: "MusicItemOptions",
        });

        showMvPlayer(payload);

        const callback = emitSpy.mock.calls.find(
            ([eventName]) => eventName === "hidePanel",
        )?.[1] as (() => void) | undefined;
        expect(callback).toBeDefined();
        callback?.();

        expect(panelInfoStore.setValue).toHaveBeenCalledWith({
            name: null,
            payload: null,
        });
        expect(mvPlayerStore.getValue()).toBe(payload);
    });

    it("uses a dedicated close event", () => {
        hideMvPlayer();

        expect(emitSpy).toHaveBeenCalledWith("hideMvPlayer");
    });
});
