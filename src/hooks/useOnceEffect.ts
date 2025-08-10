import { useEffect, useRef } from "react";

export default function useOnceEffect(
    cb: () => (() => void) | void,
    deps?: any[],
) {
    const flag = useRef<boolean>(false);

    useEffect(() => {
        let result;
        if (flag.current) {
            return result;
        }
        if (!deps || deps.every(_ => !!_)) {
            flag.current = true;
            result = cb();
        }
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cb, deps?.length, ...(deps || [])]);
}
