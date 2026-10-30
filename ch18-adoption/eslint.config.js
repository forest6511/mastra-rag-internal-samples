import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["node_modules/", "seed/out/", "cdk.out/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
);
