/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kid: {
          bg: '#FFF9F0',
          card: '#FFFFFF',
          primary: '#FF8A5B',
          primarySoft: '#FFE3D3',
          blue: '#4EA8DE',
          blueSoft: '#E3F2FD',
          green: '#57CC99',
          greenSoft: '#DEF7EC',
          yellow: '#FFC947',
          purple: '#9B72CF',
          purpleSoft: '#F1E9FB',
          ink: '#2E2A27',
          mute: '#8A817C',
          line: '#EFE6DC',
        },
      },
      fontFamily: {
        kid: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 20px rgba(46, 42, 39, 0.06)',
        pop: '0 8px 28px rgba(255, 138, 91, 0.22)',
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        pop: 'pop 0.25s ease-out',
        float: 'float 2.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
