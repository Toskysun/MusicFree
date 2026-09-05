import { DeviceEventEmitter } from "react-native";
import { GlobalState } from "@/utils/stateMapper";
import { panelInfoStore } from "@/components/panels/usePanel";

export interface IMvPlayerPayload {
    musicItem: IMusic.IMusicItem;
    initialSource?: IPlugin.IVideoSourceResult;
}

/** 独立于通用底栏面板的 MV 窗口状态。 */
export const mvPlayerStore = new GlobalState<IMvPlayerPayload | null>(null);

export function showMvPlayer(payload: IMvPlayerPayload) {
    // Close an open bottom sheet first. The callback runs after its Modal has
    // finished closing, so two native windows are never raced during Fabric
    // mount/unmount.
    if (panelInfoStore.getValue().name) {
        DeviceEventEmitter.emit("hidePanel", () => {
            // The generic panel switch callback intentionally skips the
            // intermediate null state. MV is a separate host, so clear the
            // old sheet explicitly before mounting its native Modal.
            panelInfoStore.setValue({ name: null, payload: null });
            mvPlayerStore.setValue(payload);
        });
        return;
    }
    mvPlayerStore.setValue(payload);
}

/** Request the MV modal to run its exit animation. */
export function hideMvPlayer() {
    DeviceEventEmitter.emit("hideMvPlayer");
}
