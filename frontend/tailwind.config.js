/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070A12",
          900: "#0B1020",
          850: "#101729",
          800: "#151D32",
          700: "#202A44"
        },
        bull: "#00C087",
        bear: "#FF4D67"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(148, 163, 184, 0.12), 0 24px 60px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};
