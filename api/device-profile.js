'use strict';

const deviceProfile = require('../server/routes/device-profile');
const config = require('../server/config/modes.json');
const { sendJson } = require('../server/lib/http');
const { endpoint, readBody } = require('../server/lib/vercel-http');

module.exports = endpoint('POST', async (req, res) => {
  const body = await readBody(req, 4 * 1024);
  sendJson(res, 200, deviceProfile(body, config));
});
