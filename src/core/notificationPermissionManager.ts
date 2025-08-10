import { Platform, Alert, AppState, AppStateStatus } from "react-native";
import notifee from "@notifee/react-native";
import { errorLog } from "@/utils/log";
import Toast from "@/utils/toast";

interface PermissionState {
    hasPermission: boolean;
    canRequestPermission: boolean;
    lastRequestTime?: number;
    userDeniedPermanently?: boolean;
}

class NotificationPermissionManager {
    private permissionState: PermissionState = {
        hasPermission: false,
        canRequestPermission: true,
    };

    private readonly REQUEST_COOLDOWN = 5 * 60 * 1000; // 5分钟冷却时间
    private appStateSubscription: any = null;
    private lastCheckTime: number = 0;
    private readonly CHECK_INTERVAL = 30 * 1000; // 30秒检查一次权限状态

    constructor() {
        this.initializeAppStateListener();
    }

    /**
     * 初始化应用状态监听
     */
    private initializeAppStateListener(): void {
        if (Platform.OS !== "android") {
            return;
        }

        // 监听应用状态变化
        this.appStateSubscription = AppState.addEventListener(
            "change",
            this.handleAppStateChange.bind(this)
        );
    }

    /**
     * 处理应用状态变化
     */
    private handleAppStateChange(nextAppState: AppStateStatus): void {
        if (nextAppState === "active") {
            // 应用回到前台时，检查权限状态
            const now = Date.now();
            if (now - this.lastCheckTime > this.CHECK_INTERVAL) {
                this.refreshPermissionState();
                this.lastCheckTime = now;
            }
        }
    }

    /**
     * 刷新权限状态
     */
    private async refreshPermissionState(): Promise<void> {
        try {
            const settings = await notifee.getNotificationSettings();
            const hasPermission = settings.authorizationStatus >= 1;
            
            // 如果权限状态发生变化
            if (hasPermission !== this.permissionState.hasPermission) {
                this.permissionState.hasPermission = hasPermission;
                
                // 如果用户在系统设置中开启了权限
                if (hasPermission && this.permissionState.userDeniedPermanently) {
                    this.permissionState.userDeniedPermanently = false;
                    console.log("Notification permission granted in system settings");
                }
            }
        } catch (error) {
            errorLog("Failed to refresh permission state", error);
        }
    }

    /**
     * 检查通知权限状态
     */
    async checkPermission(): Promise<boolean> {
        if (Platform.OS !== "android") {
            this.permissionState.hasPermission = true;
            return true;
        }

        try {
            const settings = await notifee.getNotificationSettings();
            const hasPermission = settings.authorizationStatus >= 1; // AUTHORIZED or PROVISIONAL
            
            // 更新缓存状态
            if (hasPermission !== this.permissionState.hasPermission) {
                this.permissionState.hasPermission = hasPermission;
                
                // 如果用户在系统设置中开启了权限，清除永久拒绝标记
                if (hasPermission && this.permissionState.userDeniedPermanently) {
                    this.permissionState.userDeniedPermanently = false;
                }
            }
            
            return hasPermission;
        } catch (error) {
            errorLog("Failed to check notification permission", error);
            return false;
        }
    }

    /**
     * 请求通知权限（带有用户友好的提示）
     */
    async requestPermission(showRationale: boolean = true): Promise<boolean> {
        if (Platform.OS !== "android") {
            return true;
        }

        // 检查冷却时间
        if (this.permissionState.lastRequestTime) {
            const timeSinceLastRequest = Date.now() - this.permissionState.lastRequestTime;
            if (timeSinceLastRequest < this.REQUEST_COOLDOWN) {
                Toast.warn("请稍后再试，避免频繁请求权限");
                return false;
            }
        }

        try {
            // 如果用户已经永久拒绝，提供跳转设置的选项
            if (this.permissionState.userDeniedPermanently) {
                return this.showSettingsDialog();
            }

            // 显示权限说明（如果需要）
            if (showRationale) {
                const shouldRequest = await this.showPermissionRationale();
                if (!shouldRequest) {
                    return false;
                }
            }

            // 请求权限
            const result = await notifee.requestPermission();
            this.permissionState.lastRequestTime = Date.now();
            
            const hasPermission = result.authorizationStatus >= 1;
            this.permissionState.hasPermission = hasPermission;

            if (!hasPermission) {
                // 检查是否被永久拒绝
                if (result.authorizationStatus === 0) { // DENIED
                    this.permissionState.userDeniedPermanently = true;
                    this.showPermissionDeniedToast();
                }
            } else {
                Toast.success("通知权限已获取");
            }

            return hasPermission;
        } catch (error) {
            errorLog("Failed to request notification permission", error);
            Toast.error("请求通知权限失败");
            return false;
        }
    }

    /**
     * 显示权限说明对话框
     */
    private showPermissionRationale(): Promise<boolean> {
        return new Promise((resolve) => {
            Alert.alert(
                "通知权限",
                "MusicFree需要通知权限来显示下载进度和完成状态，这将帮助您更好地了解下载情况。",
                [
                    {
                        text: "暂不开启",
                        style: "cancel",
                        onPress: () => resolve(false),
                    },
                    {
                        text: "开启权限",
                        onPress: () => resolve(true),
                    },
                ],
                { cancelable: true, onDismiss: () => resolve(false) }
            );
        });
    }

    /**
     * 显示跳转设置的对话框
     */
    private showSettingsDialog(): Promise<boolean> {
        return new Promise((resolve) => {
            Alert.alert(
                "需要通知权限",
                "您之前拒绝了通知权限，请前往设置手动开启。",
                [
                    {
                        text: "取消",
                        style: "cancel",
                        onPress: () => resolve(false),
                    },
                    {
                        text: "前往设置",
                        onPress: () => {
                            notifee.openNotificationSettings();
                            resolve(false);
                        },
                    },
                ],
                { cancelable: true, onDismiss: () => resolve(false) }
            );
        });
    }

    /**
     * 显示权限被拒绝的提示
     */
    private showPermissionDeniedToast(): void {
        Toast.warn("下载通知已关闭，您仍可以正常下载音乐\n如需开启通知，请前往系统设置");
    }

    /**
     * 静默请求权限（用于应用启动时）
     */
    async silentRequestPermission(): Promise<boolean> {
        if (Platform.OS !== "android") {
            return true;
        }

        // 如果已经有权限，直接返回
        const hasPermission = await this.checkPermission();
        if (hasPermission) {
            return true;
        }

        // 如果用户已经永久拒绝，不再尝试请求
        if (this.permissionState.userDeniedPermanently) {
            // 静默模式下不显示提示
            return false;
        }

        try {
            const result = await notifee.requestPermission();
            const granted = result.authorizationStatus >= 1;
            
            this.permissionState.hasPermission = granted;
            
            if (!granted && result.authorizationStatus === 0) {
                this.permissionState.userDeniedPermanently = true;
            }

            return granted;
        } catch (error) {
            errorLog("Silent permission request failed", error);
            return false;
        }
    }

    /**
     * 重置权限状态（用于用户手动从设置开启权限后）
     */
    async resetPermissionState(): Promise<void> {
        this.permissionState = {
            hasPermission: false,
            canRequestPermission: true,
        };
        await this.checkPermission();
        this.lastCheckTime = Date.now();
    }

    /**
     * 获取当前权限状态
     */
    getPermissionState(): PermissionState {
        return { ...this.permissionState };
    }

    /**
     * 检查并提供权限状态的人类可读描述
     */
    async getPermissionStatusDescription(): Promise<string> {
        const hasPermission = await this.checkPermission();
        
        if (hasPermission) {
            return "通知权限已开启";
        }
        
        if (this.permissionState.userDeniedPermanently) {
            return "通知权限被拒绝，请前往系统设置开启";
        }
        
        return "通知权限未开启";
    }
    
    /**
     * 清理资源
     */
    cleanup(): void {
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
    }
}

// 单例模式
const notificationPermissionManager = new NotificationPermissionManager();
export default notificationPermissionManager;