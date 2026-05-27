const https = require('https');

const JSONBIN_BASE = 'api.jsonbin.io';
const API_KEY = process.env.JSONBIN_API_KEY;
const BIN_ID = process.env.JSONBIN_BIN_ID;

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const options = {
      hostname: JSONBIN_BASE,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': API_KEY,
        'X-Bin-Versioning': 'false'
      }
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch(e) { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const result = await makeRequest('GET', `/v3/b/${BIN_ID}/latest`, null);
      if (result.status !== 200) {
        return { statusCode: 200, headers, body: JSON.stringify([]) };
      }
      const record = result.data.record;
      const contacts = Array.isArray(record) ? record :
                       (record && Array.isArray(record.contacts) ? record.contacts : []);
      contacts.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
      return { statusCode: 200, headers, body: JSON.stringify(contacts) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const action = body.action;

      // Load current contacts
      const current = await makeRequest('GET', `/v3/b/${BIN_ID}/latest`, null);
      const record = current.data && current.data.record;
      let contacts = Array.isArray(record) ? record :
                     (record && Array.isArray(record.contacts) ? record.contacts : []);

      if (action === 'save') {
        const contact = {
          id: `c_${Date.now()}`,
          date: body.date || new Date().toISOString().split('T')[0],
          clientName: body.clientName,
          method: body.method,
          outcome: body.outcome,
          promiseDate: body.promiseDate || null,
          followUpDate: body.followUpDate || null,
          note: body.note || '',
          paid: false,
          createdAt: new Date().toISOString()
        };
        contacts.push(contact);
        const putResult = await makeRequest('PUT', `/v3/b/${BIN_ID}`, contacts);
        if (putResult.status !== 200) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to save', detail: putResult.data }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, contact }) };
      }

      if (action === 'markPaid') {
        const idx = contacts.findIndex(c => c.id === body.id);
        if (idx !== -1) {
          contacts[idx].paid = true;
          contacts[idx].paidAt = new Date().toISOString();
          await makeRequest('PUT', `/v3/b/${BIN_ID}`, contacts);
        }
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      if (action === 'delete') {
        contacts = contacts.filter(c => c.id !== body.id);
        await makeRequest('PUT', `/v3/b/${BIN_ID}`, contacts);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
