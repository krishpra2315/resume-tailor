/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // You can extend the default Tailwind theme here
      // Example:
      // colors: {
      //   primary: '#ff6347',
      // },
    },
  },
  plugins: [],
};

export default config; 