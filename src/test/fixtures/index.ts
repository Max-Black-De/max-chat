/**
 * Фикстуры и моки GREEN-API (Q2, Д-2). Только чистые данные и билдеры:
 * без зависимостей от vitest, jsdom и Playwright — модуль импортируется из обоих.
 *
 * Все значения условные (НФТ-11): см. ./constants и проверку в fixtures.test.ts.
 */
export * from './constants';
export * from './http';
export * from './inputs';
export * from './texts';
export * from './account';
export * from './checkAccount';
export * from './sendMessage';
export * from './errors';
export * from './quota';
export * from './notifications';
export * from './receive';
export * from './sequences';
