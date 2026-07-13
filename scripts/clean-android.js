/**
 * Safe Android clean for RN New Architecture.
 *
 * `./gradlew clean` often fails on externalNativeBuildClean* because CMake
 * reconfigures while dependency codegen/jni dirs were already deleted:
 *   add_subdirectory(.../codegen/jni/) which is not an existing directory
 *
 * Manually remove build outputs instead — enough for a full rebuild.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const dirs = [
    "android/app/.cxx",
    "android/app/build",
    "android/build",
    // Stale RNTP classes can keep Job-return bytecode after source patches
    "node_modules/react-native-track-player/android/build",
];

let removed = 0;
for (const rel of dirs) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
        console.log(`[clean-android] skip (missing): ${rel}`);
        continue;
    }
    try {
        fs.rmSync(abs, { recursive: true, force: true });
        console.log(`[clean-android] removed: ${rel}`);
        removed++;
    } catch (err) {
        console.error(
            `[clean-android] failed: ${rel}`,
            err && err.message ? err.message : err,
        );
        process.exitCode = 1;
    }
}

console.log(`[clean-android] done (${removed} removed)`);
