module.exports = api => {
    const isProduction = api.env("production");
    const plugins = [
        [
            "module-resolver",
            {
                root: ["./"],
                alias: {
                    "^@/(.+)": "./src/\\1",
                    webdav: "webdav/dist/react-native",
                },
            },
        ],
    ];

    if (isProduction) {
        plugins.push("transform-remove-console");
    }

    // Reanimated must stay last in every environment, including production.
    plugins.push("react-native-reanimated/plugin");

    return {
        presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
        plugins,
    };
};