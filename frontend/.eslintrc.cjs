module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react-hooks", "react-refresh"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  env: { browser: true, es2022: true, node: true },
  ignorePatterns: ["dist", "node_modules"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
  },
};