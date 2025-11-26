/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'bg-primary': 'var(--bg-primary)',
                'bg-secondary': 'var(--bg-secondary)',
                'text-primary': 'var(--text-primary)',
                'text-secondary': 'var(--text-secondary)',
                'accent': 'var(--accent)',
                'border': 'var(--border)',
                'hover': 'var(--hover)',
                'hover-bg': 'var(--hover-bg)',
            },
            keyframes: {
                'fade-in-up': {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'fade-out-down': {
                    '0%': { opacity: '1', transform: 'translateY(0)' },
                    '100%': { opacity: '0', transform: 'translateY(20px)' },
                }
            },
            animation: {
                'fade-in-up': 'fade-in-up 0.3s ease-out forwards',
                'fade-out-down': 'fade-out-down 0.3s ease-in forwards',
                'scale-in': 'scale-in 0.2s ease-out forwards',
            }
        },
    },
    plugins: [],
}
