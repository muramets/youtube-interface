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
            }
        },
    },
    plugins: [],
}
