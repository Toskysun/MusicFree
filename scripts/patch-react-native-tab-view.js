const fs = require("fs");
const path = require("path");

const packageRoot = path.join(
    __dirname,
    "..",
    "node_modules",
    "react-native-tab-view",
);

const helperPath = path.join(packageRoot, "src", "useLatestCallbackCompat.ts");
const targets = [
    path.join(packageRoot, "src", "TabBar.tsx"),
    path.join(packageRoot, "src", "TabBarItem.tsx"),
];

const helperSource = `import * as React from 'react';

export default function useLatestCallbackCompat<T extends (...args: any[]) => any>(
  callback: T
): T {
  const callbackRef = React.useRef(callback);

  React.useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  return React.useRef(((...args: any[]) => callbackRef.current(...args)) as T).current;
}
`;

if (!fs.existsSync(packageRoot)) {
    console.log("[patch-tab-view] package not found, skipping");
    process.exit(0);
}

fs.writeFileSync(helperPath, helperSource);

for (const targetPath of targets) {
    if (!fs.existsSync(targetPath)) {
        console.warn(`[patch-tab-view] missing target: ${targetPath}`);
        continue;
    }

    const source = fs.readFileSync(targetPath, "utf8");
    const oldImport = "import useLatestCallback from 'use-latest-callback';";
    const newImport =
        "import useLatestCallback from './useLatestCallbackCompat';";

    if (source.includes(newImport)) {
        continue;
    }

    if (!source.includes(oldImport)) {
        console.warn(
            `[patch-tab-view] expected import not found in ${path.basename(targetPath)}`,
        );
        continue;
    }

    fs.writeFileSync(targetPath, source.replace(oldImport, newImport));
}

console.log("[patch-tab-view] patched react-native-tab-view useLatestCallback import");
