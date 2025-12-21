/**
 * =============================================================================
 * UI COMPONENTS - PUBLIC API (Atomic Design)
 * =============================================================================
 * 
 * Центральный экспорт всех UI компонентов по уровням Atomic Design:
 * 
 * ATOMS     → Базовые элементы (Button, Input, Label)
 * MOLECULES → Комбинации атомов (TagsInput, SearchBar)
 * ORGANISMS → Сложные секции (Modal, Card, Header)
 * 
 * ИСПОЛЬЗОВАНИЕ:
 *   import { Button } from '@/components/ui';
 *   import { Button } from '@/components/ui/atoms';
 * 
 * =============================================================================
 */

// Atoms
export * from './atoms';

// Molecules
export * from './molecules';

// Organisms
export * from './organisms';

// Legacy exports (for backward compatibility)
export { TagsInput } from './TagsInput';
