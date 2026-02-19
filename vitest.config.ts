/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        projects: [
            // Frontend — React + jsdom
            {
                test: {
                    name: 'frontend',
                    include: ['src/**/*.test.{ts,tsx}'],
                    environment: 'jsdom',
                    setupFiles: './src/test/setup.ts',
                    css: false,
                    globals: true,
                },
            },
            // Cloud Functions — Node.js
            {
                test: {
                    name: 'functions',
                    root: './functions',
                    include: ['src/**/*.test.ts'],
                    environment: 'node',
                    alias: {
                        '^(.*)\\.js$': '$1',
                    },
                },
            },
        ],
    },
});
