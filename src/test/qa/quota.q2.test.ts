/**
 * Q2 (Д3), только моки: баннер квоты после закрытия (ВА-13, §5.5, v1.3.7; чек-лист E-14).
 * 466 на receive / delete и 466 на send Фронтенд уже проверяет
 * (`src/store/__tests__/sessionController.test.ts` «466 на receive / delete — событие очереди…»).
 * Здесь — недостающая часть E-14: 466 вида `chats` на checkAccount — действие пользователя,
 * закрытый баннер возвращает; 466 вида `checks` баннер не показывает и после закрытия.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialSessionState, createSessionController, sessionReducer } from '../../store';
import type { SessionState } from '../../store';
import { PHONES, body466CorrespondentsStatus, body466InvokeStatus } from '../fixtures';
import {
  OK_SETTINGS,
  TEST_API_URL,
  TEST_ID_INSTANCE,
  TEST_TOKEN,
  memoryStorage,
  routeFetch,
} from '../fixtures/greenApiMock';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function loggedIn(routes: Parameters<typeof routeFetch>[0]) {
  let state: SessionState = createInitialSessionState({ apiUrl: TEST_API_URL });
  const api = routeFetch({
    getStateInstance: [{ body: { stateInstance: 'authorized' } }],
    getSettings: [{ body: OK_SETTINGS }],
    ...routes,
  });
  const controller = createSessionController({
    dispatch: (a) => {
      state = sessionReducer(state, a);
    },
    clientOptions: { fetch: api.fetch, sleep: () => Promise.resolve() },
    credentialsBackend: memoryStorage(),
    storageBackend: memoryStorage(),
    warn: vi.fn(),
    timers: { setTimeout: vi.fn(() => 0), clearTimeout: vi.fn() },
  });
  await controller.login({
    idInstance: TEST_ID_INSTANCE,
    apiTokenInstance: TEST_TOKEN,
    apiUrl: TEST_API_URL,
  });
  await flush();
  return {
    controller,
    api,
    get state() {
      return state;
    },
  };
}

describe('E-14 (ВА-13, v1.3.7): 466 на checkAccount и закрытый баннер квоты', () => {
  it('закрыт → 466 на receive не возвращает → 466 `chats` на checkAccount возвращает', async () => {
    const quota466 = { status: 466, body: body466CorrespondentsStatus };
    const h = await loggedIn({ receiveNotification: [quota466], checkAccount: [quota466] });
    const c = h.controller.getClient();
    await c?.receiveNotification().catch(() => undefined);
    expect(h.state.quota.visible).toBe(true);
    h.controller.dismissQuotaBanner();
    await c?.receiveNotification().catch(() => undefined);
    expect(h.state.quota.visible).toBe(false);
    await c?.checkAccount(PHONES.primary).catch(() => undefined);
    expect(h.state.quota.visible).toBe(true);
    expect(h.api.calls.filter((x) => x.method === 'checkAccount')).toHaveLength(1);
  });

  it('закрыт → 466 `checks` на checkAccount баннер не возвращает (только текст в диалоге)', async () => {
    const h = await loggedIn({
      receiveNotification: [{ status: 466, body: body466CorrespondentsStatus }],
      checkAccount: [{ status: 466, body: body466InvokeStatus }],
    });
    const c = h.controller.getClient();
    await c?.receiveNotification().catch(() => undefined);
    h.controller.dismissQuotaBanner();
    await c?.checkAccount(PHONES.primary).catch(() => undefined);
    expect(h.state.quota.visible).toBe(false);
  });
});
