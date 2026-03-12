/* eslint-env jest */
import { rest } from 'msw';
import { waitFor } from '@testing-library/react';

import { server } from '../test/msw/server';
import { infoCsv } from '../test/msw/fixtures';
import { apiCsvUrl, fetchCsvText, parseCsvRows } from './csvApi';

describe('csvApi', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('builds the encoded CSV URL', () => {
    expect(apiCsvUrl('my blob.csv')).toBe('/api/read-csv?blob=my%20blob.csv&format=csv');
  });

  test('fetches CSV text from the API', async () => {
    await expect(fetchCsvText('info.csv')).resolves.toContain('Parameter,ContactInfo');
    expect(parseCsvRows(infoCsv)[0].Parameter).toBe('Total Phosphorus');
  });

  test('returns cached CSV immediately and revalidates with cache validators', async () => {
    const initial = await fetchCsvText('info.csv');
    let seenHeaders = { etag: null, lastModified: null };

    server.use(
      rest.get('/api/read-csv', (req, res, ctx) => {
        if (req.url.searchParams.get('blob') !== 'info.csv') {
          return res(ctx.status(404));
        }

        seenHeaders = {
          etag: req.headers.get('if-none-match'),
          lastModified: req.headers.get('if-modified-since'),
        };
        return res(
          ctx.status(304),
          ctx.set('ETag', '"etag-info.csv"'),
          ctx.set('Last-Modified', 'Wed, 11 Mar 2026 12:00:00 GMT'),
          ctx.set('X-Request-Id', 'req-info-304')
        );
      })
    );

    await expect(fetchCsvText('info.csv')).resolves.toBe(initial);
    await waitFor(() => expect(seenHeaders.etag).toBe('"etag-info.csv"'));
    expect(seenHeaders.lastModified).toBe('Wed, 11 Mar 2026 12:00:00 GMT');
  });

  test('falls back to cached CSV when revalidation fails', async () => {
    const initial = await fetchCsvText('info.csv');

    server.use(
      rest.get('/api/read-csv', (req, res) => {
        if (req.url.searchParams.get('blob') === 'info.csv') {
          return res.networkError('offline');
        }
        return res.networkError('unexpected');
      })
    );

    await expect(fetchCsvText('info.csv')).resolves.toBe(initial);
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
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
