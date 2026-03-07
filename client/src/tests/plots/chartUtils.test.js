/* eslint-env jest */
import { computeYRangeForChart, makeOptions, wrapLabel } from '../../plots/chartUtils';

describe('chartUtils', () => {
  test('computes ranges for boxplot charts', () => {
    expect(
      computeYRangeForChart({
        type: 'boxplot',
        data: {
          datasets: [
            {
              data: [{ min: 2, max: 8 }, { min: 3, max: 10 }],
            },
          ],
        },
      })
    ).toEqual({ min: 2, max: 10 });
  });

  test('computes ranges for numeric charts', () => {
    expect(
      computeYRangeForChart({
        type: 'd3bar',
        data: { datasets: [{ data: [4, 12, 7] }] },
      })
    ).toEqual({ min: 0, max: 12 });
  });

  test('wraps long labels into multiple lines', () => {
    expect(wrapLabel('Northwest Michigan Watershed Coalition', 12)).toEqual([
      'Northwest',
      'Michigan',
      'Watershed',
      'Coalition',
    ]);
  });

  test('builds boxplot tooltip lines and y-axis settings', () => {
    const options = makeOptions('Total Phosphorus (ug/L)', {
      type: 'boxplot',
      data: {
        datasets: [
          {
            label: 'Total Phosphorus (ug/L)',
            data: [{ min: 1, q1: 2, median: 3, mean: 3.5, q3: 4, max: 5 }],
          },
        ],
      },
    });

    const tooltipLines = options.plugins.tooltip.callbacks.label({
      chart: { config: { type: 'boxplot' } },
      raw: { min: 1, q1: 2, median: 3, mean: 3.5, q3: 4, max: 5 },
      dataset: { label: 'Total Phosphorus (ug/L)' },
    });

    expect(options.scales.y.beginAtZero).toBe(false);
    expect(tooltipLines).toContain('Min: 1');
    expect(tooltipLines).toContain('Q3 (75%): 4');
  });

  test('builds bar chart tooltip text', () => {
    const options = makeOptions('Conductivity (uS/cm)', {
      type: 'd3bar',
      data: { datasets: [{ data: [155.2] }] },
    });

    expect(
      options.plugins.tooltip.callbacks.label({
        chart: { config: { type: 'bar' } },
        parsed: { y: 155.2 },
        dataset: { label: 'Conductivity (uS/cm)' },
      })
    ).toBe('Conductivity (uS/cm): 155.2');
  });
});
