import { useEffect, useRef } from "react";
import { BackHandler, NativeEventSubscription } from "react-native";

export default function (
    onHardwareBackPress: () => boolean | null | undefined,
    deps: any[] = [],
) {
    const backHandlerRef = useRef<NativeEventSubscription | null>(null);
    useEffect(() => {
        if (backHandlerRef.current) {
            backHandlerRef.current.remove();
            backHandlerRef.current = null;
        }

        backHandlerRef.current = BackHandler.addEventListener(
            "hardwareBackPress",
            onHardwareBackPress,
        );

        return () => {
            if (backHandlerRef.current) {
                backHandlerRef.current.remove();
                backHandlerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onHardwareBackPress, ...deps]);
}
