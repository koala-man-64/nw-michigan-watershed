/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Plots from '../../Plots';

const rawData = [
  {
    Site: 'Lake Alpha',
    Parameter: 'Total Phosphorus',
    Year: '2024',
    Avg: '12.4',
    Min: '10.2',
    Max: '15.1',
    Count: '3',
  },
  {
    Site: 'Lake Alpha',
    Parameter: 'Total Phosphorus',
    Year: '2025',
    Avg: '11.1',
    Min: '9.7',
    Max: '13.4',
    Count: '2',
  },
  {
    Site: 'Lake Gamma',
    Parameter: 'Total Phosphorus',
    Year: '2025',
    Avg: '9.3',
    Min: '8.7',
    Max: '10.4',
    Count: '4',
  },
  {
    Site: 'Boardman River',
    Parameter: 'Conductivity',
    Year: '2024',
    Avg: '155.2',
    Min: '150.1',
    Max: '160.9',
    Count: '4',
  },
  {
    Site: 'Platte River',
    Parameter: 'Conductivity',
    Year: '2024',
    Avg: '143.6',
    Min: '140.2',
    Max: '147.8',
    Count: '5',
  },
];

describe('Plots interactions', () => {
  test('only shows site navigation for multi-site trend plots', async () => {
    render(
      <Plots
        plotConfigs={[
          {
            parameter: 'Total Phosphorus',
            chartType: 'trend',
            selectedSites: ['Lake Alpha', 'Lake Gamma'],
            startYear: 2024,
            endYear: 2025,
            trendIndex: 0,
          },
          {
            parameter: 'Conductivity',
            chartType: 'comparison',
            selectedSites: ['Boardman River', 'Platte River'],
            startYear: 2024,
            endYear: 2024,
          },
        ]}
        setPlotConfigs={jest.fn()}
        rawData={rawData}
        infoData={{}}
        loading={false}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Previous site/i })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /Next site/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Download raw data/i })).toHaveLength(2);
  });

  test('downloads only the filtered rows for the active plot', async () => {
    const user = userEvent.setup();
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const revokeSpy = jest
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    let capturedBlob;
    const createSpy = jest
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((blob) => {
        capturedBlob = blob;
        return 'blob:download';
      });

    try {
      render(
        <Plots
          plotConfigs={[
            {
              parameter: 'Conductivity',
              chartType: 'comparison',
              selectedSites: ['Boardman River', 'Platte River'],
              startYear: 2024,
              endYear: 2024,
            },
          ]}
          setPlotConfigs={jest.fn()}
          rawData={rawData}
          infoData={{}}
          loading={false}
        />
      );

      await user.click(screen.getByRole('button', { name: /Download raw data/i }));

      expect(clickSpy).toHaveBeenCalled();
      const csvText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(capturedBlob);
      });
      expect(csvText).toContain('Boardman River');
      expect(csvText).toContain('Platte River');
      expect(csvText).not.toContain('Lake Alpha');
    } finally {
      createSpy.mockRestore();
      revokeSpy.mockRestore();
      clickSpy.mockRestore();
    }
  });

  test('shows fallback parameter information when metadata is missing', async () => {
    const user = userEvent.setup();
    render(
      <Plots
        plotConfigs={[
          {
            parameter: 'Conductivity',
            chartType: 'comparison',
            selectedSites: ['Boardman River', 'Platte River'],
            startYear: 2024,
            endYear: 2024,
          },
        ]}
        setPlotConfigs={jest.fn()}
        rawData={rawData}
        infoData={{}}
        loading={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /Parameter information/i }));

    expect(
      await screen.findByRole('dialog', { name: /Parameter Information/i })
    ).toHaveTextContent('No parameter information available.');
  });
});
