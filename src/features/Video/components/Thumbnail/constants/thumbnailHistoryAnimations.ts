import type { Variants } from 'framer-motion';

// Slide animation variants for image carousel navigation
export const slideVariants: Variants = {
    enter: (direction: number) => ({
        x: direction > 0 ? '90%' : '-90%',
        zIndex: 2,
        filter: 'blur(16px)'
    }),
    center: {
        zIndex: 1,
        x: 0,
        filter: 'blur(0px)',
        transition: {
            x: { duration: 0.5, ease: [0.32, 0.72, 0, 1] },
            filter: { duration: 0.4 }
        }
    },
    exit: (direction: number) => ({
        zIndex: 0,
        x: direction < 0 ? '90%' : '-90%',
        filter: 'blur(16px)',
        transition: {
            x: { duration: 0.5, ease: [0.32, 0.72, 0, 1] },
            filter: { duration: 0.4 }
        }
    })
};

// Stagger animation for thumbnail grid
export const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.045,
            delayChildren: 0.1
        }
    }
};

export const itemVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            duration: 0.3,
            ease: 'easeOut'
        }
    }
};
