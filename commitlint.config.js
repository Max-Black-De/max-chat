/**
 * Conventional Commits (ТЗ Д-8): <type>(<scope>)?: <subject>
 * Разрешённые типы — по списку Д-8.
 * @type {import('@commitlint/types').UserConfig}
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'test', 'docs', 'refactor', 'chore', 'ci']],
  },
};
