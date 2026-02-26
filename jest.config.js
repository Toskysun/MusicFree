module.exports = {
    preset: "react-native",
    roots: ["<rootDir>/src"],
    setupFiles: ["<rootDir>/jest.setup.js"],
    testMatch: ["**/?(*.)+(test).[jt]s?(x)"],
    modulePathIgnorePatterns: ["<rootDir>/.claude/"],
    testPathIgnorePatterns: ["<rootDir>/.claude/"],
    transformIgnorePatterns: [
        "node_modules/(?!(?:@react-native|react-native|react-native-fs|@react-navigation)/)",
    ],
};
