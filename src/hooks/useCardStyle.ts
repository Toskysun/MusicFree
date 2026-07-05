import { StyleSheet, ViewStyle } from "react-native";
import useColors from "@/hooks/useColors";
import useHasCustomBackground from "@/hooks/useHasCustomBackground";

interface ICardStyleOptions {
    borderWidth?: ViewStyle["borderWidth"];
    customBorderWidth?: ViewStyle["borderWidth"];
    elevation?: number;
    shadowOpacity?: number;
    shadowColor?: string;
}

export default function useCardStyle(options: ICardStyleOptions = {}): ViewStyle {
    const colors = useColors();
    const hasCustomBackground = useHasCustomBackground();

    return {
        borderWidth: hasCustomBackground
            ? options.customBorderWidth ?? StyleSheet.hairlineWidth
            : options.borderWidth,
        borderColor: colors.border,
        shadowColor: hasCustomBackground
            ? "transparent"
            : options.shadowColor ?? colors.shadow ?? "#000",
        shadowOpacity: hasCustomBackground
            ? 0
            : options.shadowOpacity ?? 0.08,
        elevation: hasCustomBackground ? 0 : options.elevation ?? 3,
    };
}
