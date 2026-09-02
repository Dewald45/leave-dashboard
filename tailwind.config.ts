import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /**
         * Media Rocket accent — sampled from mediarocket.space (#FF3300).
         * NOTE ON CONTRAST: 500 is 3.67:1 on white. That clears WCAG AA for
         * UI components and large text, but NOT the 4.5:1 needed for normal
         * body text. Use 700 (6.36:1) whenever the accent is small text.
         */
        brand: {
          50: "#fff1ed",
          100: "#ffddd1",
          200: "#ffb8a3",
          300: "#ff8f70",
          400: "#ff6440",
          500: "#ff3300",
          600: "#e02d00",
          700: "#b82500",
          800: "#8f1d00",
          900: "#6b1600",
        },
        /** Near-black canvas + primary actions, sampled from the site. */
        ink: {
          DEFAULT: "#0a0a0a",
          900: "#0a0a0a",
          800: "#1f1f1f",
          700: "#2e2e2e",
        },
        /** Neutral ramp, also sampled from the live site. */
        sand: {
          50: "#fafafa",
          100: "#f5f5f5",
          200: "#e5e5e5",
          300: "#d4d4d4",
          400: "#b8b8b8",
          500: "#8f8f8f",
          600: "#7a7a7a",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
