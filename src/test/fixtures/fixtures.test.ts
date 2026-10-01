/**
 * Проверка фикстур (Q2, НФТ-11):
 * 1) формы соответствуют типам контракта (основная проверка — `satisfies` при `tsc`);
 * 2) моки отдают CORS-заголовок и корректный JSON;
 * 3) в фикстурах нет реальных данных — **вайтлистом**: все chatId, номера, idInstance,
 *    idMessage, имена и ссылки — из условного диапазона. Реальные значения здесь не пишутся.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Error466Body,
  GetSettingsResponse,
  IncomingMessageReceived,
  NotificationBody,
  OutgoingAPIMessageReceived,
  OutgoingMessageReceived,
  QuotaExceededNotification,
  ReceivedNotification,
} from '../../api/types';
import * as fixtures from './index';
import type { MockHttpResponse } from './http';

// --- вайтлист условных значений ------------------------------------------------

const ALLOWED_CHAT_IDS = new Set<string>([...Object.values(fixtures.CHAT_IDS), '']);
const ALLOWED_PHONES = new Set<number>([0, ...Object.values(fixtures.PHONES)]);
const ALLOWED_NAMES = new Set<string>([...Object.values(fixtures.NAMES), '']);

/** Любая последовательность из 7+ цифр в любой строке должна подходить под один из шаблонов. */
const ALLOWED_DIGIT_RUNS: readonly RegExp[] = [
  /^7?9990000\d{2,5}$/, // номера 7999000000x и их невалидные варианты
  /^3752900000\d{0,2}$/, // номер РБ
  /^110100000[01]$/, // idInstance: свой и чужой (EC-I7)
  /^1000000\d$/, // личные chatId 10000000…10000009
  /^10000000000000\d{1,4}$/, // группы/каналы (15 цифр) и 18-значные idMessage
  /^1790000\d{3}(\d{3})?$/, // timestamp (10 цифр) и API idMessage (13 цифр)
  /^900719925474099[1-4]$/, // EC-I3: receiptId около 2^53
];

/** Адреса с @: свой wid, запрещённый формат chatId и шаблон из текста ошибки сервера. */
const ALLOWED_ADDRESSES = new Set<string>([
  fixtures.OWN_WID,
  fixtures.FORBIDDEN_C_US_CHAT_ID,
  'phone_number@c.us',
]);

const ALLOWED_HOSTS = new Set([
  'api.green-api.com', // общий хост (A2)
  '1101.api.green-api.com', // условный apiUrl фикстур
  '3100.api.green-api.com', // только в подсказке ТЗ «Введите адрес вида …»
  'green-api.com', // EC-T9: хосты без предупреждения
  'api.greenapi.com',
]);

/** Заведомо неверные chatId из EC-I9 (ответ checkAccount вне контракта). */
const INVALID_CHAT_ID_SAMPLES = new Set(['abc', ' 10000000']);
const isAllowedHost = (rawHost: string) => {
  const host = rawHost.toLowerCase();
  return ALLOWED_HOSTS.has(host) || host === 'example.test' || host.endsWith('.example.test');
};

const ID_MESSAGE_PATTERN = /^(1000000000000\d{5}|1790000\d{6})$/;

// --- обход ---------------------------------------------------------------------

interface Visit {
  path: string;
  key: string;
  value: unknown;
}

function* walk(value: unknown, path = 'fixtures', key = ''): Generator<Visit> {
  yield { path, key, value };
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries())
      yield* walk(item, `${path}[${String(index)}]`, key);
  } else if (typeof value === 'object' && value !== null) {
    for (const [childKey, child] of Object.entries(value)) {
      yield* walk(child, `${path}.${childKey}`, childKey);
    }
    if (isMockResponse(value)) {
      const parsed = tryParseJson(value.body);
      if (parsed.ok) yield* walk(parsed.value, `${path}<body>`, '');
    }
  }
}

function isMockResponse(value: object): value is MockHttpResponse {
  return 'status' in value && 'headers' in value && 'body' in value;
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

const allVisits = [...walk(fixtures)];

function digitRuns(text: string): string[] {
  return text.match(/\d{7,}/g) ?? [];
}

function urlHosts(text: string): string[] {
  return [...text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)].map((match) => match[1] ?? '');
}

function violations(visit: Visit): string[] {
  const { path, key, value } = visit;
  const problems: string[] = [];
  if (typeof value === 'string') {
    for (const run of digitRuns(value)) {
      if (!ALLOWED_DIGIT_RUNS.some((pattern) => pattern.test(run))) {
        problems.push(`${path}: число ${run} вне условного диапазона`);
      }
    }
    for (const host of urlHosts(value)) {
      if (!isAllowedHost(host)) problems.push(`${path}: ссылка на хост ${host}`);
    }
    if (['chatId', 'sender', 'participant', 'from'].includes(key) && !ALLOWED_CHAT_IDS.has(value)) {
      if (value !== fixtures.FORBIDDEN_C_US_CHAT_ID && !INVALID_CHAT_ID_SAMPLES.has(value)) {
        problems.push(`${path}: chatId ${value}`);
      }
    }
    if (['idMessage', 'stanzaId'].includes(key) && !ID_MESSAGE_PATTERN.test(value)) {
      problems.push(`${path}: idMessage ${value}`);
    }
    if (['chatName', 'senderName', 'senderContactName'].includes(key)) {
      if (!ALLOWED_NAMES.has(value) && !value.startsWith('Тестов')) {
        problems.push(`${path}: имя «${value}»`);
      }
    }
    if (key === 'wid' && value !== fixtures.OWN_WID) problems.push(`${path}: wid ${value}`);
    for (const address of value.match(/[\w.-]+@[\w.-]+/g) ?? []) {
      if (!ALLOWED_ADDRESSES.has(address)) {
        problems.push(`${path}: адрес ${address}`);
      }
    }
  }
  if (typeof value === 'number') {
    if (['senderPhoneNumber', 'phoneNumber', 'phone'].includes(key) && !ALLOWED_PHONES.has(value)) {
      problems.push(`${path}: номер ${String(value)}`);
    }
    const allowedIdInstances: number[] = [
      fixtures.ID_INSTANCE_NUMBER,
      fixtures.FOREIGN_ID_INSTANCE_NUMBER,
    ];
    if (key === 'idInstance' && !allowedIdInstances.includes(value)) {
      problems.push(`${path}: idInstance ${String(value)}`);
    }
    if (Number.isInteger(value) && Math.abs(value) >= 1_000_000) {
      const run = String(Math.abs(value));
      if (!ALLOWED_DIGIT_RUNS.some((pattern) => pattern.test(run))) {
        problems.push(`${path}: число ${run} вне условного диапазона`);
      }
    }
  }
  return problems;
}

// --- тесты ---------------------------------------------------------------------

describe('fixtures: only placeholder data (NFR-11)', () => {
  it('walks a meaningful amount of data', () => {
    expect(allVisits.length).toBeGreaterThan(1000);
  });

  it('contain only whitelisted chatIds, phones, ids, names and hosts', () => {
    expect(allVisits.flatMap(violations)).toEqual([]);
  });

  it('use only the placeholder idInstance and token', () => {
    expect(fixtures.ID_INSTANCE).toBe('1101000000');
    expect(fixtures.ID_INSTANCE_NUMBER).toBe(1101000000);
    expect(fixtures.API_TOKEN).toBe('your-api-token');
  });

  it('keep source files free of non-placeholder numbers and hosts', () => {
    const sources = import.meta.glob<string>(['./*.ts', '!./fixtures.test.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(10);
    const problems = Object.entries(sources).flatMap(([file, text]) => [
      ...digitRuns(text)
        .filter((run) => !ALLOWED_DIGIT_RUNS.some((pattern) => pattern.test(run)))
        .map((run) => `${file}: число ${run}`),
      ...urlHosts(text)
        .filter((host) => !isAllowedHost(host))
        .map((host) => `${file}: хост ${host}`),
    ]);
    expect(problems).toEqual([]);
  });

  it('this whitelist rejects values outside the placeholder range', () => {
    // Самопроверка вайтлиста на заведомо условных «чужих» значениях.
    const fake = { chatId: '99999999', senderPhoneNumber: 79001234567, idInstance: 9000000001 };
    const found = [...walk(fake)].flatMap(violations).join('\n');
    expect(found).toContain('chatId 99999999');
    expect(found).toContain('номер 79001234567');
    expect(found).toContain('idInstance 9000000001');
    expect(violations({ path: 'x', key: '', value: '79001234567@c.us' })).not.toEqual([]);
    expect(violations({ path: 'x', key: '', value: 'https://storage.example.com/a' })).toHaveLength(
      1,
    );
  });
});

describe('fixtures: mock responses', () => {
  const responses = allVisits.filter(
    (visit): visit is Visit & { value: MockHttpResponse } =>
      typeof visit.value === 'object' && visit.value !== null && isMockResponse(visit.value),
  );

  it('all carry Access-Control-Allow-Origin: *, except deliberate no-CORS variants', () => {
    expect(responses.length).toBeGreaterThan(50);
    const noCorsVariants = new Set<MockHttpResponse>([
      fixtures.tooManyRequestsResponses.noCors,
      fixtures.tooManyRequestsResponses.noCorsRetryAfter2s,
    ]);
    const missing = responses.filter(
      (r) => !noCorsVariants.has(r.value) && r.value.headers['Access-Control-Allow-Origin'] !== '*',
    );
    expect(missing.map((r) => r.path)).toEqual([]);
    const noCors = responses.filter((r) => noCorsVariants.has(r.value));
    expect(noCors.length).toBeGreaterThanOrEqual(2);
    expect(noCors.filter((r) => fixtures.hasCors(r.value)).map((r) => r.path)).toEqual([]);
  });

  it('emulate the browser for fetch mocks: no CORS or network failure → TypeError (Р-27)', async () => {
    await expect(fixtures.toFetchResult(fixtures.tooManyRequestsResponses.noCors)).rejects.toThrow(
      TypeError,
    );
    await expect(fixtures.toFetchResult(fixtures.networkError)).rejects.toThrow(TypeError);
    const ok = await fixtures.toFetchResult(fixtures.tooManyRequestsResponses.retryAfter2s);
    expect(ok.status).toBe(429);
    expect(ok.headers.get('retry-after')).toBe('2');
    const stripped = fixtures.withoutCors(fixtures.sendMessageResponses.sent);
    expect(fixtures.hasCors(stripped)).toBe(false);
    expect(stripped.headers['Content-Type']).toBe('application/json');
  });

  it('JSON bodies parse, except the deliberately broken one', () => {
    const broken = responses.filter(
      (r) =>
        r.value.headers['Content-Type'] === 'application/json' &&
        r.value.body !== fixtures.errorResponses.truncatedJson200.body &&
        !tryParseJson(r.value.body).ok,
    );
    expect(broken.map((r) => r.path)).toEqual([]);
    expect(tryParseJson(fixtures.errorResponses.truncatedJson200.body).ok).toBe(false);
  });

  it('convert to fetch Response', async () => {
    const response = fixtures.toFetchResponse(fixtures.sendMessageResponses.sent);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    await expect(response.json()).resolves.toEqual({ idMessage: fixtures.ID_MESSAGES.api1 });
    expect(await fixtures.toFetchResponse(fixtures.emptyReceiveResponses.noContent).text()).toBe(
      '',
    );
  });

  it('cover all 466 variants with status 466 (§5.5)', () => {
    const cases = Object.values(fixtures.quota466Cases);
    expect(cases.length).toBeGreaterThanOrEqual(14);
    expect(cases.every((c) => c.response.status === 466)).toBe(true);
  });

  it('model 429 with and without Retry-After (ВА-8)', () => {
    const r = fixtures.tooManyRequestsResponses;
    expect(r.noRetryAfter.headers['Retry-After']).toBeUndefined();
    expect(r.retryAfter2s.headers['Retry-After']).toBe('2');
    expect(r.retryAfter2s.headers['Access-Control-Expose-Headers']).toBe('Retry-After');
    expect(r.retryAfterHidden.headers['Access-Control-Expose-Headers']).toBeUndefined();
  });

  it('keep reply sequences consistent', () => {
    const sequences = [
      ...Object.values(fixtures.sendMessage429Sequences),
      ...Object.values(fixtures.sendMessageNoRetrySequences),
      ...Object.values(fixtures.checkAccountNoRetrySequences),
      ...Object.values(fixtures.deleteRetrySequences),
    ];
    for (const sequence of sequences) {
      expect(sequence.expectedCalls).toBeLessThanOrEqual(sequence.replies.length);
      expect(sequence.expectedDelaysSec).toHaveLength(Math.max(0, sequence.expectedCalls - 1));
    }
  });
});

describe('fixtures: contract shapes (§5)', () => {
  it('match notification types', () => {
    expectTypeOf(fixtures.incomingText).toExtend<IncomingMessageReceived>();
    expectTypeOf(fixtures.outgoingPhone).toExtend<OutgoingMessageReceived>();
    expectTypeOf(fixtures.outgoingApi).toExtend<OutgoingAPIMessageReceived>();
    expectTypeOf(fixtures.quotaExceededNotification).toExtend<QuotaExceededNotification>();
    expectTypeOf(fixtures.statusDelivered).toExtend<NotificationBody>();
    expectTypeOf(fixtures.duplicateDelivery[0]).toExtend<ReceivedNotification>();
    expectTypeOf(fixtures.settingsWebhookSet).toExtend<GetSettingsResponse>();
    expectTypeOf(fixtures.body466CorrespondentsStatus).toExtend<Error466Body>();
    expectTypeOf(fixtures.body466InvokeStatus).toExtend<Error466Body>();
    expectTypeOf(fixtures.body466QuotaExceeded).toExtend<Error466Body>();
  });

  it('keep ids as strings; 18-digit ids collide as numbers', () => {
    const [first, second] = fixtures.precisionPair;
    expect(typeof first.idMessage).toBe('string');
    expect(first.idMessage).not.toBe(second.idMessage);
    expect(Number(first.idMessage)).toBe(Number(second.idMessage));
  });

  it('reflect spike quirks: API text is extendedTextMessage, phone text is textMessage', () => {
    expect(fixtures.outgoingApi.messageData.typeMessage).toBe('extendedTextMessage');
    expect(fixtures.outgoingPhone.messageData.typeMessage).toBe('textMessage');
    expect(Math.floor(Number(fixtures.outgoingApi.idMessage) / 1000)).toBe(
      fixtures.outgoingApi.timestamp,
    );
    expect(fixtures.outgoingApi.senderData.sender).toBe(fixtures.CHAT_IDS.own);
  });

  it('build a noisy queue with one personal reply at the end', () => {
    const queue = fixtures.noiseThenReply(30);
    expect(queue).toHaveLength(31);
    const chatTypes = queue.map((n) =>
      'senderData' in n.body ? n.body.senderData.chatType : undefined,
    );
    expect(chatTypes.slice(0, 30).every((type) => type === 'group' || type === 'channel')).toBe(
      true,
    );
    expect(chatTypes[30]).toBe('user');
    expect(new Set(queue.map((n) => n.receiptId)).size).toBe(31);
  });

  it('describe quota without used/total outside the current QuotaInfo type (ВА-13)', () => {
    expect(fixtures.quotaExceededNotificationNoUsedTotal).not.toHaveProperty('quotaData.used');
    expect(fixtures.quotaExceededNotificationNoUsedTotal).toHaveProperty(
      'quotaData.method',
      'correspondents',
    );
  });

  it('model outgoing statuses per Д-4: no `sent`, chatId on top level, any order', () => {
    const allowed = ['delivered', 'read', 'failed', 'noAccount', 'notInGroup'];
    const typed = [
      fixtures.statusDelivered,
      fixtures.statusRead,
      fixtures.statusFailed,
      fixtures.statusNoAccount,
      fixtures.statusNotInGroup,
      fixtures.statusUnknownKey,
    ];
    expect(typed.every((s) => allowed.includes(s.status))).toBe(true);
    expect(typed.every((s) => s.chatId === fixtures.CHAT_IDS.primary)).toBe(true);
    expect(fixtures.statusUnknownSent).toHaveProperty('status', 'sent');
    const [first, second] = fixtures.statusesReadBeforeDelivered;
    expect(first.body).toHaveProperty('status', 'read');
    expect(second.body).toHaveProperty('status', 'delivered');
    expect(fixtures.statusChatIdInSenderData).not.toHaveProperty('chatId');
  });

  it('cover EC-I7 (foreign idInstance) and EC-I9 (unexpected checkAccount)', () => {
    expect(String(fixtures.foreignInstanceIncoming.instanceData.idInstance)).toBe(
      fixtures.FOREIGN_ID_INSTANCE,
    );
    expect(fixtures.FOREIGN_ID_INSTANCE).not.toBe(fixtures.ID_INSTANCE);
    expect(fixtures.foreignInstanceIncoming.senderData.chatId).toBe(fixtures.CHAT_IDS.primary);
    expect(Object.keys(fixtures.checkAccountUnexpectedResponses).length).toBeGreaterThanOrEqual(12);
    expect(fixtures.apiUrlHostCases.lookalikeSuffix.warn).toBe(true);
  });

  it('reject http:// apiUrl and expired/deleted instance cases exist', () => {
    expect(fixtures.apiUrlInputs.http.expected).toBeNull();
    expect(fixtures.errorResponses.expired400.json.status).toBe(400);
    expect(fixtures.errorResponses.deleted400.text.body).toBe('Instance is deleted');
  });
});
