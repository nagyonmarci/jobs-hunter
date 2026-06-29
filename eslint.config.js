import js from "@eslint/js";
import globals from "globals";
import n from "eslint-plugin-n";
import security from "eslint-plugin-security";
import promise from "eslint-plugin-promise";
import prettier from "eslint-config-prettier";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["node_modules/", "coverage/", "dist/", "public/"]
  },
  js.configs.recommended,
  n.configs["flat/recommended-module"],
  security.configs.recommended,
  promise.configs["flat/recommended"],
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      eqeqeq: ["error", "always"],
      "n/no-unpublished-import": "off",
      "n/no-process-exit": "off",
      "n/no-unsupported-features/node-builtins": "off",
      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off"
    }
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.json" }
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-unused-vars": "off"
    }
  },
  {
    files: ["tests/**/*.{js,mjs,ts}"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  prettier
];
