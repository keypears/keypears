import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import nodePlugin from "eslint-plugin-n";
import importPlugin from "eslint-plugin-import";

export default [
  // Configuration for source files
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.src.json",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "writable",
        module: "writable",
        require: "readonly",
        global: "readonly",
        crypto: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      node: nodePlugin,
      import: importPlugin,
    },
    rules: {
      // ESLint recommended rules
      ...js.configs.recommended.rules,

      // TypeScript specific rules
      // "@typescript-eslint/no-unused-vars": [
      //   "error",
      //   { argsIgnorePattern: "^_" },
      // ],
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-var-requires": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-wrapper-object-types": "error",

      // General ESLint rules
      // "no-console": "warn",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-template": "error",
      "no-unused-vars": "off", // Use TypeScript version instead

      // Import rules
      // "import/order": [
      //   "error",
      //   {
      //     groups: [
      //       "builtin",
      //       "external",
      //       "internal",
      //       "parent",
      //       "sibling",
      //       "index",
      //     ],
      //     // "newlines-between": "always",
      //   },
      // ],
      "import/no-duplicates": "error",
      "import/no-unresolved": "error",

      // Node.js specific rules
      "node/no-unsupported-features/es-syntax": "off",
      "node/no-missing-import": "off",
      "node/no-unpublished-import": [
        "error",
        {
          allowModules: [
            "vitest",
            "jest",
            "@types/node",
            "vite",
            "vite-tsconfig-paths",
            "drizzle-kit",
            "express",
          ],
        },
      ],
      "node/no-extraneous-import": "error",
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.src.json",
        },
      },
    },
  },

  // Configuration for test files
  {
    files: ["test/**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.test.json",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "writable",
        module: "writable",
        require: "readonly",
        global: "readonly",
        crypto: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      node: nodePlugin,
      import: importPlugin,
    },
    rules: {
      // ESLint recommended rules
      ...js.configs.recommended.rules,

      // TypeScript specific rules
      // "@typescript-eslint/no-unused-vars": [
      //   "error",
      //   { argsIgnorePattern: "^_" },
      // ],
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-var-requires": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-wrapper-object-types": "error",

      // General ESLint rules
      // "no-console": "warn",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-template": "error",
      "no-unused-vars": "off", // Use TypeScript version instead

      // Import rules
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          // "newlines-between": "always",
        },
      ],
      "import/no-duplicates": "error",
      "import/no-unresolved": [
        "error",
        {
          ignore: ["^@keypears/"],  // Allow workspace packages
        },
      ],

      // Node.js specific rules
      "node/no-unsupported-features/es-syntax": "off",
      "node/no-missing-import": "off",
      "node/no-unpublished-import": [
        "error",
        {
          allowModules: [
            "vitest",
            "jest",
            "@types/node",
            "vite",
            "vite-tsconfig-paths",
            "drizzle-kit",
            "express",
          ],
        },
      ],
      "node/no-extraneous-import": "error",
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.test.json",
        },
      },
    },
  },

  // Configuration for config files
  {
    files: ["*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.test.json",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "writable",
        module: "writable",
        require: "readonly",
        global: "readonly",
        crypto: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      node: nodePlugin,
      import: importPlugin,
    },
    rules: {
      // ESLint recommended rules
      ...js.configs.recommended.rules,

      // TypeScript specific rules
      // "@typescript-eslint/no-unused-vars": [
      //   "error",
      //   { argsIgnorePattern: "^_" },
      // ],
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-var-requires": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-wrapper-object-types": "error",

      // General ESLint rules
      // "no-console": "warn",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-template": "error",
      "no-unused-vars": "off", // Use TypeScript version instead

      // Import rules
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          // "newlines-between": "always",
        },
      ],
      "import/no-duplicates": "error",
      "import/no-unresolved": [
        "error",
        {
          ignore: ["^@keypears/"],  // Allow workspace packages
        },
      ],

      // Node.js specific rules
      "node/no-unsupported-features/es-syntax": "off",
      "node/no-missing-import": "off",
      "node/no-unpublished-import": [
        "error",
        {
          allowModules: [
            "vitest",
            "jest",
            "@types/node",
            "vite",
            "vite-tsconfig-paths",
            "drizzle-kit",
            "express",
          ],
        },
      ],
      "node/no-extraneous-import": "error",
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
  },

  // Ignore patterns
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "coverage/",
      "*.min.js",
      "*.d.ts",
    ],
  },
];
