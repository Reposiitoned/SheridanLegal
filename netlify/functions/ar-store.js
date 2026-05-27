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
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    // GET — fetch all contacts
    if (event.httpMethod === 'GET') {
      const result = await makeRequest('GET', `/v3/b/${BIN_ID}/latest`, null);
      const contacts = result.record?.contacts || [];
      contacts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { statusCode: 200, headers, body: JSON.stringify(contacts) };
    }

    // POST
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);

      // Get current data
      const current = await makeRequest('GET', `/v3/b/${BIN_ID}/latest`, null);
      const contacts = current.record?.contacts || [];

      if (body.action === 'save') {
        const contact = {
          id: `c_${Date.now()}`,
          date: body.date,
          clientName: body.clientName,
          method: body.method,
          outcome: body.outcome,
          promiseDate: body.promiseDate || null,
          note: body.note || '',
          paid: false,
          createdAt: new Date().toISOString()
        };
        contacts.unshift(contact);
        await makeRequest('PUT', `/v3/b/${BIN_ID}`, { contacts });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, contact }) };
      }

      if (body.action === 'markPaid') {
        const idx = contacts.findIndex(c => c.id === body.id);
        if (idx > -1) { contacts[idx].paid = true; contacts[idx].paidAt = new Date().toISOString(); }
        await makeRequest('PUT', `/v3/b/${BIN_ID}`, { contacts });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      if (body.action === 'delete') {
        const filtered = contacts.filter(c => c.id !== body.id);
        await makeRequest('PUT', `/v3/b/${BIN_ID}`, { contacts: filtered });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Not allowed' }) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
