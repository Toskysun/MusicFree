import { fileAsyncTransport, logger } from "react-native-logs";
import RNFS, { readDir, readFile } from "react-native-fs";
import pathConst from "@/constants/pathConst";
import Config from "../core/appConfig.ts";
import { addLog, traceLog } from "@/lib/react-native-vdebug/src/log";

// 初始化日志堆栈，防止 addLog 调用时出现 null 错误
traceLog();

const config = {
    transport: fileAsyncTransport,
    transportOptions: {
        FS: RNFS,
        filePath: pathConst.logPath,
        fileName: "error-log-{date-today}.log",
    },
    dateFormat: "local",
};

const traceConfig = {
    transport: fileAsyncTransport,
    transportOptions: {
        FS: RNFS,
        filePath: pathConst.logPath,
        fileName: "trace-log.log",
    },
    dateFormat: "local",
};

const log = logger.createLogger(config);
const traceLogger = logger.createLogger(traceConfig);
const startupBreadcrumbFile = `${pathConst.logPath}startup-breadcrumb.log`;

let startupSessionId = `${Date.now()}`;

function safeSerialize(value: any) {
    if (value === undefined) {
        return undefined;
    }

    try {
        return JSON.stringify(value);
    } catch {
        return JSON.stringify(String(value));
    }
}

export async function markStartupSession(label = "app-launch") {
    startupSessionId = `${Date.now()}`;
    await appendStartupBreadcrumb(label, {
        sessionId: startupSessionId,
    });
}

export async function appendStartupBreadcrumb(step: string, details?: any) {
    try {
        await RNFS.mkdir(pathConst.logPath);
        const payload = {
            ts: new Date().toISOString(),
            sessionId: startupSessionId,
            step,
            details,
        };
        await RNFS.appendFile(startupBreadcrumbFile, `${safeSerialize(payload)}\n`, "utf8");
    } catch {
    }
}

export async function getStartupBreadcrumbContent() {
    try {
        if (!(await RNFS.exists(startupBreadcrumbFile))) {
            return "";
        }
        return await readFile(startupBreadcrumbFile, "utf8");
    } catch {
        return "";
    }
}

export function trace(
    desc: string,
    message?: any,
    level: "info" | "error" = "info",
) {
    if (__DEV__) {
        console.log(desc, message);
    }
    // 特殊情况记录操作路径
    if (Config.getConfig("debug.traceLog")) {
        traceLogger[level]({
            desc,
            message,
        });
    }
}

export async function clearLog() {
    const files = await RNFS.readDir(pathConst.logPath);
    await Promise.all(
        files.map(async file => {
            if (file.isFile()) {
                try {
                    await RNFS.unlink(file.path);
                } catch {}
            }
        }),
    );
}

export async function getErrorLogContent() {
    try {
        const files = await readDir(pathConst.logPath);
        devLog("info", "📁[日志工具] 读取日志文件列表", { filesCount: files.length });
        const today = new Date();
        // 两天的错误日志
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const todayLog = files.find(
            _ =>
                _.isFile() &&
                _.path.endsWith(
                    `error-log-${today.getDate()}-${
                        today.getMonth() + 1
                    }-${today.getFullYear()}.log`,
                ),
        );
        const yesterdayLog = files.find(
            _ =>
                _.isFile() &&
                _.path.endsWith(
                    `error-log-${yesterday.getDate()}-${
                        yesterday.getMonth() + 1
                    }-${yesterday.getFullYear()}.log`,
                ),
        );
        let logContent = "";
        if (todayLog) {
            logContent += await readFile(todayLog.path, "utf8");
        }
        if (yesterdayLog) {
            logContent += await readFile(yesterdayLog.path, "utf8");
        }
        return logContent;
    } catch {
        return "";
    }
}

export function errorLog(desc: string, message: any) {
    if (Config.getConfig("debug.errorLog")) {
        log.error({
            desc,
            message,
        });
        trace(desc, message, "error");
    }
}

export function devLog(
    method: "log" | "error" | "warn" | "info",
    ...args: any[]
) {
    if (Config.getConfig("debug.devLog")) {
        addLog(method, args);
    }
}

export { log };
