const {getDefaultConfig} = require('expo/metro-config');
const {mergeConfig} = require('@react-native/metro-config');

/**
 * Reference: https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md
 */
const defaultConfig = getDefaultConfig(__dirname);
const {assetExts, sourceExts} = defaultConfig.resolver;
/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
    transformer: {
        babelTransformerPath: require.resolve('react-native-svg-transformer'),
    },
    resolver: {
        assetExts: assetExts.filter(ext => ext !== 'svg'),
        sourceExts: [...sourceExts, 'svg'],
    },
    // Avoid Metro trying to read a non-existent file named "JavaScript" during symbolication
    // by dropping frames that don't point to a real path/extension.
    symbolicator: {
        customizeFrame: frame => {
            try {
                const f = frame?.file || '';
                // Drop frames with bogus names like 'JavaScript' that aren't paths.
                if (f && !f.includes('/') && !f.includes('\\') && !/\.(js|jsx|ts|tsx)$/.test(f)) {
                    return { ...frame, file: null, lineNumber: null, column: null };
                }
            } catch {}
            return frame;
        },
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
