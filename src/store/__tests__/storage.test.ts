import { describe, expect, it, vi } from 'vitest';
import { STORAGE_SCHEMA_VERSION, createAppStorage, storageKey } from '../storage';
import { memoryStorage } from '../../test/fixtures/greenApiMock';

const isNumArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number');

describe('AppStorage (Р-2, EC-D8, EC-S4)', () => {
  it('ключ с версией схемы: maxchat:<id>:v1:<раздел>', () => {
    expect(STORAGE_SCHEMA_VERSION).toBe('v1');
    expect(storageKey('1101000000', 'chats')).toBe('maxchat:1101000000:v1:chats');
  });

  it('запись и чтение через localStorage', () => {
    const backend = memoryStorage();
    const s = createAppStorage({ idInstance: '1', backend });
    expect(s.write('nums', [1, 2])).toBe(true);
    expect(backend.map.get('maxchat:1:v1:nums')).toBe('[1,2]');
    expect(s.read('nums', isNumArray)).toEqual([1, 2]);
    expect(createAppStorage({ idInstance: '1', backend }).read('nums', isNumArray)).toEqual([1, 2]);
  });

  it('разные инстансы не смешиваются (EC-D7)', () => {
    const backend = memoryStorage();
    createAppStorage({ idInstance: '1', backend }).write('x', [1]);
    expect(createAppStorage({ idInstance: '2', backend }).read('x', isNumArray)).toBeUndefined();
  });

  it('повреждённый JSON, неверная форма, ошибка getItem → раздел пуст', () => {
    const backend = memoryStorage({
      'maxchat:1:v1:bad': '{oops',
      'maxchat:1:v1:shape': '{"a":1}',
    });
    const s = createAppStorage({ idInstance: '1', backend });
    expect(s.read('bad', isNumArray)).toBeUndefined();
    expect(s.read('shape', isNumArray)).toBeUndefined();
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(createAppStorage({ idInstance: '1', backend: throwing }).read('x', isNumArray)).toBe(
      undefined,
    );
  });

  it('сбой записи (QuotaExceededError) → память, один onWriteFailure и один warn без данных', () => {
    const onWriteFailure = vi.fn();
    const warn = vi.fn();
    const s = createAppStorage({
      idInstance: '1',
      backend: memoryStorage({}, true),
      onWriteFailure,
      warn,
    });
    expect(s.write('nums', [42])).toBe(false);
    expect(s.write('nums', [43])).toBe(false);
    expect(s.read('nums', isNumArray)).toEqual([43]);
    expect(s.hasWriteFailed()).toBe(true);
    expect(onWriteFailure).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('43');
  });

  it('нет localStorage (null) → сразу режим памяти с баннером', () => {
    const onWriteFailure = vi.fn();
    const s = createAppStorage({ idInstance: '1', backend: null, onWriteFailure, warn: vi.fn() });
    expect(onWriteFailure).toHaveBeenCalledTimes(1);
    s.write('nums', [1]);
    expect(s.read('nums', isNumArray)).toEqual([1]);
  });

  it('только чтение (вторая вкладка): в localStorage не пишет и не удаляет', () => {
    const backend = memoryStorage({ 'maxchat:1:v1:nums': '[1]' });
    const s = createAppStorage({ idInstance: '1', backend, readOnly: true });
    expect(s.isReadOnly()).toBe(true);
    expect(s.read('nums', isNumArray)).toEqual([1]);
    expect(s.write('nums', [2])).toBe(false);
    expect(s.read('nums', isNumArray)).toEqual([2]); // своя копия в памяти вкладки (EC-S10)
    s.remove('nums');
    expect(backend.map.get('maxchat:1:v1:nums')).toBe('[1]');
    expect(s.read('nums', isNumArray)).toBeUndefined(); // удалено только в этой вкладке
    s.setReadOnly(false);
    // захватила замок — память вкладки сброшена, читается снова localStorage (EC-S10)
    expect(s.read('nums', isNumArray)).toEqual([1]);
    expect(s.write('nums', [3])).toBe(true);
    expect(backend.map.get('maxchat:1:v1:nums')).toBe('[3]');
  });

  it('EC-S10: после сбоя записи выход из «только чтения» память не сбрасывает', () => {
    const backend = memoryStorage({}, true);
    const s = createAppStorage({ idInstance: '1', backend, readOnly: true, warn: () => undefined });
    s.setReadOnly(false);
    expect(s.write('nums', [1])).toBe(false);
    s.setReadOnly(true);
    s.setReadOnly(false);
    expect(s.read('nums', isNumArray)).toEqual([1]);
  });

  it('remove удаляет раздел', () => {
    const backend = memoryStorage({ 'maxchat:1:v1:nums': '[1]' });
    const s = createAppStorage({ idInstance: '1', backend });
    s.remove('nums');
    expect(backend.map.has('maxchat:1:v1:nums')).toBe(false);
  });

  it('несериализуемое значение → false, без исключения', () => {
    const s = createAppStorage({ idInstance: '1', backend: memoryStorage(), warn: vi.fn() });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(s.write('x', cyclic)).toBe(false);
  });
});
