import { useEffect, useRef } from "react";
import { devLog } from "@/utils/log";

export default function (msg?: string, deps: any[] = []) {
    const idRef = useRef<number | null>(null);
    useEffect(() => {
        idRef.current = Math.random();
        devLog("info", "🔄[组件调试] 组件挂载", { msg, id: idRef.current });
        return () => {
            devLog("info", "🗺[组件调试] 组件卸载", { msg, id: idRef.current });
        };
    }, [msg]);

    useEffect(() => {
        if (deps?.length !== 0) {
            devLog("info", "🔄[组件调试] 状态变化", { msg, id: idRef.current });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [msg, deps?.length, ...deps]);

    useEffect(() => {
        idRef.current && devLog("info", "🔁[组件调试] 重新渲染", { msg, id: idRef.current });
    });
}
