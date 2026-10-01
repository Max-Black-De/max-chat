/**
 * «Новый чат» (ОР-2, п. 2.2–2.9, Р-10, Р-26): номер → chatId. Без React и без записи в стор:
 * возвращает результат, а стор (`chatsReducer`) и UI применяют его сами.
 *
 * - Номер нормализуется (Р-10); невалидный — ошибка формата, запроса нет (п. 2.3).
 * - Номер в кеше «номер → chatId» — checkAccount **не вызывается** (п. 2.4, EC-D10, НФТ-6).
 * - Иначе — один checkAccount, **без автоповтора** при любой ошибке (п. 2.8, ВА-7, EC-Q7).
 * - `exist:false` — «На этом номере нет аккаунта MAX» (п. 2.7). Неожиданный ответ (EC-I9) —
 *   клиент F1 бросает `UNEXPECTED_RESPONSE`, текст п. 2.6. В обоих случаях кеш не пишется.
 * - Вкладка только на чтение не создаёт чатов (Р-12, EC-S4).
 * - Номер и chatId не попадают в тексты ошибок и в логи (персональные данные).
 */
import {
  CHECK_ACCOUNT_TEXTS,
  GreenApiErrorCode,
  PHONE_FORMAT_ERROR,
  describeError,
  isGreenApiError,
  normalizePhone,
  type ChatId,
  type GreenApiClient,
} from '../api';
import { findCachedChat, type ChatsState } from './chats';
import { redactIdentifiers } from './privacy';
import { SESSION_TEXTS } from './texts';

export type NewChatFailure =
  /** Ошибка формата у поля (п. 2.3) — запроса не было. */
  | 'format'
  /** Вкладка только на чтение или нет сессии. */
  | 'readOnly'
  | 'notExists'
  /** Ошибка checkAccount (текст по §4.2 п. 2.6–2.8, §5.5). */
  | 'api'
  /** Запрос отменён (выход, смена сессии) — UI ничего не показывает. */
  | 'aborted';

export type NewChatResult =
  | {
      ok: true;
      phone: string;
      chatId: ChatId;
      /** chatId взят из кеша или существующего чата — checkAccount не вызывался. */
      fromCache: boolean;
    }
  | { ok: false; reason: NewChatFailure; error: string; phone?: string };

export interface NewChatDeps {
  state: Pick<ChatsState, 'chats' | 'phoneCache'>;
  /** Клиент сессии (`controller.getClient()`); `null` — сессии нет. */
  client: Pick<GreenApiClient, 'checkAccount'> | null;
  /** `selectCanWrite` сессии (Р-12, EC-S4). */
  canWrite: boolean;
  signal?: AbortSignal;
}

export async function resolveNewChat(input: string, deps: NewChatDeps): Promise<NewChatResult> {
  if (!deps.canWrite || !deps.client)
    return { ok: false, reason: 'readOnly', error: SESSION_TEXTS.otherTabReadOnly };
  const phone = normalizePhone(input);
  if (phone === null) return { ok: false, reason: 'format', error: PHONE_FORMAT_ERROR };

  const cached = findCachedChat(deps.state, phone);
  if (cached) return { ok: true, phone, chatId: cached.chatId, fromCache: true };

  try {
    const res = await deps.client.checkAccount(phone, deps.signal ? { signal: deps.signal } : {});
    if (!res.exist)
      return { ok: false, reason: 'notExists', error: CHECK_ACCOUNT_TEXTS.notExists, phone };
    return { ok: true, phone, chatId: res.chatId, fromCache: false };
  } catch (e) {
    if (
      isGreenApiError(e) &&
      (e.code === GreenApiErrorCode.ABORTED || e.code === GreenApiErrorCode.SESSION_CLOSED)
    )
      return { ok: false, reason: 'aborted', error: '', phone };
    // Текст сервера в «Ошибка в запросе: …» может повторять номер — в текст ошибки он не идёт.
    return {
      ok: false,
      reason: 'api',
      error: redactIdentifiers(describeError(e, 'checkAccount')),
      phone,
    };
  }
}
