/* eslint-env jest */
import { rest } from 'msw';

import { server } from '../test/msw/server';
import { infoCsv } from '../test/msw/fixtures';
import { apiCsvUrl, fetchCsvText, parseCsvRows } from './csvApi';

describe('csvApi', () => {
  test('builds the encoded CSV URL', () => {
    expect(apiCsvUrl('my blob.csv')).toBe('/api/read-csv?blob=my%20blob.csv&format=csv');
  });

  test('fetches CSV text from the API', async () => {
    await expect(fetchCsvText('info.csv')).resolves.toContain('Parameter,ContactInfo');
    expect(parseCsvRows(infoCsv)[0].Parameter).toBe('Total Phosphorus');
  });

  test('throws when the API responds with an error status', async () => {
    server.use(
      rest.get('/api/read-csv', (req, res, ctx) => {
        if (req.url.searchParams.get('blob') === 'broken.csv') {
          return res(ctx.status(500), ctx.json({ error: 'broken' }));
        }
        return res(ctx.status(404));
      })
    );

    await expect(fetchCsvText('broken.csv')).rejects.toThrow('HTTP 500 for broken.csv');
  });

  test('parses CSV rows and skips empty lines by default', () => {
    const rows = parseCsvRows('Site,Year\nLake Alpha,2024\n\nLake Gamma,2025\n');

    expect(rows).toEqual([
      { Site: 'Lake Alpha', Year: '2024' },
      { Site: 'Lake Gamma', Year: '2025' },
    ]);
  });
});
