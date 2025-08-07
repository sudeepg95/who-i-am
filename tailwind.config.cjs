const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,svelte,ts,tsx,vue}"],
  darkMode: "[data-theme='dark']",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        backdrop: "var(--color-backdrop)",
        shadow: "var(--color-shadow)",
        "shadow-light": "var(--color-shadow-light)",
        "text-shadow": "var(--color-text-shadow)",
        white: "var(--color-white)",
        "blue-300": "var(--color-blue-300)",
        "gray-300": "var(--color-gray-300)",
        "gray-400": "var(--color-gray-400)",
        "blue-500": "var(--color-blue-500)",
        "purple-500": "var(--color-purple-500)",
        "gradient-blue": "var(--color-gradient-blue)",
        "gradient-purple": "var(--color-gradient-purple)",
        "gradient-pink": "var(--color-gradient-pink)",
      },
      textColor: {
        default: "var(--color-text)",
        offset: "var(--color-text-offset)",
      },
      backgroundColor: {
        default: "var(--color-background)",
        offset: "var(--color-background-offset)",
      },
      borderColor: {
        default: "var(--color-border)",
      },
    },
  },
  corePlugins: {
    fontSize: false,
  },
  plugins: [require("tailwindcss-fluid-type")],
};
