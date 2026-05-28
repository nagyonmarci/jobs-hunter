import js from "@eslint/js";
import globals from "globals";
import n from "eslint-plugin-n";
import security from "eslint-plugin-security";
import promise from "eslint-plugin-promise";
import prettier from "eslint-config-prettier";

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
    files: ["tests/**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  prettier
];
