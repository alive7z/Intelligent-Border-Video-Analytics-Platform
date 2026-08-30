/** @type {import('tailwindcss').Config} */
const slateShades = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

// Build a slate palette that reads from CSS variables so dark mode can be
// applied globally via `.dark { --c-slate-*: ... }` without touching every
// component file. `rgb(var(--x) / <alpha-value>)` keeps Tailwind opacity
// modifiers (e.g. bg-slate-900/40) fully functional.
const slate = slateShades.reduce((acc, shade) => {
  acc[shade] = `rgb(var(--c-slate-${shade}) / <alpha-value>)`;
  return acc;
}, {});

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        slate,
        white: "rgb(var(--c-white) / <alpha-value>)",
        navy: {
          50: "#eef3fb",
          100: "#d6e1f4",
          200: "#adc3e9",
          300: "#83a3dc",
          400: "#5a82cf",
          500: "#3563b4",
          600: "#274c92",
          700: "#1d3a72",
          800: "#142a55",
          900: "#0c1b3d",
          950: "#071225",
        },
        success: "#16a34a",
        warning: "#ea580c",
        danger: "#dc2626",
        info: "#2563eb",
        lotus: "#E8B04B",
        saffron: "#F28C28",
        ganges: "#17C3B2",
        chakra: "#335BA8",
      },
      boxShadow: {
        card: "0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)",
        lift: "0 4px 12px rgba(16, 24, 40, 0.10)",
        pop: "0 8px 30px rgba(16, 24, 40, 0.16)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "sans-serif",
        ],
      },
      transitionDuration: {
        250: "250ms",
      },
    },
  },
  plugins: [],
};
