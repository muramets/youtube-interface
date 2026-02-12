/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                'bg-primary': 'var(--bg-primary)',
                'bg-secondary': 'var(--bg-secondary)',
                'text-primary': 'var(--text-primary)',
                'text-secondary': 'var(--text-secondary)',
                'text-tertiary': 'var(--text-tertiary)',
                'accent': 'var(--accent)',
                'border': 'var(--border)',
                'hover': 'var(--hover)',
                'hover-bg': 'var(--hover-bg)',
                'modal-surface': 'var(--modal-surface)',
                'modal-bg': 'var(--modal-bg)',
                'modal-surface-hover': 'var(--modal-surface-hover)',
                'modal-card-bg': 'var(--modal-card-bg)',
                'modal-input-bg': 'var(--modal-input-bg)',
                'modal-button-bg': 'var(--modal-button-bg)',
                'modal-button-hover': 'var(--modal-button-hover)',
                'modal-button-text': 'var(--modal-button-text)',
                'modal-button-active-bg': 'var(--modal-button-active-bg)',
                'modal-button-active-text': 'var(--modal-button-active-text)',
                'modal-text-primary': 'var(--modal-text-primary)',
                'modal-text-secondary': 'var(--modal-text-secondary)',
                'modal-placeholder': 'var(--modal-placeholder)',
                'modal-border': 'var(--modal-border)',
                'sidebar-active': 'var(--sidebar-active)',
                'sidebar-hover': 'var(--sidebar-hover)',
                'video-edit-bg': 'var(--video-edit-bg)',
                'card-bg': 'var(--card-bg)',
                'input-bg': 'var(--input-bg)',
                'button-secondary-bg': 'var(--button-secondary-bg)',
                'button-secondary-hover': 'var(--button-secondary-hover)',
                'button-secondary-text': 'var(--button-secondary-text)',
                'tag-bg': 'var(--tag-bg)',
                'tag-hover': 'var(--tag-hover)',
            },
            zIndex: {
                'base': '0',
                'sticky': '100',      // Sticky headers, timeline headers
                'dropdown': '200',    // Dropdown menus
                'popover': '300',     // Tooltips, popovers
                'modal': '400',       // Modals, dialogs
                'toast': '500',       // Toast notifications
                'tooltip': '600',     // Tooltips (above toasts)
                'max': '9999',        // Maximum elevation (use sparingly)
            },
            keyframes: {
                'slide-in-left': {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(0)' },
                },
                'fade-in-up': {
                    '0%': { opacity: '0', transform: 'translateY(20px) scale(0.95)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
                'fade-out-down': {
                    '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                    '100%': { opacity: '0', transform: 'translateY(20px) scale(0.95)' },
                },
                'fade-in-down': {
                    '0%': { opacity: '0', transform: 'translateY(-8px) scale(0.95)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
                'fade-out-up': {
                    '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                    '100%': { opacity: '0', transform: 'translateY(-8px) scale(0.95)' },
                },
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                fadeIn: {
                    'from': { opacity: '0' },
                    'to': { opacity: '1' },
                },
                scaleIn: {
                    'from': { opacity: '0', transform: 'scale(0.95)' },
                    'to': { opacity: '1', transform: 'scale(1)' },
                },
                slideUpFade: {
                    'from': { opacity: '0', transform: 'translateY(10px)' },
                    'to': { opacity: '1', transform: 'translateY(0)' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '100% 0' },
                    '100%': { backgroundPosition: '-100% 0' },
                },
                'pulse-subtle': {
                    '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
                    '50%': { opacity: '1', transform: 'scale(1.05)' },
                },
                'barBounce': {
                    '0%, 100%': { height: '3px' },
                    '50%': { height: '8px' },
                },
                'slide-down': {
                    '0%': { opacity: '0', maxHeight: '0', transform: 'translateY(-4px)' },
                    '100%': { opacity: '1', maxHeight: '500px', transform: 'translateY(0)' },
                }
            },
            animation: {
                'slide-in-left': 'slide-in-left 0.2s ease-out forwards',
                'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'fade-out-down': 'fade-out-down 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'fade-in-down': 'fade-in-down 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'fade-out-up': 'fade-out-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'scale-in': 'scale-in 0.2s ease-out forwards',
                'fade-in': 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'scale-in-center': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'slide-up': 'slideUpFade 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'shimmer': 'shimmer 2s linear infinite',
                'slide-down': 'slide-down 0.3s ease-out forwards',
                'bar-bounce': 'barBounce 0.6s ease-in-out infinite',
            }
        },
    },
    plugins: [],
}
