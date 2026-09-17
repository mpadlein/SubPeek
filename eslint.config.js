// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
    {
        ignores: [
            ".output/**",
            ".wxt/**",
            ".temp/**",
            "docs/**",
            "store-assets/**",
        ],
    },
    js.configs.recommended,
    // Type-aware rules for every TypeScript file: tsconfig.json already
    // includes src/, tests/ and the config files.
    tseslint.configs.recommendedTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            eqeqeq: "error",
            "prefer-const": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/consistent-type-imports": [
                "error",
                { fixStyle: "inline-type-imports" },
            ],
            "@typescript-eslint/switch-exhaustiveness-check": "error",
        },
    },
    {
        // Test doubles are naturally empty or synchronous.
        files: ["tests/**"],
        rules: {
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/require-await": "off",
        },
    },
    {
        // Plain JavaScript (the browser probes and this file) runs under Node
        // and has no type information.
        files: ["**/*.{js,mjs,cjs}"],
        extends: [tseslint.configs.disableTypeChecked],
        languageOptions: { globals: globals.node },
    },
    // Last: switch off every rule that would fight Prettier.
    prettier,
);
