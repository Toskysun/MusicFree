const { FlatCompat } = require("@eslint/eslintrc");
const js = require("@eslint/js");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

module.exports = [
    // 忽略配置
    {
        ignores: [
            "node_modules/**",
            "android/**",
            "ios/**",
            "build/**",
            "dist/**",
            ".expo/**",
            "coverage/**",
            "*.config.js",
            "babel.config.js",
            "metro.config.js",
            "jest.config.js",
            "scripts/**",
            "generator/**",
            "ikun-music-mobile/**",
            "musicfree-plugins/**",
        ],
    },
    
    // 扩展现有配置 - 应用到所有文件
    ...compat.extends("@react-native", "prettier").map(config => ({
        ...config,
        files: ["src/**/*.{js,jsx,ts,tsx}"],
    })),
    
    // TypeScript文件特定规则
    {
        files: ["src/**/*.{ts,tsx}"],
        rules: {
            "@typescript-eslint/no-shadow": "warn",
            "no-shadow": "off",
            "no-undef": "off",
            "react-hooks/exhaustive-deps": "warn",
            "@typescript-eslint/object-curly-spacing": ["error", "always"],
            "quotes": ["warn", "double"],
            "object-curly-spacing": ["error", "always"],
            "indent": ["error", 4],
            "semi": ["error", "always"],
            "comma-dangle": ["error", "always-multiline"],
            "brace-style": ["error", "1tbs"],
        },
    },
];