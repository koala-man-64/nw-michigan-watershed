/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChartPanel } from '../../plots/ChartPanel';

const d3BarChart = {
  title: 'Conductivity Comparison by Site',
  type: 'd3bar',
  data: {
    labels: ['Boardman River', 'Platte River'],
    datasets: [
      {
        label: 'Conductivity (uS/cm)',
        data: [155.2, 143.6],
        backgroundColor: ['#123456', '#abcdef'],
        customCounts: [987, 654],
      },
    ],
  },
};

describe('ChartPanel', () => {
  test('shows the empty prompt when no config has been applied', () => {
    render(<ChartPanel chartObj={null} cfg={null} slotLabel="Plot 1" options={{}} icons={null} />);

    expect(screen.getByText(/Click “Update Plot 1” to populate this plot\./i)).toBeInTheDocument();
  });

  test('shows the no-data state when the chart has no labels', () => {
    render(
      <ChartPanel
        chartObj={{ type: 'd3bar', data: { labels: [], datasets: [] } }}
        cfg={{ parameter: 'Conductivity', chartType: 'comparison' }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
      />
    );

    expect(screen.getByText(/No data for the current filters\./i)).toBeInTheDocument();
  });

  test('toggles counts on and off for rendered charts', async () => {
    const user = userEvent.setup();
    render(
      <ChartPanel
        chartObj={d3BarChart}
        cfg={{ parameter: 'Conductivity', chartType: 'comparison' }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
      />
    );

    await waitFor(() => expect(screen.getByText('Boardman River')).toBeInTheDocument());
    expect(screen.queryByText('987')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show counts/i }));
    expect(await screen.findByText('987')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide counts/i })).toBeInTheDocument();
  });

  test('renders site navigation controls and invokes callbacks', async () => {
    const user = userEvent.setup();
    const prev = jest.fn();
    const next = jest.fn();

    render(
      <ChartPanel
        chartObj={d3BarChart}
        cfg={{ parameter: 'Conductivity', chartType: 'comparison' }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
        nav={{ prev, next, hasMultipleSites: true }}
      />
    );

    await user.click(screen.getByRole('button', { name: /Previous site/i }));
    await user.click(screen.getByRole('button', { name: /Next site/i }));

    expect(prev).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
