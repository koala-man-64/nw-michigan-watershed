/* eslint-env jest */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { D3Bar, D3Boxplot } from '../../plots/D3Charts';

describe('D3Charts', () => {
  test('renders D3Bar with ratio-preserving svg, vertical in-bar labels, counts, and fading hover tooltip', () => {
    jest.useFakeTimers();

    try {
      const { container } = render(
        <D3Bar
          labels={[['Little Platte', 'Lake']]}
          values={[12.4]}
          counts={[77]}
          color="#123456"
          yLabel="Total Phosphorus (ug/L)"
          xLabel="Site"
        />
      );

      const svg = container.querySelector('svg');
      const bar = container.querySelector('rect');
      expect(svg).toHaveAttribute('viewBox', '0 0 800 440');
      expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
      expect(screen.getByText('Little Platte Lake')).toBeInTheDocument();
      expect(screen.getByText('77')).toBeInTheDocument();
      expect(Number(bar.getAttribute('width'))).toBeGreaterThan(100);
      expect(container.querySelector('text[dominant-baseline="middle"]')).toHaveAttribute('font-size', '14');
      expect(screen.getByText('Total Phosphorus (ug/L)')).toHaveAttribute('transform', 'translate(-52, 190) rotate(-90)');
      expect(screen.getByText('Total Phosphorus (ug/L)')).toHaveAttribute('font-size', '14');
      expect(screen.getByText('Site')).toHaveAttribute('text-anchor', 'middle');

      fireEvent.mouseEnter(container.querySelector('rect'), { clientX: 200, clientY: 120 });

      expect(screen.getByRole('tooltip')).toHaveTextContent('Little Platte Lake');
      expect(screen.getByRole('tooltip')).toHaveTextContent('12.4 ug/L');

      fireEvent.mouseLeave(container.querySelector('rect'));

      expect(screen.getByRole('tooltip')).toHaveStyle({ opacity: '0' });

      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('renders D3Boxplot with ratio-preserving svg and dynamic x-axis labels', () => {
    const { container } = render(
      <D3Boxplot
        labels={['2020', '2021', '2022']}
        series={[
          { min: 1, q1: 2, median: 3, q3: 4, max: 5, mean: 3.5 },
          { min: 2, q1: 3, median: 4, q3: 5, max: 6, mean: 4.2 },
          { min: 3, q1: 4, median: 5, q3: 6, max: 7, mean: 5.1 },
        ]}
        counts={[9, 10, 11]}
        color="#123456"
        yLabel="Total Phosphorus (ug/L)"
        xLabel="Year"
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 800 420');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(screen.getByText('2020')).toBeInTheDocument();
    expect(screen.getByText('2021')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Total Phosphorus (ug/L)')).toHaveAttribute('transform', 'translate(-52, 178) rotate(-90)');
    expect(screen.getByText('Total Phosphorus (ug/L)')).toHaveAttribute('font-size', '14');
    expect(screen.getByText('Year')).toHaveAttribute('text-anchor', 'middle');

    fireEvent.mouseEnter(container.querySelector('rect'), { clientX: 220, clientY: 140 });

    expect(screen.getByRole('tooltip')).toHaveTextContent('2020');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Max:');
    expect(screen.getByRole('tooltip')).toHaveTextContent('5 ug/L');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Mean:');
    expect(screen.getByRole('tooltip')).toHaveTextContent('3.5 ug/L');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Min:');
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 ug/L');
  });
});
