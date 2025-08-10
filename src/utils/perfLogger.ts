import { devLog } from "@/utils/log";

export interface IPerfLogger {
    mark: (label?: string) => void;
}

export function perfLogger(): IPerfLogger {
    const s = Date.now();

    return {
        mark(label?: string) {
            const elapsedTime = Date.now() - s;
            devLog("info", "⏱️[性能监控] 性能标记", { label: label || "log", elapsedTime: `${elapsedTime}ms` });
        },
    };
}
