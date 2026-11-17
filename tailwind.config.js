/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./www/index.html', './www/app.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'Inter',
          'sans-serif',
        ],
        kr: [
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          '"Noto Sans CJK KR"',
          '"Malgun Gothic"',
          'sans-serif',
        ],
      },
      colors: {
        brand: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
        },
        accent: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
        },
      },
    },
  },
  plugins: [],
};
