import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import downloadNotificationManager from "@/core/downloadNotificationManager";
import notificationPermissionManager from "@/core/notificationPermissionManager";
import { errorLog, devLog } from "@/utils/log";

/**
 * 应用生命周期通知管理组件
 * 负责处理应用前后台切换时的通知系统状态
 */
export function useAppLifecycleNotifications() {
    const appState = useRef(AppState.currentState);

    useEffect(() => {
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            // 应用从后台回到前台时，重新检查权限状态
            if (appState.current.match(/inactive|background/) && nextAppState === "active") {
                handleAppBecomeActive();
            }
            
            // 应用进入后台时，可以进行清理操作
            if (appState.current === "active" && nextAppState.match(/inactive|background/)) {
                handleAppBecomeInactive();
            }

            appState.current = nextAppState;
        };

        const subscription = AppState.addEventListener("change", handleAppStateChange);

        return () => {
            subscription?.remove();
        };
    }, []);

    const handleAppBecomeActive = async (): Promise<void> => {
        try {
            // 当应用回到前台时，重新检查权限状态
            await notificationPermissionManager.resetPermissionState();
            
            // 如果用户在系统设置中启用了权限，确保通知管理器可以正常工作
            const hasPermission = await downloadNotificationManager.checkNotificationPermission();
            if (hasPermission) {
                // 权限已获得，可以记录日志或执行其他操作
                devLog("info", "🗿[通知管理] 通知权限已可用");
            }
        } catch (error) {
            errorLog("Error handling app become active", error);
        }
    };

    const handleAppBecomeInactive = async (): Promise<void> => {
        try {
            // 应用进入后台时，可以进行一些清理操作
            // 例如：暂停非必要的任务等
            devLog("info", "🔄[通知管理] 应用进入后台");
        } catch (error) {
            errorLog("Error handling app become inactive", error);
        }
    };
}

/**
 * 通知系统生命周期管理组件
 */
export function NotificationLifecycleManager() {
    useAppLifecycleNotifications();
    return null;
}