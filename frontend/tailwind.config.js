/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefbf9',
          100: '#d3f5ef',
          200: '#a9e9df',
          300: '#73d6ca',
          400: '#3fbbb1',
          500: '#1f9f98',
          600: '#157f7c',
          700: '#146765',
          800: '#145251',
          900: '#134443',
        },
        navy: {
          700: '#17405f',
          800: '#10304b',
          900: '#0a1f33',
          950: '#06141f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,23,42,.04), 0 4px 16px rgba(15,23,42,.06)',
      },
    },
  },
  plugins: [],
}
