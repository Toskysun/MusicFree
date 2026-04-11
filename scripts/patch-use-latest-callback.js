const fs = require("fs");
const path = require("path");

const targetPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "use-latest-callback",
    "lib",
    "src",
    "index.js",
);

const compatLine = "module.exports.default = module.exports;";

if (!fs.existsSync(targetPath)) {
    console.log("[patch-use-latest-callback] target not found, skipping");
    process.exit(0);
}

const source = fs.readFileSync(targetPath, "utf8");

if (source.includes(compatLine)) {
    console.log("[patch-use-latest-callback] already patched");
    process.exit(0);
}

if (!source.includes("module.exports = useLatestCallback;")) {
    console.warn(
        "[patch-use-latest-callback] expected export line not found",
    );
    process.exit(0);
}

fs.writeFileSync(
    targetPath,
    source.replace(
        "module.exports = useLatestCallback;",
        `module.exports = useLatestCallback;\n${compatLine}`,
    ),
);

console.log("[patch-use-latest-callback] added default export compatibility");
