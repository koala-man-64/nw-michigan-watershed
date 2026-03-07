/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { D3Bar, D3Boxplot } from '../../plots/D3Charts';

describe('D3Charts', () => {
  test('renders D3Bar labels, counts, and hover tooltip', () => {
    const { container } = render(
      <D3Bar
        labels={['Lake Alpha']}
        values={[12.4]}
        counts={[77]}
        color="#123456"
        yLabel="Total Phosphorus (ug/L)"
      />
    );

    expect(screen.getByText('Lake Alpha')).toBeInTheDocument();
    expect(screen.getByText('77')).toBeInTheDocument();

    fireEvent.mouseEnter(container.querySelector('rect'), { clientX: 200, clientY: 120 });

    expect(screen.getByRole('tooltip')).toHaveTextContent('Lake Alpha');
    expect(screen.getByRole('tooltip')).toHaveTextContent('12.4');
  });

  test('renders D3Boxplot counts and hover tooltip details', () => {
    const { container } = render(
      <D3Boxplot
        labels={['Lake Alpha']}
        series={[{ min: 1, q1: 2, median: 3, q3: 4, max: 5, mean: 3.5 }]}
        counts={[9]}
        color="#123456"
        yLabel="Total Phosphorus (ug/L)"
      />
    );

    expect(screen.getByText('9')).toBeInTheDocument();

    fireEvent.mouseEnter(container.querySelector('rect'), { clientX: 220, clientY: 140 });

    expect(screen.getByRole('tooltip')).toHaveTextContent('Lake Alpha');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Max:');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Mean:');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Min:');
  });
});
