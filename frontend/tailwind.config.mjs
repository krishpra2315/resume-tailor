/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // You can extend the default Tailwind theme here
      keyframes: {
        "move-up": {
          "0%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-105%)" },
          "100%": { transform: "translateY(0)" },
        },
        "move-down": {
          "0%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(105%)" },
          "100%": { transform: "translateY(0)" },
        },
      },
      animation: {
        "move-up": "move-up 0.4s ease-in-out",
        "move-down": "move-down 0.4s ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
