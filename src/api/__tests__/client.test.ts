import { describe, expect, it } from 'vitest';
import { GreenApiError, GreenApiErrorCode } from '../errors';
import { isCheckAccountChatId, messageLength } from '../client';
import {
  channelImage,
  groupQuotedWithPhone,
  incomingText,
  outgoingApi,
  outgoingPhone,
  receipt,
} from '../../test/fixtures';
import {
  makeClient,
  mockFetch,
  blockRealNetwork,
  callAt,
  bodyText,
  catchGreenApiError,
} from '../../test/apiHelpers';

blockRealNetwork();

describe('getStateInstance / getSettings', () => {
  it('возвращает stateInstance', async () => {
    const c = makeClient(mockFetch({ body: { stateInstance: 'authorized' } }).fetch);
    await expect(c.getStateInstance()).resolves.toEqual({ stateInstance: 'authorized' });
  });

  it('неизвестное значение stateInstance пропускается как строка', async () => {
    const c = makeClient(mockFetch({ body: { stateInstance: 'somethingNew' } }).fetch);
    await expect(c.getStateInstance()).resolves.toEqual({ stateInstance: 'somethingNew' });
  });

  it('нет stateInstance → UNEXPECTED_RESPONSE', async () => {
    const c = makeClient(mockFetch({ body: { foo: 1 } }).fetch);
    const e = await catchGreenApiError(c.getStateInstance());
    expect(e.code).toBe(GreenApiErrorCode.UNEXPECTED_RESPONSE);
  });

  it('getSettings возвращает поля верного типа как есть', async () => {
    const settings = {
      wid: '79990000000@c.us',
      webhookUrl: '',
      incomingWebhook: 'yes',
      outgoingWebhook: 'no',
      outgoingAPIMessageWebhook: 'yes',
      outgoingMessageWebhook: 'yes',
      stateWebhook: 'no',
      delaySendMessagesMilliseconds: 500,
    };
    const c = makeClient(mockFetch({ body: settings }).fetch);
    await expect(c.getSettings()).resolves.toEqual(settings);
  });
});

describe('getSettings: проверка типов полей (EC-E5)', () => {
  it('null, число, «Yes», объект → поле undefined; неизвестные поля отброшены', async () => {
    const c = makeClient(
      mockFetch({
        body: {
          webhookUrl: null,
          incomingWebhook: 1,
          outgoingAPIMessageWebhook: 'Yes',
          outgoingMessageWebhook: true,
          outgoingWebhook: { v: 'yes' },
          stateWebhook: 'no',
          wid: 79990000000,
          delaySendMessagesMilliseconds: '500',
          somethingNew: 'yes',
        },
      }).fetch,
    );
    const r = await c.getSettings();
    expect(r).toEqual({ stateWebhook: 'no' });
    expect(r.webhookUrl).toBeUndefined();
    expect(r.incomingWebhook).toBeUndefined();
    expect('somethingNew' in r).toBe(false);
  });

  it('пустой объект → все поля undefined (П-2…П-4 сработают у вызывающего)', async () => {
    const c = makeClient(mockFetch({ body: {} }).fetch);
    await expect(c.getSettings()).resolves.toEqual({});
  });

  it('webhookUrl строкой сохраняется (П-1), в том числе непустой', async () => {
    const c = makeClient(
      mockFetch({ body: { webhookUrl: 'https://hook.example.test/x', incomingWebhook: 'no' } })
        .fetch,
    );
    await expect(c.getSettings()).resolves.toEqual({
      webhookUrl: 'https://hook.example.test/x',
      incomingWebhook: 'no',
    });
  });
});

describe('checkAccount', () => {
  it('phoneNumber уходит целым числом, не строкой (§4.2 п. 2.5)', async () => {
    const m = mockFetch({ body: { exist: true, chatId: '10000002', fromCache: false } });
    const r = await makeClient(m.fetch).checkAccount('79990000001');
    expect(r).toEqual({ exist: true, chatId: '10000002', fromCache: false });
    expect(callAt(m.calls, 0).init.body).toBe('{"phoneNumber":79990000001}');
  });

  it('принимает номер числом и номер РБ (375…)', async () => {
    const m = mockFetch({ body: { exist: true, chatId: '10000003', fromCache: true } });
    await makeClient(m.fetch).checkAccount(375290000001);
    expect(callAt(m.calls, 0).init.body).toBe('{"phoneNumber":375290000001}');
  });

  it('exist:false → chatId ""', async () => {
    const c = makeClient(mockFetch({ body: { exist: false, chatId: '', fromCache: false } }).fetch);
    await expect(c.checkAccount('79990000001')).resolves.toEqual({
      exist: false,
      chatId: '',
      fromCache: false,
    });
  });

  it.each(['89990000001', '+79990000001', '7999000000', '380990000001', '', 'abc'])(
    'ненормализованный номер %j → INVALID_ARGUMENT без запроса',
    async (phone) => {
      const m = mockFetch({ body: {} });
      const e = await catchGreenApiError(makeClient(m.fetch).checkAccount(phone));
      expect(e.code).toBe(GreenApiErrorCode.INVALID_ARGUMENT);
      expect(m.calls).toHaveLength(0);
    },
  );

  // п. 2.6, ВА-7, EC-I9: только непустая строка ^-?\d+$; без кеша (у клиента его нет) и без повтора.
  it.each<[string, object]>([
    ['нет chatId', { exist: true }],
    ['chatId с @ (номер@c.us)', { exist: true, chatId: '79990000000@c.us' }],
    ['нецифровой chatId', { exist: true, chatId: 'abc' }],
    ['цифры с мусором', { exist: true, chatId: '10000000x' }],
    ['одинокий минус', { exist: true, chatId: '-' }],
    ['chatId числом', { exist: true, chatId: 10000000 }],
    ['пустая строка', { exist: true, chatId: '' }],
    ['chatId null', { exist: true, chatId: null }],
    ['нет exist', { chatId: '10000000' }],
    ['пустой объект', {}],
    ['exist строкой', { exist: 'true', chatId: '10000000' }],
  ])('%s → UNEXPECTED_RESPONSE, один запрос, retry none', async (_name, body) => {
    const m = mockFetch({ body }, { body: { exist: true, chatId: '10000000' } });
    const e = await catchGreenApiError(makeClient(m.fetch).checkAccount('79990000001'));
    expect(e).toBeInstanceOf(GreenApiError);
    expect(e.code).toBe(GreenApiErrorCode.UNEXPECTED_RESPONSE);
    expect(e.retry).toBe('none');
    expect(m.calls).toHaveLength(1);
  });

  it('битый JSON → INVALID_JSON без повтора', async () => {
    const m = mockFetch({ body: '{"exist":true,' });
    const e = await catchGreenApiError(makeClient(m.fetch).checkAccount('79990000001'));
    expect(e.code).toBe(GreenApiErrorCode.INVALID_JSON);
    expect(e.retry).toBe('none');
    expect(m.calls).toHaveLength(1);
  });

  it('chatId группы с ведущим минусом — допустим (п. 2.6)', async () => {
    const c = makeClient(mockFetch({ body: { exist: true, chatId: '-10000000' } }).fetch);
    await expect(c.checkAccount('79990000001')).resolves.toEqual({
      exist: true,
      chatId: '-10000000',
      fromCache: false,
    });
  });

  it('exist:false — штатный ответ, chatId не проверяется', async () => {
    const c = makeClient(mockFetch({ body: { exist: false, chatId: 'abc' } }).fetch);
    await expect(c.checkAccount('79990000001')).resolves.toEqual({
      exist: false,
      chatId: '',
      fromCache: false,
    });
  });

  it('isCheckAccountChatId', () => {
    expect(isCheckAccountChatId('10000000')).toBe(true);
    expect(isCheckAccountChatId('-10000000')).toBe(true);
    for (const bad of [
      '',
      '-',
      '79990000000@c.us',
      'abc',
      ' 10000000',
      '10000000 ',
      10000000,
      null,
    ])
      expect(isCheckAccountChatId(bad)).toBe(false);
  });
});

describe('sendMessage: защита chatId и текста (§5.5, Р-26, §4.3 п. 3.5)', () => {
  it('отправляет {chatId, message} и возвращает idMessage строкой', async () => {
    const m = mockFetch({ body: { idMessage: '1790000000123' } });
    const r = await makeClient(m.fetch).sendMessage({
      chatId: '10000002',
      message: 'Тест\nстрока',
    });
    expect(r).toEqual({ idMessage: '1790000000123' });
    expect(JSON.parse(bodyText(callAt(m.calls, 0)))).toEqual({
      chatId: '10000002',
      message: 'Тест\nстрока',
    });
  });

  it.each(['79990000001@c.us', '10000002@c.us', '-10000000000001@g.us'])(
    'chatId %j с @ запрещён, запрос не уходит',
    async (chatId) => {
      const m = mockFetch({ body: { idMessage: '1' } });
      const e = await catchGreenApiError(makeClient(m.fetch).sendMessage({ chatId, message: 'x' }));
      expect(e).toBeInstanceOf(GreenApiError);
      expect(e.code).toBe(GreenApiErrorCode.INVALID_ARGUMENT);
      expect(e.reason).toMatch(/@/);
      expect(e.retry).toBe('none');
      expect(m.calls).toHaveLength(0);
    },
  );

  it.each(['-10000000000001', '', ' 10000002', 'abc'])(
    'chatId %j (группа/канал/мусор) отклоняется',
    async (chatId) => {
      const m = mockFetch({ body: { idMessage: '1' } });
      const e = await catchGreenApiError(makeClient(m.fetch).sendMessage({ chatId, message: 'x' }));
      expect(e.code).toBe(GreenApiErrorCode.INVALID_ARGUMENT);
      expect(m.calls).toHaveLength(0);
    },
  );

  it('allowedChatIds: чужой chatId → CHAT_ID_NOT_ALLOWED, свой — уходит', async () => {
    const m = mockFetch({ body: { idMessage: '1790000000123' } });
    const c = makeClient(m.fetch, { allowedChatIds: ['10000002'] });
    const e = await catchGreenApiError(c.sendMessage({ chatId: '10000003', message: 'x' }));
    expect(e.code).toBe(GreenApiErrorCode.CHAT_ID_NOT_ALLOWED);
    expect(m.calls).toHaveLength(0);
    await c.sendMessage({ chatId: '10000002', message: 'x' });
    expect(m.calls).toHaveLength(1);
  });

  it('пустой / пробельный текст и > 4000 символов отклоняются', async () => {
    const m = mockFetch({ body: { idMessage: '1' } });
    const c = makeClient(m.fetch);
    for (const message of ['', '   \n ', 'a'.repeat(4001)]) {
      const e = await catchGreenApiError(c.sendMessage({ chatId: '10000002', message }));
      expect(e.code).toBe(GreenApiErrorCode.INVALID_ARGUMENT);
    }
    expect(m.calls).toHaveLength(0);
    await c.sendMessage({ chatId: '10000002', message: 'a'.repeat(4000) });
    expect(m.calls).toHaveLength(1);
  });

  it('длина = text.length (UTF-16, emoji = 2): 4000 emoji = 8000 → отклонить; 2000 emoji — можно (ВА-14)', async () => {
    expect(messageLength('😀😀')).toBe(4);
    expect(messageLength('a'.repeat(4000))).toBe(4000);
    const m = mockFetch({ body: { idMessage: '1' } });
    const c = makeClient(m.fetch);
    const e = await catchGreenApiError(
      c.sendMessage({ chatId: '10000002', message: '😀'.repeat(4000) }),
    );
    expect(e.code).toBe(GreenApiErrorCode.INVALID_ARGUMENT);
    expect(m.calls).toHaveLength(0);
    await c.sendMessage({ chatId: '10000002', message: '😀'.repeat(2000) });
    expect(m.calls).toHaveLength(1);
  });

  it('текст отправляется как есть, без trim (ВА-14)', async () => {
    const m = mockFetch({ body: { idMessage: '1' } });
    await makeClient(m.fetch).sendMessage({ chatId: '10000002', message: '  привет\n' });
    expect(JSON.parse(bodyText(callAt(m.calls, 0)))).toEqual({
      chatId: '10000002',
      message: '  привет\n',
    });
  });

  it('нет idMessage → UNEXPECTED_RESPONSE; 18-значный idMessage не теряет точность', async () => {
    const c1 = makeClient(mockFetch({ body: { foo: 1 } }).fetch);
    const e = await catchGreenApiError(c1.sendMessage({ chatId: '10000002', message: 'x' }));
    expect(e.code).toBe(GreenApiErrorCode.UNEXPECTED_RESPONSE);
    const c2 = makeClient(mockFetch({ body: '{"idMessage":"117900000600000001"}' }).fetch);
    await expect(c2.sendMessage({ chatId: '10000002', message: 'x' })).resolves.toEqual({
      idMessage: '117900000600000001',
    });
  });
});

describe('receiveNotification (§5.2)', () => {
  it.each([
    ['пустое тело', ''],
    ['пробелы', '  \n'],
    ['null', 'null'],
    ['false', 'false'],
    ['{}', '{}'],
    ['без receiptId', '{"body":{}}'],
    ['receiptId: null', '{"receiptId":null}'],
  ])('«пустой ответ» (%s) → null', async (_name, text) => {
    const c = makeClient(mockFetch({ body: text }).fetch);
    await expect(c.receiveNotification()).resolves.toBeNull();
  });

  it('пустой ответ 204 → null', async () => {
    const c = makeClient(mockFetch({ status: 204 }).fetch);
    await expect(c.receiveNotification()).resolves.toBeNull();
  });

  it.each([
    ['outgoingPhone', receipt(outgoingPhone, 1001)],
    ['outgoingApi', receipt(outgoingApi, 1002)],
    ['groupQuotedWithPhone', receipt(groupQuotedWithPhone, 1003)],
    ['channelImage', receipt(channelImage, 1004)],
    ['incomingText', receipt(incomingText, 1005)],
  ])('фикстура %s возвращается без изменений', async (_name, fx) => {
    const c = makeClient(mockFetch({ body: JSON.stringify(fx) }).fetch);
    const r = await c.receiveNotification();
    expect(r).toEqual(fx);
    expect(typeof (r?.body as { idMessage: unknown }).idMessage).toBe('string');
  });

  it('тело неожиданной структуры не мешает получить receiptId (§5.4: удалить и продолжать)', async () => {
    const c = makeClient(mockFetch({ body: '{"receiptId":77,"body":"garbage"}' }).fetch);
    await expect(c.receiveNotification()).resolves.toEqual({ receiptId: 77, body: 'garbage' });
  });

  it('невалидный JSON → INVALID_JSON с receiptId, если его видно в тексте', async () => {
    const c = makeClient(
      mockFetch({ body: '{"receiptId": 55, "body": {"typeWebhook": "x", ' }).fetch,
    );
    const e = await catchGreenApiError(c.receiveNotification());
    expect(e.code).toBe(GreenApiErrorCode.INVALID_JSON);
    expect(e.receiptId).toBe(55);
    expect(e.retry).toBe('backoff');
  });

  it.each<[string, number | undefined]>([
    ['{"body":{"x":{"receiptId":9}},"receiptId":10', undefined],
    ['{"typeWebhook":"x","receiptId":10,', undefined],
    ['[{"receiptId":5}', undefined],
    ['garbage {"receiptId":5,', undefined],
    ['{"receiptId":"5",', undefined],
    ['{"receiptId":1.5,', undefined],
    ['{"receiptId":12e3,', undefined],
    ['  {\n  "receiptId" :  12 , "body": {"receiptId": 9', 12],
    ['{"receiptId":10,"body":{"x":{"receiptId":9}', 10],
  ])('битый JSON %j: receiptId только из ведущего ключа → %s (ВА-18)', async (body, expected) => {
    const c = makeClient(mockFetch({ body }).fetch);
    const e = await catchGreenApiError(c.receiveNotification());
    expect(e.code).toBe(GreenApiErrorCode.INVALID_JSON);
    expect(e.receiptId).toBe(expected);
    expect(e.retry).toBe('backoff');
  });

  it('невалидный receiptId → UNEXPECTED_RESPONSE', async () => {
    const c = makeClient(mockFetch({ body: '{"receiptId":"abc","body":{}}' }).fetch);
    const e = await catchGreenApiError(c.receiveNotification());
    expect(e.code).toBe(GreenApiErrorCode.UNEXPECTED_RESPONSE);
  });

  it('receiveTimeout: по умолчанию 20, валидируется 5..60', async () => {
    const m = mockFetch({ body: '' });
    const c = makeClient(m.fetch);
    await c.receiveNotification({ receiveTimeout: 5 });
    expect(callAt(m.calls, 0).url).toMatch(/\?receiveTimeout=5$/);
    for (const receiveTimeout of [4, 61, 2.5]) {
      const e = await catchGreenApiError(c.receiveNotification({ receiveTimeout }));
      expect(e.code).toBe(GreenApiErrorCode.INVALID_ARGUMENT);
    }
    expect(m.calls).toHaveLength(1);
  });
});

describe('deleteNotification (§5.2, §5.4)', () => {
  it('result:true', async () => {
    const c = makeClient(mockFetch({ body: { result: true, reason: '' } }).fetch);
    await expect(c.deleteNotification(1)).resolves.toEqual({
      result: true,
      reason: '',
      alreadyDeleted: false,
    });
  });

  it('result:false → считать удалённым', async () => {
    const c = makeClient(mockFetch({ body: { result: false, reason: 'not found' } }).fetch);
    await expect(c.deleteNotification(1)).resolves.toEqual({
      result: false,
      reason: 'not found',
      alreadyDeleted: true,
    });
  });

  it("500 «Cannot read properties of undefined (reading 'findUnAckedMessage')» → считать удалённым", async () => {
    const c = makeClient(
      mockFetch({
        status: 500,
        body: "Cannot read properties of undefined (reading 'findUnAckedMessage')",
      }).fetch,
    );
    await expect(c.deleteNotification(1)).resolves.toMatchObject({
      result: false,
      alreadyDeleted: true,
    });
  });

  it('прочие 500 → после 3 встроенных повторов ошибка SERVER, retry none (ВА-17)', async () => {
    const m = mockFetch({ status: 500, body: 'Internal error' });
    const e = await catchGreenApiError(makeClient(m.fetch).deleteNotification(1));
    expect(e.code).toBe(GreenApiErrorCode.SERVER);
    expect(e.retry).toBe('none');
    expect(m.calls).toHaveLength(4);
  });

  it.each([-1, 1.5, Number.NaN, 2 ** 60])(
    'receiptId %s → INVALID_ARGUMENT без запроса',
    async (rid) => {
      const m = mockFetch({ body: { result: true } });
      const e = await catchGreenApiError(makeClient(m.fetch).deleteNotification(rid));
      expect(e.code).toBe(GreenApiErrorCode.INVALID_ARGUMENT);
      expect(m.calls).toHaveLength(0);
    },
  );
});
