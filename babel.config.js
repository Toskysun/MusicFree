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

    // babel-preset-expo already injects worklets/reanimated plugins.
    // Only keep custom plugins here to avoid duplicate-plugin errors in Jest.

    return {
        presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
        plugins,
    };
};