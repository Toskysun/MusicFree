import Theme from "@/core/theme";

export default function useHasCustomBackground() {
    const theme = Theme.useTheme();
    const background = Theme.useBackground();

    return !theme.id.startsWith("p-") && !!background?.url;
}
