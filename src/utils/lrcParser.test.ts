import { describe, expect, it } from "@jest/globals";
import LyricParser from "./lrcParser";

describe("LyricParser", () => {
    it("collapses parallel romanization, original, and translation lines", () => {
        const parser = new LyricParser(
            [
                "[00:10.00]kimi no na wa",
                "[00:10.00]君の名は",
                "[00:10.00]你的名字",
                "[00:15.00]sora e",
                "[00:15.00]空へ",
                "[00:15.00]去往天空",
            ].join("\n"),
        );

        const items = parser.getLyricItems();

        expect(parser.hasRomanization).toBe(true);
        expect(parser.hasTranslation).toBe(true);
        expect(items).toHaveLength(2);
        expect(items[0].lrc).toBe("君の名は");
        expect(items[0].romanization).toBe("kimi no na wa");
        expect(items[0].translation).toBe("你的名字");
        expect(items[1].lrc).toBe("空へ");
        expect(items[1].romanization).toBe("sora e");
        expect(items[1].translation).toBe("去往天空");
    });

    it("keeps word timings from parallel romanization lines", () => {
        const parser = new LyricParser(
            [
                "[00:10.00]<00:10.00>ki<00:10.20>mi<00:10.40>",
                "[00:10.00]君",
                "[00:10.00]你",
            ].join("\n"),
        );

        const [item] = parser.getLyricItems();

        expect(item.lrc).toBe("君");
        expect(item.romanization).toBe("kimi");
        expect(item.romanizationWords).toHaveLength(2);
        expect(item.hasRomanizationWordByWord).toBe(true);
        expect(item.translation).toBe("你");
    });

    it("classifies romanization when original line comes first", () => {
        const parser = new LyricParser(
            [
                "[00:10.00]君の名は",
                "[00:10.00]kimi no na wa",
                "[00:10.00]你的名字",
            ].join("\n"),
        );

        const [item] = parser.getLyricItems();

        expect(parser.hasRomanization).toBe(true);
        expect(parser.hasTranslation).toBe(true);
        expect(item.lrc).toBe("君の名は");
        expect(item.romanization).toBe("kimi no na wa");
        expect(item.translation).toBe("你的名字");
    });
});
