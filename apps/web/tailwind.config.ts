import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1b1914',
        paper: '#f3efe6',
        pine: '#1f6b4a',
        moss: '#0f6e56',
        clay: '#9a3b22',
        line: '#ddd4c4',
      },
      fontFamily: {
        sans: ['Segoe UI', 'Helvetica Neue', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
