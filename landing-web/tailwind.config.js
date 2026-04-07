/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'ui-serif', 'serif'],
      },
      colors: {
        // Anthropic 品牌色
        brand: {
          primary: '#ae5630',    // Product orange
          hover: '#c4633a',
          light: '#d97757',
        },
        // 深色主题
        dark: {
          bg: '#141413',
          surface: '#2b2a27',
          border: '#faf9f51a',   // 10% ivory
          text: {
            primary: '#faf9f5',
            secondary: '#9a9893',
            tertiary: '#87867f',
          },
        },
        // 浅色主题
        light: {
          bg: '#faf9f5',
          surface: '#ffffff',
          border: '#1414131a',   // 10% slate
          text: {
            primary: '#141413',
            secondary: '#6b6a68',
            tertiary: '#87867f',
          },
        },
        // Carbon 暖灰色系列（Anthropic warm neutrals）
        carbon: {
          900: '#141413',
          850: '#1a1918',
          800: '#2b2a27',
          700: '#3d3d3a',
          600: '#5e5d59',
          500: '#87867f',
        },
        // Sage 暖象牙色系列
        sage: {
          50: '#faf9f5',
          100: '#f0eee6',
          200: '#e8e6dc',
          300: '#d1cfc5',
          400: '#87867f',
          500: '#6b6a68',
          600: '#5e5d59',
        },
        // Accent 强调色（复用键名，映射到 Anthropic orange）
        accent: {
          green: '#ae5630',
          hover: '#c4633a',
        },
      },
      animation: {
        'marquee': 'marquee 30s linear infinite',
        'marquee-reverse': 'marquee-reverse 30s linear infinite',
        'typewriter': 'typewriter 3s steps(30) infinite',
        'blink': 'blink 1s step-end infinite',
        'fade-in': 'fade-in 0.6s ease-out forwards',
        'slide-up': 'slide-up 0.6s ease-out forwards',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-reverse': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
        typewriter: {
          '0%, 100%': { width: '0' },
          '40%, 60%': { width: '100%' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
