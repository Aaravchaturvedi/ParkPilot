import React from 'react';
import axios from 'axios';
import { render, fireEvent, waitFor, type RenderAPI } from '@testing-library/react-native';
import { RegisterScreen } from '../packages/mobile/src/screens/RegisterScreen';
import { useSession } from '../packages/mobile/src/store/session';

jest.mock('../packages/mobile/src/store/session', () => ({
  useSession: jest.fn(),
}));

const mockUseSession = useSession as jest.Mock;

function netErr(): unknown {
  return new axios.AxiosError('Network Error');
}

function statusErr(status: number, data?: unknown): unknown {
  const e = new axios.AxiosError('Request failed');
  e.response = { status, data: data ?? {}, headers: {}, config: {} } as never;
  return e;
}

// Title text and button label are both "Create account": press via role.
function fillAndSubmit(utils: RenderAPI): void {
  fireEvent.changeText(utils.getByPlaceholderText('Your name'), 'Test User');
  fireEvent.changeText(utils.getByPlaceholderText('you@example.com'), 'n@w.com');
  fireEvent.changeText(utils.getByPlaceholderText('Min 6 characters'), 'secret123');
  fireEvent.press(utils.getByRole('button', { name: 'Create account' }));
}

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders name + email + password fields', () => {
    mockUseSession.mockReturnValue({ register: jest.fn() });
    const utils = render(<RegisterScreen onSwitch={() => {}} />);
    expect(utils.getByPlaceholderText('Your name')).toBeTruthy();
    expect(utils.getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(utils.getByPlaceholderText('Min 6 characters')).toBeTruthy();
    expect(utils.getByRole('button', { name: 'Create account' })).toBeTruthy();
  });

  it('shows already-registered text on 409', async () => {
    mockUseSession.mockReturnValue({ register: jest.fn().mockRejectedValue(statusErr(409)) });
    const utils = render(<RegisterScreen onSwitch={() => {}} />);
    fillAndSubmit(utils);
    expect(await utils.findByText(/already registered/i)).toBeTruthy();
  });

  it('shows connection text (not a taken-email guess) when server unreachable', async () => {
    mockUseSession.mockReturnValue({ register: jest.fn().mockRejectedValue(netErr()) });
    const utils = render(<RegisterScreen onSwitch={() => {}} />);
    fillAndSubmit(utils);
    expect(await utils.findByText(/cannot reach the server/i)).toBeTruthy();
    expect(utils.queryByText(/already registered/i)).toBeNull();
  });

  it('registers with trimmed name/email on success', async () => {
    const register = jest.fn().mockResolvedValue(undefined);
    mockUseSession.mockReturnValue({ register });
    const utils = render(<RegisterScreen onSwitch={() => {}} />);
    fillAndSubmit(utils);
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith('Test User', 'n@w.com', 'secret123', undefined),
    );
    expect(utils.queryByText(/cannot reach|already registered/i)).toBeNull();
  });
});
