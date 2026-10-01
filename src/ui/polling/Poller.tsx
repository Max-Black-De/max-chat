/**
 * Опрос очереди в React (F5, ТЗ §6.1, Р-12): без разметки, монтируется внутри чатов и лент
 * вошедшей сессии (пересоздаётся на каждую сессию).
 *
 * 1. Замок `maxchat-poll-<idInstance>` на всю сессию. Занят другой вкладкой → `setReadOnly(true)`
 *    (баннер и запрет записи — F2–F4), ожидание замка; получили → `setReadOnly(false)`, чаты и
 *    ленты перечитываются из localStorage (ВА-16, EC-S10). Нет Web Locks API → опрос без замка
 *    (баннер EC-S5 показывает F2).
 * 2. Цикл `runPollLoop`, пока замок наш и `selectCanStartPolling` (getSettings завершился, нет
 *    П-1). Остановка по П-1 — до «Проверить снова»: флаг снимется, цикл стартует заново.
 *    401/403 — сессию завершает контроллер, компонент размонтируется: abort и освобождение замка.
 * 3. Обработка body: `routeNotification` → `applyNotification` (слияние §6.3) / баннер квоты /
 *    игнор. В лог — только тип уведомления; номер, chatId, текст и токен не логируются (Р-5, Р-11).
 *    Без `instanceData` проверка инстанса пропускается (Р-5, v1.3.7), в лог — тип с пометкой.
 */
import { useEffect, useRef, useState } from 'react';
import { routeNotification, type RoutedNotification } from '../../notifications';
import {
  holdPollLock,
  runPollLoop,
  type LockManagerLike,
  type PollSleep,
  type PollWarn,
} from '../../polling';
import { selectCanStartPolling } from '../../store';
import { useChats } from '../chats/chatsContext';
import { useMessages } from '../messages/messagesContext';
import { useSession } from '../session/sessionContext';

export interface PollerProps {
  /** Web Locks API; `null` — недоступен (опрос без замка, EC-S5). */
  locks: LockManagerLike | null;
  /** Пауза backoff (для тестов). По умолчанию — `abortableSleep`. */
  sleep?: PollSleep;
  /** Лог без персональных данных (по умолчанию `console.warn`). */
  warn?: PollWarn;
}

const defaultWarn: PollWarn = (message, data) => {
  console.warn(message, data);
};

/** Причины игнора, о которых стоит знать при отладке (тип уведомления — без содержимого). */
const LOGGED_IGNORES = new Set(['foreignInstance', 'malformed']);

export function Poller({ locks, sleep, warn = defaultWarn }: PollerProps) {
  const { state, controller } = useSession();
  const { applyNotification } = useMessages();
  const { reportChatName } = useChats();
  const idInstance = state.status === 'loggedIn' ? state.idInstance : null;
  const canPoll = selectCanStartPolling(state);
  const [ownsLock, setOwnsLock] = useState(false);

  // Обработчик читает свежие функции контекста через ref: цикл не перезапускается на каждом рендере.
  const handleRef = useRef<(body: unknown) => void>(() => undefined);
  useEffect(() => {
    handleRef.current = (body) => {
      if (!idInstance) return;
      const routed: RoutedNotification = routeNotification(body, { idInstance });
      // Р-5 (v1.3.7): без instanceData проверка инстанса пропущена — в лог только тип.
      if (routed.noInstanceData)
        warn('Notification without instanceData', { type: routed.type, note: 'no instanceData' });
      switch (routed.kind) {
        case 'message': {
          const outcome = applyNotification(routed.message);
          if (outcome !== 'unknownChat' && routed.chatName)
            reportChatName(routed.message.chatId, routed.chatName);
          return;
        }
        case 'quota': {
          const { method, used, total, status } = routed.quota;
          // §5.5: в лог — только method / used / total / status, без description.
          warn('GREEN-API quotaExceeded notification', {
            method: method ?? '?',
            used: used ?? '?',
            total: total ?? '?',
            status: status ?? '?',
          });
          controller.reportQueueQuota();
          return;
        }
        case 'ignore':
          if (LOGGED_IGNORES.has(routed.reason))
            warn('Notification ignored', { reason: routed.reason, type: routed.type });
          return;
      }
    };
  });

  // 1. Замок опроса на всю сессию.
  useEffect(() => {
    if (!idInstance || !locks) return;
    const ac = new AbortController();
    let waited = false;
    void holdPollLock(locks, idInstance, ac.signal, {
      onWaiting: () => {
        waited = true;
        controller.setReadOnly(true);
      },
      onAcquired: (afterWaiting) => {
        if (afterWaiting) controller.setReadOnly(false);
        setOwnsLock(true);
      },
    });
    return () => {
      ac.abort();
      setOwnsLock(false);
      // Следующая сессия начинает как обычная вкладка и сама проверит замок.
      if (waited) controller.setReadOnly(false);
    };
  }, [locks, idInstance, controller]);

  // 2. Цикл опроса. Без Web Locks API (EC-S5) — без замка.
  const mayPoll = locks === null ? idInstance !== null : ownsLock;
  useEffect(() => {
    if (!mayPoll || !canPoll) return;
    const client = controller.getClient();
    if (!client) return;
    const generation = controller.getGeneration();
    const ac = new AbortController();
    void runPollLoop({
      client,
      signal: ac.signal,
      isCurrent: () => controller.getGeneration() === generation,
      handle: (body) => {
        handleRef.current(body);
      },
      warn,
      ...(sleep ? { sleep } : {}),
    });
    return () => {
      ac.abort();
    };
  }, [mayPoll, canPoll, controller, sleep, warn]);

  return null;
}
