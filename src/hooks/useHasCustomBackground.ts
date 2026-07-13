import Theme from "@/core/theme";

/**
 * True when the page uses a wallpaper / custom background image.
 *
 * Previously required a non-preset theme id (`!p-*`), so users on p-dark/p-light
 * with a custom wallpaper still got hairline borders + black elevation rings.
 * Wallpaper alone is enough to treat chrome as "custom background".
 */
export default function useHasCustomBackground() {
    const background = Theme.useBackground();
    return !!background?.url;
}
