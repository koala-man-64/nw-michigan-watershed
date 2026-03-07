/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rest } from 'msw';

import ChatWithRudy from '../ChatWithRudy';
import { server } from '../test/msw/server';

describe('ChatWithRudy', () => {
  test('does not allow sending a blank message', () => {
    render(<ChatWithRudy />);

    expect(screen.getByRole('button', { name: /Send/i })).toBeDisabled();
  });

  test('shows pending state and renders the successful reply', async () => {
    server.use(
      rest.post('/api/chat-rudy', async (req, res, ctx) => {
        const payload = await req.json();
        return res(
          ctx.delay(75),
          ctx.status(200),
          ctx.json({
            ok: true,
            message: payload.message,
            reply: 'Delayed reply from Rudy',
            requestId: 'req-delayed',
          })
        );
      })
    );

    const user = userEvent.setup();
    render(<ChatWithRudy />);

    const input = screen.getByRole('textbox', { name: /^Message$/i });
    await user.type(input, 'How is the watershed?');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    expect(screen.getByLabelText(/Rudy is thinking/i)).toBeInTheDocument();
    expect(await screen.findByText('Delayed reply from Rudy')).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveFocus());
  });

  test('surfaces API errors with the request id', async () => {
    server.use(
      rest.post('/api/chat-rudy', (req, res, ctx) =>
        res(
          ctx.status(500),
          ctx.json({
            ok: false,
            error: 'Chat backend down',
            requestId: 'req-500',
          })
        )
      )
    );

    const user = userEvent.setup();
    render(<ChatWithRudy />);

    await user.type(screen.getByRole('textbox', { name: /^Message$/i }), 'Hello');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    expect(await screen.findByText('Chat backend down (request req-500)')).toBeInTheDocument();
  });

  test('falls back to a generic message on network failure and restores focus', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    server.use(
      rest.post('/api/chat-rudy', (req, res) => res.networkError('offline'))
    );

    const user = userEvent.setup();
    render(<ChatWithRudy />);

    const input = screen.getByRole('textbox', { name: /^Message$/i });
    await user.type(input, 'Hello');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    expect(
      await screen.findByText('Sorry — I couldn’t reach the server.')
    ).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveFocus());
    consoleErrorSpy.mockRestore();
  });
});
