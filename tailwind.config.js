/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Brand accent: warm amber (per DESIGN.md "The Instrument") ─────────
        // Replaces the legacy indigo-blue. Tailwind's amber scale, with brand-500
        // = amber-600 (#d97706) chosen as the canonical primary so most existing
        // `bg-brand-500` / `text-brand-500` references continue to work but now
        // read warm-amber. Hover state lives at brand-600 (amber-700, #b45309).
        brand: {
          50:  "#fffbeb", // amber-tint (drag-active backgrounds, subtle row hl)
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#d97706", // PRIMARY — used for focus rings, primary buttons, active states
          600: "#b45309", // HOVER / ACTIVE of primary
          700: "#92400e",
          800: "#78350f",
          900: "#451a03",
          950: "#1c0a02", // very dark warm brown — used for tinted overlays at <60% opacity
        },
      },
      fontFamily: {
        // Explicit calibration for dense 10–14px UI; DESIGN.md "Label-Dominant Rule".
        sans: [
          "system-ui",
          "-apple-system",
          "'Segoe UI'",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
