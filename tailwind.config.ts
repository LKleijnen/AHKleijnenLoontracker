import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ah: {
          blue: "#0a4ea2",
          dark: "#08316a",
          light: "#e8f0fb",
        },
      },
    },
  },
  plugins: [],
};

export default config;
