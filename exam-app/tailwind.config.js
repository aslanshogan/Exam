/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B1E33", 700: "#102A45", 800: "#0B1E33", 900: "#071424" },
        teal: { DEFAULT: "#0F3D3E", 600: "#125052", 700: "#0F3D3E" },
        brandGreen: { DEFAULT: "#00C389", 600: "#00A874", 700: "#008C61" },
        surface: "#F4F6F8",
      },
      fontFamily: {
        // Falls back to Inter/system font unless a brand font is provided in /public/fonts
        sans: ["var(--font-brand)", "Inter", "ui-sans-serif", "system-ui", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 10px rgba(11,30,51,0.08)",
        cardHover: "0 6px 20px rgba(11,30,51,0.14)",
      },
    },
  },
  plugins: [],
};
