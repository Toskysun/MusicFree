import { ViewStyle } from "react-native";
import useColors from "@/hooks/useColors";
import useHasCustomBackground from "@/hooks/useHasCustomBackground";

interface ICardStyleOptions {
    borderWidth?: ViewStyle["borderWidth"];
    /** Border when a custom page background is active. Defaults to 0 (no outer ring). */
    customBorderWidth?: ViewStyle["borderWidth"];
    elevation?: number;
    shadowOpacity?: number;
    shadowColor?: string;
}

/**
 * Card chrome that adapts to custom wallpaper themes.
 *
 * On custom backgrounds we previously forced a hairline border to replace
 * elevation shadows; that read as an extra black/dark ring around inputs and
 * dialogs. Default is now no border; pass customBorderWidth if a stroke is needed.
 */
export default function useCardStyle(
    options: ICardStyleOptions = {},
): ViewStyle {
    const colors = useColors();
    const hasCustomBackground = useHasCustomBackground();

    if (hasCustomBackground) {
        return {
            borderWidth: options.customBorderWidth ?? 0,
            borderColor: "transparent",
            shadowColor: "transparent",
            shadowOpacity: 0,
            elevation: 0,
        };
    }

    return {
        borderWidth: options.borderWidth,
        borderColor: colors.border,
        shadowColor: options.shadowColor ?? colors.shadow ?? "#000",
        shadowOpacity: options.shadowOpacity ?? 0.08,
        elevation: options.elevation ?? 3,
    };
}
