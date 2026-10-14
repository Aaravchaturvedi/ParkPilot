import React from 'react';
import axios from 'axios';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from '../packages/mobile/src/screens/LoginScreen';
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

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders email + password fields and sign-in button', () => {
    mockUseSession.mockReturnValue({ login: jest.fn() });
    const { getByPlaceholderText, getByText } = render(<LoginScreen onSwitch={() => {}} />);
    expect(getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(getByPlaceholderText('••••••')).toBeTruthy();
    expect(getByText('Sign in')).toBeTruthy();
  });

  it('shows wrong-password text on 401', async () => {
    mockUseSession.mockReturnValue({ login: jest.fn().mockRejectedValue(statusErr(401)) });
    const { getByPlaceholderText, getByText, findByText } = render(<LoginScreen onSwitch={() => {}} />);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('••••••'), 'secret123');
    fireEvent.press(getByText('Sign in'));
    expect(await findByText(/check email\/password/i)).toBeTruthy();
  });

  it('shows connection text (NOT wrong-password) when server unreachable', async () => {
    mockUseSession.mockReturnValue({ login: jest.fn().mockRejectedValue(netErr()) });
    const { getByPlaceholderText, getByText, findByText, queryByText } = render(
      <LoginScreen onSwitch={() => {}} />,
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('••••••'), 'secret123');
    fireEvent.press(getByText('Sign in'));
    expect(await findByText(/cannot reach the server/i)).toBeTruthy();
    expect(queryByText(/check email\/password/i)).toBeNull();
  });

  it('shows no error on successful login', async () => {
    mockUseSession.mockReturnValue({ login: jest.fn().mockResolvedValue(undefined) });
    const { getByPlaceholderText, getByText, queryByText } = render(<LoginScreen onSwitch={() => {}} />);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('••••••'), 'secret123');
    fireEvent.press(getByText('Sign in'));
    await waitFor(() => expect(mockUseSession().login).toHaveBeenCalledWith('a@b.com', 'secret123'));
    expect(queryByText(/cannot reach|check email/i)).toBeNull();
  });
});
