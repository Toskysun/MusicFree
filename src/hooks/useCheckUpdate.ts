import { showDialog } from "@/components/dialogs/useDialog";
import PersistStatus from "@/utils/persistStatus";
import checkUpdate from "@/utils/checkUpdate";
import Toast from "@/utils/toast";
import { compare } from "compare-versions";
import { useEffect } from "react";
import i18n from "@/core/i18n";
import { devLog } from "@/utils/log";

export const checkUpdateAndShowResult = (
    showToast = false,
    checkSkip = false,
) => {
    checkUpdate()
        .then(updateInfo => {
            if (updateInfo?.needUpdate) {
                const { data } = updateInfo;
                const skipVersion = PersistStatus.get("app.skipVersion");
                devLog("info", "🔄[更新检查] 检查版本更新", {
                    skipVersion,
                    newVersion: data.version,
                });
                if (
                    checkSkip &&
                    skipVersion &&
                    compare(skipVersion, data.version, ">=")
                ) {
                    return;
                }
                showDialog("DownloadDialog", {
                    version: data.version,
                    content: data.changeLog,
                    fromUrl: data.download?.[0],
                    backUrl: data.download?.[1],
                });
                return;
            }
            if (showToast) {
                Toast.success(i18n.t("checkUpdate.error.latestVersion"));
            }
        })
        .catch((error: any) => {
            devLog("warn", "⚠️[更新检查] 检查失败", {
                message: error?.message ?? String(error),
            });
            if (showToast) {
                Toast.warn(i18n.t("checkUpdate.error.cannotConnectToServer"));
            }
        });
};

export default function (callOnMount = true) {
    useEffect(() => {
        if (callOnMount) {
            checkUpdateAndShowResult(false, true);
        }
    }, [callOnMount]);

    return checkUpdateAndShowResult;
}
