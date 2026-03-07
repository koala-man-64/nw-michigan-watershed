import { rest } from 'msw';

import { dataCsv, infoCsv, locationsCsv } from './fixtures';

const blobBodies = {
  'NWMIWS_Site_Data_testing_varied.csv': dataCsv,
  'info.csv': infoCsv,
  'locations.csv': locationsCsv,
};

export const handlers = [
  rest.get('/api/read-csv', (req, res, ctx) => {
    const blob = req.url.searchParams.get('blob');
    const body = blob ? blobBodies[blob] : null;
    const requestId = `req-${blob || 'missing'}`;

    if (!body) {
      return res(
        ctx.status(404),
        ctx.set('X-Request-Id', requestId),
        ctx.json({ error: 'Blob not found', requestId })
      );
    }

    return res(
      ctx.status(200),
      ctx.set('Content-Type', 'text/csv'),
      ctx.set('X-Request-Id', requestId),
      ctx.body(body)
    );
  }),
  rest.post('/api/chat-rudy', async (req, res, ctx) => {
    const payload = await req.json();
    return res(
      ctx.status(200),
      ctx.set('X-Request-Id', 'req-chat'),
      ctx.json({
        ok: true,
        message: payload.message,
        reply: 'Rudy says hello.',
        requestId: 'req-chat',
      })
    );
  }),
];
