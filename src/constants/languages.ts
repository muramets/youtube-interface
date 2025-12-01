export interface Language {
    code: string;
    name: string;
    flag: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
];
