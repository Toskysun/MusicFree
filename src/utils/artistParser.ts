/**
 * 解析歌手字符串，支持多种分隔符
 * @param artistString 歌手字符串，可能包含多个歌手
 * @returns 歌手名称数组
 */
export function parseArtists(artistString: string | undefined | null): string[] {
    if (!artistString) {
        return [];
    }

    // 支持的分隔符: /, ,, &, 、, feat., Feat., ft., Ft.
    const separatorRegex = /[\/,&、]|\s+feat\.\s*|\s+Feat\.\s*|\s+ft\.\s*|\s+Ft\.\s*/i;

    const artists = artistString
        .split(separatorRegex)
        .map(name => name.trim())
        .filter(name => name.length > 0);

    return artists;
}

/**
 * 判断是否为多歌手
 * @param artistString 歌手字符串
 * @returns 是否包含多个歌手
 */
export function hasMultipleArtists(artistString: string | undefined | null): boolean {
    return parseArtists(artistString).length > 1;
}
