import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import nodePlugin from "eslint-plugin-n";
import importPlugin from "eslint-plugin-import";

const commonGlobals = {
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
  navigator: "readonly",
  // WebGPU globals
  GPUDevice: "readonly",
  GPUShaderModule: "readonly",
  GPUBindGroupLayout: "readonly",
  GPUPipelineLayout: "readonly",
  GPUComputePipeline: "readonly",
  GPUBuffer: "readonly",
  GPUBindGroup: "readonly",
  GPUBufferUsage: "readonly",
  GPUShaderStage: "readonly",
  GPUMapMode: "readonly",
};

const commonRules = {
  // ESLint recommended rules
  ...js.configs.recommended.rules,

  // TypeScript specific rules
  "@typescript-eslint/explicit-function-return-type": "warn",
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-var-requires": "error",
  "@typescript-eslint/no-unsafe-function-type": "error",
  "@typescript-eslint/no-wrapper-object-types": "error",

  // General ESLint rules
  "prefer-const": "error",
  "no-var": "error",
  "object-shorthand": "error",
  "prefer-template": "error",
  "no-unused-vars": "off", // Use TypeScript version instead

  // Import rules
  "import/no-duplicates": "error",

  // Node.js specific rules
  "node/no-unsupported-features/es-syntax": "off",
  "node/no-missing-import": "off",
  "node/no-unpublished-import": [
    "error",
    {
      allowModules: [
        "vitest",
        "@types/node",
        "vite",
        "vite-string-plugin",
        "@vitest/browser",
        "@vitest/browser-playwright",
      ],
    },
  ],
  "node/no-extraneous-import": "error",
};

const commonPlugins = {
  "@typescript-eslint": typescript,
  node: nodePlugin,
  import: importPlugin,
};

export default [
  // Configuration for source files
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: commonGlobals,
    },
    plugins: commonPlugins,
    rules: commonRules,
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
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
        project: "./tsconfig.json",
      },
      globals: commonGlobals,
    },
    plugins: commonPlugins,
    rules: commonRules,
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
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
        project: "./tsconfig.json",
      },
      globals: commonGlobals,
    },
    plugins: commonPlugins,
    rules: commonRules,
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
      "src/rs-keypears_pow5-bundler/",
      "src/rs-keypears_pow5-inline-base64/",
    ],
  },
];
