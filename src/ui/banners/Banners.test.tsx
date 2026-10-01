import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createInitialSessionState, type SessionController, type SessionState } from '../../store';
import { ID_INSTANCE } from '../../test/fixtures/constants';
import { SessionContext } from '../session/sessionContext';
import { Banners } from './Banners';

/** Все баннеры сразу: проверяем только порядок стопки, контроллер не вызывается. */
function everyBanner(): SessionState {
  const base = createInitialSessionState();
  return {
    ...base,
    status: 'loggedIn',
    idInstance: ID_INSTANCE,
    stateInstance: 'suspended',
    settings: {
      ...base.settings,
      status: 'loaded',
      webhookUrlSet: true,
      warnings: ['P2', 'P3', 'P4'],
    },
    readOnly: true,
    locksUnsupported: true,
    storageFailed: true,
    connection: { consecutiveFailures: 2, offline: true, lost: true },
    instanceNotReady: true,
    quota: { visible: true, dismissedByUser: false },
  };
}

const controller = {} as SessionController;

describe('стопка баннеров (§4.0 п. 4)', () => {
  it('порядок: ошибки → предупреждения → информация', () => {
    render(
      <SessionContext.Provider value={{ state: everyBanner(), controller }}>
        <Banners />
      </SessionContext.Provider>,
    );
    const ids = Array.from(screen.getByTestId('banners').children).map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(ids).toEqual([
      'banner-p1',
      'banner-offline',
      'banner-not-ready',
      'banner-quota',
      'banner-suspended',
      'banner-p2',
      'banner-p3',
      'banner-p4',
      'banner-storage',
      'banner-locks-unsupported',
      'banner-other-tab',
    ]);
    // Ошибки озвучиваются сразу, остальное — вежливо.
    expect(screen.getByTestId('banner-p1')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('banner-quota')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('banner-other-tab')).toHaveAttribute('role', 'status');
  });
});
