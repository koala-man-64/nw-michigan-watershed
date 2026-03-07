/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import useCsvData from './useCsvData';

function HookHarness({ loader, deps }) {
  const state = useCsvData(loader, deps);
  return (
    <div data-testid="state">
      {JSON.stringify({
        data: state.data,
        error: state.error ? state.error.message : null,
        loading: state.loading,
      })}
    </div>
  );
}

describe('useCsvData', () => {
  test('transitions from loading to loaded data', async () => {
    render(<HookHarness loader={() => Promise.resolve(['alpha'])} deps={[]} />);

    expect(screen.getByTestId('state')).toHaveTextContent('"loading":true');
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('"data":["alpha"]')
    );
    expect(screen.getByTestId('state')).toHaveTextContent('"loading":false');
  });

  test('surfaces loader errors', async () => {
    render(<HookHarness loader={() => Promise.reject(new Error('boom'))} deps={[]} />);

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('"error":"boom"')
    );
  });

  test('keeps previous data visible while reloading for new dependencies', async () => {
    const resolvers = [];
    const loader = jest.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    const { rerender } = render(<HookHarness loader={loader} deps={[1]} />);

    resolvers.shift()(['first']);
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('"data":["first"]')
    );

    rerender(<HookHarness loader={loader} deps={[2]} />);
    expect(screen.getByTestId('state')).toHaveTextContent('"loading":true');
    expect(screen.getByTestId('state')).toHaveTextContent('"data":["first"]');

    resolvers.shift()(['second']);
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('"data":["second"]')
    );
  });
});
