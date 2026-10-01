// @vitest-environment node
/**
 * Тесты scripts/check-leaks.sh (pre-push-проверка на утечки) во временном git-репозитории.
 * Только заглушки: TESTLEAK123, TESTLEAKOLD, TESTLEAKTOKEN0000. Реальный GREEN_API_TOKEN
 * из окружения в дочерний процесс не передаётся.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, 'check-leaks.sh');
const ZERO = '0'.repeat(40);
const LEAK = 'TESTLEAK123';
const OLD_LEAK = 'TESTLEAKOLD';
const TOKEN = 'TESTLEAKTOKEN0000';

let root = '';
let repo = '';
let home = '';

/** Окружение без глобальных настроек git, без реального токена и чужих MAXCHAT_*. */
function baseEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: home,
    TMPDIR: root,
    LANG: 'C.UTF-8',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
    ...extra,
  };
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, env: baseEnv(), encoding: 'utf8' }).trim();
}

async function commitFile(
  path: string,
  content: string,
  message = 'chore: change',
): Promise<string> {
  await writeFile(join(repo, path), content);
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
}

function run(stdin: string, extra: Record<string, string> = {}) {
  const result = spawnSync('sh', [SCRIPT, 'origin', 'unused-url'], {
    cwd: repo,
    env: baseEnv(extra),
    input: stdin,
    encoding: 'utf8',
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

const line = (local: string, remote: string, ref = 'refs/heads/main') =>
  `${ref} ${local} ${ref} ${remote}\n`;

async function writePatterns(content: string, path = join(home, '.config/max-chat/leak-patterns')) {
  execFileSync('mkdir', ['-p', join(path, '..')]);
  await writeFile(path, content, { mode: 0o600 });
  return path;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'check-leaks-'));
  repo = join(root, 'repo');
  home = join(root, 'home');
  const remote = join(root, 'remote.git');
  execFileSync('mkdir', ['-p', repo, home]);
  execFileSync('git', ['init', '-q', '--bare', remote], { env: baseEnv() });
  git('init', '-q', '-b', 'main');
  git('remote', 'add', 'origin', remote);
  // Уже опубликованное содержимое со «старой утечкой»: не должно проверяться повторно.
  await commitFile('base.txt', `base ${OLD_LEAK}\n`, 'chore: base');
  git('push', '-q', 'origin', 'main');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('check-leaks.sh', () => {
  it('нет источника шаблонов → 0 и пустой вывод', async () => {
    const sha = await commitFile('a.txt', `${LEAK}\n`);
    const result = run(line(sha, git('rev-parse', 'origin/main')));
    expect(result).toEqual({ code: 0, out: '' });
  });

  it('нет источника и MAXCHAT_LEAK_VERBOSE → 0 и одна строка в stderr', () => {
    const result = run(line(git('rev-parse', 'HEAD'), ZERO), { MAXCHAT_LEAK_VERBOSE: '1' });
    expect(result.code).toBe(0);
    expect(result.out.trim().split('\n')).toHaveLength(1);
  });

  it('файл только с комментариями и пустыми строками — как нет источника', async () => {
    await writePatterns(`# ${LEAK}\n\n   \n`);
    const sha = await commitFile('a.txt', `# ${LEAK}\n`);
    expect(run(line(sha, git('rev-parse', 'origin/main')))).toEqual({ code: 0, out: '' });
  });

  it('чисто → 0', async () => {
    await writePatterns(`# комментарий\n\n${LEAK}\n`);
    const sha = await commitFile('a.txt', 'nothing here\n');
    expect(run(line(sha, git('rev-parse', 'origin/main'))).code).toBe(0);
  });

  it('совпадение в диффе → 1, номер шаблона, sha и путь, без значения', async () => {
    await writePatterns(`# комментарий\n\n  ${LEAK}  \r\n`);
    const sha = await commitFile('leak.txt', `value=${LEAK}\n`);
    const result = run(line(sha, git('rev-parse', 'origin/main')));
    expect(result.code).toBe(1);
    expect(result.out).toContain(`найдено совпадение с шаблоном №3 в коммите ${sha} файл leak.txt`);
    expect(result.out).not.toContain(LEAK);
  });

  it('совпадение в сообщении коммита → 1', async () => {
    await writePatterns(`${LEAK}\n`);
    const sha = await commitFile('a.txt', 'clean\n', `chore: mention ${LEAK}`);
    const result = run(line(sha, git('rev-parse', 'origin/main')));
    expect(result.code).toBe(1);
    expect(result.out).toContain(`найдено совпадение с шаблоном №1 в сообщении коммита ${sha}`);
    expect(result.out).not.toContain(LEAK);
  });

  it('совпадение в имени файла → 1', async () => {
    await writePatterns(`${LEAK}\n`);
    const sha = await commitFile(`${LEAK}.txt`, 'clean\n');
    const result = run(line(sha, git('rev-parse', 'origin/main')));
    expect(result.code).toBe(1);
    expect(result.out).toContain(`в коммите ${sha} в имени файла <путь скрыт: содержит шаблон>`);
    expect(result.out).not.toContain(LEAK);
  });

  it('уже опубликованное не проверяется, удаление строки с шаблоном — не утечка', async () => {
    await writePatterns(`${OLD_LEAK}\n`);
    const sha = await commitFile('base.txt', 'base\n');
    expect(run(line(sha, git('rev-parse', 'origin/main'))).code).toBe(0);
  });

  it('новая ветка в remote: проверяются только коммиты, которых нет в remote', async () => {
    await writePatterns(`${OLD_LEAK}\n${LEAK}\n`);
    git('checkout', '-q', '-b', 'feature');
    const clean = await commitFile('b.txt', 'clean\n');
    expect(run(line(clean, ZERO, 'refs/heads/feature')).code).toBe(0);

    const leak = await commitFile('c.txt', `${LEAK}\n`);
    const result = run(line(leak, ZERO, 'refs/heads/feature'));
    expect(result.code).toBe(1);
    expect(result.out).toContain(`шаблоном №2 в коммите ${leak} файл c.txt`);
    expect(result.out).not.toContain(`коммите ${clean}`);
    expect(result.out).not.toContain(LEAK);
  });

  it('удаление ветки в remote пропускается', async () => {
    await writePatterns(`${OLD_LEAK}\n`);
    const remoteSha = git('rev-parse', 'origin/main');
    expect(run(line(ZERO, remoteSha, 'refs/heads/old')).code).toBe(0);
  });

  it('MAXCHAT_LEAK_SCAN_ALL проверяет всю историю, включая опубликованное', async () => {
    await writePatterns(`${OLD_LEAK}\n`);
    const result = run(line(git('rev-parse', 'HEAD'), ZERO), { MAXCHAT_LEAK_SCAN_ALL: '1' });
    expect(result.code).toBe(1);
    expect(result.out).toContain('файл base.txt');
    expect(result.out).not.toContain(OLD_LEAK);
  });

  it('MAXCHAT_LEAK_PATTERNS_FILE важнее файла в ~/.config', async () => {
    await writePatterns('SOMETHINGELSE\n');
    const custom = await writePatterns(`${LEAK}\n`, join(root, 'custom-patterns'));
    const sha = await commitFile('a.txt', `${LEAK}\n`);
    const remote = git('rev-parse', 'origin/main');
    expect(run(line(sha, remote)).code).toBe(0);
    expect(run(line(sha, remote), { MAXCHAT_LEAK_PATTERNS_FILE: custom }).code).toBe(1);
  });

  it('MAXCHAT_LEAK_PATTERNS_FILE на несуществующий файл → ошибка', () => {
    const result = run(line(git('rev-parse', 'HEAD'), ZERO), {
      MAXCHAT_LEAK_PATTERNS_FILE: join(root, 'missing'),
    });
    expect(result.code).toBe(1);
  });

  it('GREEN_API_TOKEN из env ищется и не печатается', async () => {
    const sha = await commitFile('a.txt', `url/${TOKEN}\n`, `chore: ${TOKEN}`);
    const result = run(line(sha, git('rev-parse', 'origin/main')), { GREEN_API_TOKEN: TOKEN });
    expect(result.code).toBe(1);
    expect(result.out).toContain(
      `найдено совпадение с GREEN_API_TOKEN в коммите ${sha} файл a.txt`,
    );
    expect(result.out).toContain(`найдено совпадение с GREEN_API_TOKEN в сообщении коммита ${sha}`);
    expect(result.out).not.toContain(TOKEN);
  });

  it('временные файлы со значениями удаляются', async () => {
    await writePatterns(`${LEAK}\n`);
    const sha = await commitFile('a.txt', `${LEAK}\n`);
    run(line(sha, git('rev-parse', 'origin/main')), { GREEN_API_TOKEN: TOKEN });
    const left = execFileSync('find', [root, '-maxdepth', '1', '-name', 'check-leaks.*'], {
      encoding: 'utf8',
    });
    expect(left).toBe('');
  });
});
