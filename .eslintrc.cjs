module.exports = {
  root: true,
  extends: ["@thesis-co"],
  rules: {
    "react/jsx-boolean-value": ["error", "never"],
  },
  // Ignore test JS files, which are currently hopelessly broken. Expect them
  // to move to TS files as they get fixed.
  ignorePatterns: ["test/**/*.js"],
}
