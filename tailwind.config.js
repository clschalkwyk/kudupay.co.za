// tailwind.config.js
export default {
    content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                // Primary Colors
                'kudu-brown': {
                    DEFAULT: '#8B4513',
                    light: '#A0522D',
                    dark: '#654321',
                },
                'savanna-gold': {
                    DEFAULT: '#DAA520',
                    light: '#F4D03F',
                    dark: '#B8860B',
                },
                // Secondary Colors
                'acacia-green': {
                    DEFAULT: '#228B22',
                    light: '#32CD32',
                    dark: '#006400',
                },
                'sunset-orange': {
                    DEFAULT: '#FF8C00',
                    light: '#FFA500',
                    dark: '#FF7F00',
                },
                'sky-blue': {
                    DEFAULT: '#87CEEB',
                    light: '#B0E0E6',
                    dark: '#4682B4',
                },
                // Neutral Colors
                'kalahari-sand': {
                    DEFAULT: '#F5F5DC',
                    light: '#FAFAFA',
                    dark: '#E6E6E6',
                },
                'charcoal': {
                    DEFAULT: '#36454F',
                    light: '#708090',
                    dark: '#2F4F4F',
                },
            },
            fontFamily: {
                'sans': ['Inter', 'Segoe UI', 'Roboto', 'sans-serif'],
                'accent': ['Poppins', 'Inter', 'sans-serif'],
            },
            animation: {
                'kudu-pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'gentle-bounce': 'bounce 1s ease-in-out 2',
            }
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/typography'),
    ],
}
