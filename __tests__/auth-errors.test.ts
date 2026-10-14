import axios from 'axios';
import { friendlyAuthError } from '../packages/api/src/errors';

function netErr(): unknown {
  return new axios.AxiosError('Network Error');
}

function statusErr(status: number, data?: unknown): unknown {
  const e = new axios.AxiosError('Request failed');
  e.response = { status, data: data ?? {}, headers: {}, config: {} } as never;
  return e;
}

describe('friendlyAuthError', () => {
  it('maps no-response to a connection message (never wrong-password)', () => {
    expect(friendlyAuthError(netErr(), 'fallback')).toMatch(/cannot reach the server/i);
  });

  it('maps 401 to check email/password', () => {
    expect(friendlyAuthError(statusErr(401, { error: 'invalid_credentials' }), 'fallback')).toMatch(
      /check email\/password/i,
    );
  });

  it('maps 409 to already-registered', () => {
    expect(friendlyAuthError(statusErr(409, { error: 'email_taken' }), 'fallback')).toMatch(/already registered/i);
  });

  it('surfaces server error codes for other statuses', () => {
    expect(friendlyAuthError(statusErr(403, { error: 'only_customer_cancels' }), 'fallback')).toBe(
      'Request failed (only_customer_cancels).',
    );
  });

  it('falls back for non-axios errors', () => {
    expect(friendlyAuthError(new Error('boom'), 'my-fallback')).toBe('my-fallback');
  });
});
