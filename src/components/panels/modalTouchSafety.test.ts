import fs from "fs";
import path from "path";

const APPROVED_RNGH_IMPORTS = new Set([
    "FlatList",
    "Gesture",
    "GestureDetector",
    "GestureHandlerRootView",
    "ScrollView",
]);

const SHARED_MODAL_CONTROLS = [
    path.resolve(__dirname, "../base/checkbox.tsx"),
    path.resolve(__dirname, "../base/listFooter.tsx"),
];

function getSourceFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return getSourceFiles(target);
        }
        if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
            return [];
        }
        return [target];
    });
}

function getRnghImports(source: string): string[] {
    const imports: string[] = [];
    const importPattern =
        /import\s*{([^}]*)}\s*from\s*["']react-native-gesture-handler["']/gs;
    let match: RegExpExecArray | null;

    while ((match = importPattern.exec(source)) !== null) {
        match[1].split(",").forEach(importName => {
            const normalized = importName.trim().split(/\s+as\s+/)[0];
            if (normalized) {
                imports.push(normalized);
            }
        });
    }

    return imports;
}

describe("Modal panel touch safety", () => {
    it("uses RN responders or explicitly approved RNGH APIs", () => {
        const panelFiles = getSourceFiles(path.resolve(__dirname, "types"));
        const violations: string[] = [];

        [...panelFiles, ...SHARED_MODAL_CONTROLS].forEach(file => {
            const source = fs.readFileSync(file, "utf8");
            const rnghImports = getRnghImports(source);
            const unsupported = rnghImports.filter(
                importName => !APPROVED_RNGH_IMPORTS.has(importName),
            );

            if (unsupported.length > 0) {
                violations.push(
                    `${path.relative(__dirname, file)}: ${unsupported.join(", ")}`,
                );
            }

            if (
                rnghImports.includes("GestureDetector") &&
                !rnghImports.includes("GestureHandlerRootView")
            ) {
                violations.push(
                    `${path.relative(__dirname, file)}: GestureDetector without Modal-local root`,
                );
            }
        });

        expect(violations).toEqual([]);
    });
});
