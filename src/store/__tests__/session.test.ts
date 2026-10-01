import { describe, expect, it } from 'vitest';
import {
  createInitialSessionState,
  evaluateSettings,
  selectCanStartPolling,
  selectCanWrite,
  selectShowOfflineBanner,
  selectShowSuspendedBanner,
  selectVisibleWarnings,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from '../session';

const PREFILL = {
  idInstance: '1101000000',
  apiUrl: 'https://api.green-api.com',
  apiTokenInstance: 't',
};

function run(actions: SessionAction[], from: SessionState = createInitialSessionState()) {
  return actions.reduce(sessionReducer, from);
}
const loggedIn = (gen = 1, stateInstance = 'authorized') =>
  run([
    { type: 'loginStarted', prefill: PREFILL },
    {
      type: 'loginSucceeded',
      generation: gen,
      idInstance: PREFILL.idInstance,
      apiUrl: PREFILL.apiUrl,
      stateInstance,
    },
  ]);

describe('sessionReducer: вход и выход', () => {
  it('начальное состояние — экран входа с apiUrl по умолчанию', () => {
    const s = createInitialSessionState({ apiUrl: 'https://api.green-api.com' });
    expect(s.status).toBe('loggedOut');
    expect(s.prefill).toEqual({
      idInstance: '',
      apiTokenInstance: '',
      apiUrl: 'https://api.green-api.com',
    });
  });

  it('loginStarted → checking; loginSucceeded → loggedIn без токена в состоянии', () => {
    expect(run([{ type: 'loginStarted', prefill: PREFILL }]).status).toBe('checking');
    const s = loggedIn();
    expect(s).toMatchObject({ status: 'loggedIn', idInstance: '1101000000', generation: 1 });
    expect(JSON.stringify({ ...s, prefill: undefined })).not.toContain('"t"');
  });

  it('restoreStarted → restoring и новое предзаполнение (форма пересоздаётся)', () => {
    const s0 = createInitialSessionState();
    const s = sessionReducer(s0, { type: 'restoreStarted', prefill: PREFILL });
    expect(s.status).toBe('restoring');
    expect(s.prefillVersion).toBe(s0.prefillVersion + 1);
  });

  it('loginFailed → экран входа с текстом', () => {
    const s = run([
      { type: 'loginStarted', prefill: PREFILL },
      {
        type: 'loginFailed',
        error: 'Неверный apiTokenInstance',
        prefill: { ...PREFILL, apiTokenInstance: '' },
      },
    ]);
    expect(s).toMatchObject({ status: 'loggedOut', loginError: 'Неверный apiTokenInstance' });
    expect(s.prefill.apiTokenInstance).toBe('');
  });

  it('loggedOut: idInstance и apiUrl предзаполнены, токен пуст, баннеры сброшены', () => {
    const s = run([{ type: 'quotaChats', source: 'user' }, { type: 'loggedOut' }], loggedIn());
    expect(s.status).toBe('loggedOut');
    expect(s.prefill).toEqual({ ...PREFILL, apiTokenInstance: '' });
    expect(s.quota.visible).toBe(false);
    expect(s.loginError).toBeNull();
  });

  it('sessionInvalidated (401/403/expired/deleted в работе) → вход с текстом; вне сессии — игнор', () => {
    const s = sessionReducer(loggedIn(), {
      type: 'sessionInvalidated',
      error: 'Неверный apiTokenInstance',
    });
    expect(s).toMatchObject({ status: 'loggedOut', loginError: 'Неверный apiTokenInstance' });
    expect(s.prefill.apiTokenInstance).toBe('');
    const out = createInitialSessionState();
    expect(sessionReducer(out, { type: 'sessionInvalidated', error: 'x' })).toBe(out);
  });

  it('признаки браузера (нет Web Locks, сбой хранилища) переживают выход', () => {
    const s = run(
      [{ type: 'locksUnsupported' }, { type: 'storageFailed' }, { type: 'loggedOut' }],
      loggedIn(),
    );
    expect(s.locksUnsupported).toBe(true);
    expect(s.storageFailed).toBe(true);
  });
});

describe('getSettings: П-1…П-4 и старт опроса (п. 1.4, 1.7, ВА-1, ВА-6, EC-E3, EC-E5)', () => {
  it('evaluateSettings: нет поля / null — «≠ yes»', () => {
    expect(
      evaluateSettings({
        webhookUrl: '',
        incomingWebhook: 'yes',
        outgoingAPIMessageWebhook: 'yes',
        outgoingMessageWebhook: 'yes',
      }),
    ).toEqual({ webhookUrlSet: false, warnings: [] });
    expect(evaluateSettings({})).toEqual({ webhookUrlSet: false, warnings: ['P2', 'P3', 'P4'] });
    expect(
      evaluateSettings({
        webhookUrl: 'https://hook.example',
        incomingWebhook: 'no',
        outgoingAPIMessageWebhook: null as unknown as 'yes',
        outgoingMessageWebhook: 'yes',
      }),
    ).toEqual({ webhookUrlSet: true, warnings: ['P2', 'P3'] });
    expect(evaluateSettings({ webhookUrl: '   ' }).webhookUrlSet).toBe(false);
  });

  it('опрос — только после ответа/ошибки getSettings и без П-1', () => {
    const s = loggedIn();
    expect(selectCanStartPolling(s)).toBe(false);
    const loading = sessionReducer(s, { type: 'settingsStarted', generation: 1 });
    expect(selectCanStartPolling(loading)).toBe(false);
    expect(loading.settings.recheckBusy).toBe(true);
    const ok = sessionReducer(loading, { type: 'settingsLoaded', generation: 1, settings: {} });
    expect(selectCanStartPolling(ok)).toBe(true);
    const failed = sessionReducer(loading, { type: 'settingsFailed', generation: 1 });
    expect(selectCanStartPolling(failed)).toBe(true);
    expect(failed.settings.warnings).toEqual([]);
    const p1 = sessionReducer(loading, {
      type: 'settingsLoaded',
      generation: 1,
      settings: { webhookUrl: 'https://x' },
    });
    expect(selectCanStartPolling(p1)).toBe(false);
    const cleared = run(
      [
        { type: 'settingsStarted', generation: 1 },
        { type: 'settingsLoaded', generation: 1, settings: { webhookUrl: '' } },
      ],
      p1,
    );
    expect(selectCanStartPolling(cleared)).toBe(true);
  });

  it('П-1 в работе (400 webhook на receive) — опрос стоп до «Проверить снова»', () => {
    const s = run(
      [
        { type: 'settingsLoaded', generation: 1, settings: {} },
        { type: 'webhookUrlDetected', generation: 1 },
      ],
      loggedIn(),
    );
    expect(s.settings.webhookUrlSet).toBe(true);
    expect(selectCanStartPolling(s)).toBe(false);
  });

  it('закрытые П-2…П-4 не показываются; кулдаун «Проверить снова»', () => {
    let s = run([{ type: 'settingsLoaded', generation: 1, settings: {} }], loggedIn());
    expect(selectVisibleWarnings(s)).toEqual(['P2', 'P3', 'P4']);
    s = sessionReducer(s, { type: 'warningDismissed', warning: 'P3' });
    s = sessionReducer(s, { type: 'warningDismissed', warning: 'P3' });
    expect(selectVisibleWarnings(s)).toEqual(['P2', 'P4']);
    s = run(
      [
        { type: 'settingsStarted', generation: 1 },
        { type: 'recheckCooldownEnded', generation: 1 },
      ],
      s,
    );
    expect(s.settings.recheckBusy).toBe(false);
  });

  it('ответы старой сессии игнорируются (EC-S7)', () => {
    const s = loggedIn(2);
    for (const a of [
      { type: 'settingsLoaded', generation: 1, settings: { webhookUrl: 'x' } },
      { type: 'settingsFailed', generation: 1 },
      { type: 'pollNetworkFailed', generation: 1 },
      { type: 'instanceNotReady', generation: 1 },
      { type: 'webhookUrlDetected', generation: 1 },
    ] as SessionAction[])
      expect(sessionReducer(s, a)).toBe(s);
    const out = sessionReducer(s, { type: 'loggedOut' });
    expect(sessionReducer(out, { type: 'settingsLoaded', generation: 2, settings: {} })).toBe(out);
  });
});

describe('«Нет соединения» (п. 4.3, ВА-24, EC-P9)', () => {
  const fail = { type: 'pollNetworkFailed', generation: 1 } as const;
  it('после 2 подряд сетевых ошибок опроса; скрывается после успеха', () => {
    let s = sessionReducer(loggedIn(), fail);
    expect(selectShowOfflineBanner(s)).toBe(false);
    s = sessionReducer(s, fail);
    expect(selectShowOfflineBanner(s)).toBe(true);
    s = sessionReducer(s, { type: 'apiSucceeded', generation: 1 });
    expect(selectShowOfflineBanner(s)).toBe(false);
  });
  it('HTTP-ошибка между ними сбрасывает счёт «подряд», но баннер не скрывает', () => {
    let s = run([fail, { type: 'apiHttpFailed', generation: 1 }, fail], loggedIn());
    expect(selectShowOfflineBanner(s)).toBe(false);
    s = run([fail, { type: 'apiHttpFailed', generation: 1 }], s);
    expect(selectShowOfflineBanner(s)).toBe(true);
  });
  it('событие offline — сразу; online само по себе не скрывает, скрывает успех', () => {
    let s = sessionReducer(loggedIn(), { type: 'browserOffline' });
    expect(selectShowOfflineBanner(s)).toBe(true);
    s = sessionReducer(s, { type: 'apiSucceeded', generation: 1 });
    expect(selectShowOfflineBanner(s)).toBe(false);
  });
  it('успех без проблем — тот же объект (без лишних ререндеров)', () => {
    const s = loggedIn();
    expect(sessionReducer(s, { type: 'apiSucceeded', generation: 1 })).toBe(s);
  });
  it('на экране входа баннера нет', () => {
    expect(
      selectShowOfflineBanner(
        sessionReducer(createInitialSessionState(), { type: 'browserOffline' }),
      ),
    ).toBe(false);
  });
});

describe('баннер квоты чатов — один, правила повторного показа (§5.5, ВА-13)', () => {
  it('из очереди после закрытия — не показывается; новый 466 на действие — показывается', () => {
    let s = sessionReducer(loggedIn(), { type: 'quotaChats', source: 'queue' });
    expect(s.quota.visible).toBe(true);
    s = sessionReducer(s, { type: 'quotaDismissed' });
    expect(s.quota.visible).toBe(false);
    s = sessionReducer(s, { type: 'quotaChats', source: 'queue' });
    expect(s.quota.visible).toBe(false);
    s = sessionReducer(s, { type: 'quotaChats', source: 'user' });
    expect(s.quota.visible).toBe(true);
    s = run([{ type: 'quotaDismissed' }, { type: 'quotaChats', source: 'queue' }], s);
    expect(s.quota.visible).toBe(false);
  });
  it('флаг «закрыт» живёт до конца сессии: после выхода и входа — снова показывается', () => {
    let s = run(
      [{ type: 'quotaChats', source: 'user' }, { type: 'quotaDismissed' }, { type: 'loggedOut' }],
      loggedIn(),
    );
    s = run(
      [
        {
          type: 'loginSucceeded',
          generation: 2,
          idInstance: '1',
          apiUrl: 'https://x',
          stateInstance: 'authorized',
        },
        { type: 'quotaChats', source: 'queue' },
      ],
      s,
    );
    expect(s.quota.visible).toBe(true);
  });
});

describe('прочие баннеры и флаги', () => {
  it('suspended — вход и баннер (EC-S9)', () => {
    expect(selectShowSuspendedBanner(loggedIn(1, 'suspended'))).toBe(true);
    expect(selectShowSuspendedBanner(loggedIn())).toBe(false);
  });
  it('инстанс не готов — до первого успешного ответа', () => {
    let s = sessionReducer(loggedIn(), { type: 'instanceNotReady', generation: 1 });
    expect(s.instanceNotReady).toBe(true);
    s = sessionReducer(s, { type: 'apiSucceeded', generation: 1 });
    expect(s.instanceNotReady).toBe(false);
  });
  it('readOnly: писать нельзя (Р-12, EC-S4)', () => {
    const s = loggedIn();
    expect(selectCanWrite(s)).toBe(true);
    expect(selectCanWrite(sessionReducer(s, { type: 'readOnlyChanged', readOnly: true }))).toBe(
      false,
    );
    expect(selectCanWrite(createInitialSessionState())).toBe(false);
  });
});
