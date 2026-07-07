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

    it("keeps credit romanization out of parallel lyric merging", () => {
        const parser = new LyricParser(
            [
                "[00:00.00]Shi: Nana",
                "[00:00.00]词: Nana",
                "[00:00.00]kimi no na wa",
                "[00:00.00]君の名は",
                "[00:00.00]你的名字",
            ].join("\n"),
        );

        const items = parser.getLyricItems();

        expect(items).toHaveLength(2);
        expect(items[0].lrc).toBe("词: Nana");
        expect(items[0].romanization).toBe("Shi: Nana");
        expect(items[0].translation).toBeUndefined();
        expect(items[1].lrc).toBe("君の名は");
        expect(items[1].romanization).toBe("kimi no na wa");
        expect(items[1].translation).toBe("你的名字");
    });

    it("skips credit romanization lines from secondary lyric input", () => {
        const parser = new LyricParser(
            [
                "[00:00.00]词: Nana",
                "[00:10.00]君の名は",
                "[00:15.00]空へ",
            ].join("\n"),
            {
                romanization: [
                    "[00:00.00]Shi: Nana",
                    "[00:10.00]kimi no na wa",
                    "[00:15.00]sora e",
                ].join("\n"),
                translation: [
                    "[00:10.00]你的名字",
                    "[00:15.00]去往天空",
                ].join("\n"),
            },
        );

        const items = parser.getLyricItems();

        expect(items[0].lrc).toBe("词: Nana");
        expect(items[0].romanization).toBeUndefined();
        expect(items[1].romanization).toBe("kimi no na wa");
        expect(items[1].translation).toBe("你的名字");
        expect(items[2].romanization).toBe("sora e");
        expect(items[2].translation).toBe("去往天空");
    });

    it("normalizes escaped newline lyric text before parsing", () => {
        const parser = new LyricParser("[00:01.00]first\\n[00:02.00]second");
        const items = parser.getLyricItems();

        expect(items).toHaveLength(2);
        expect(items[0].lrc).toBe("first");
        expect(items[1].lrc).toBe("second");
    });

    it("parses postfix qrc word timing with optional third field", () => {
        const parser = new LyricParser("[10000,1000](0,500,0)君(500,500,0)名");
        const [item] = parser.getLyricItems();

        expect(item.lrc).toBe("君名");
        expect(item.hasWordByWord).toBe(true);
        expect(item.words?.[0].startTime).toBe(10000);
        expect(item.words?.[1].startTime).toBe(10500);
    });

    it("parses inline word timing lrc", () => {
        const parser = new LyricParser("[00:10.000]君(0,500)名(500,500)");
        const [item] = parser.getLyricItems();

        expect(item.lrc).toBe("君名");
        expect(item.hasWordByWord).toBe(true);
        expect(item.words?.[0].startTime).toBe(10000);
        expect(item.words?.[1].startTime).toBe(10500);
    });

    it("supports relative angle-bracket word timing", () => {
        const parser = new LyricParser("[00:10.000]<00:00.000>君<00:00.500>名<00:01.000>");
        const [item] = parser.getLyricItems();

        expect(item.lrc).toBe("君名");
        expect(item.hasWordByWord).toBe(true);
        expect(item.words?.[0].startTime).toBe(10000);
        expect(item.words?.[1].startTime).toBe(10500);
    });
});
