const { getStore } = require('@netlify/blobs');

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
    const store = getStore({ name: 'ar-contacts', consistency: 'strong' });

    if (event.httpMethod === 'GET') {
      const listResult = await store.list();
      const blobs = listResult && listResult.blobs ? listResult.blobs : [];
      const contacts = [];
      for (const blob of blobs) {
        try {
          const data = await store.get(blob.key, { type: 'json' });
          if (data) contacts.push(data);
        } catch(e) { /* skip malformed entry */ }
      }
      contacts.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
      return { statusCode: 200, headers, body: JSON.stringify(contacts) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const action = body.action;

      if (action === 'save') {
        const contact = {
          id: `contact_${Date.now()}`,
          date: body.date || new Date().toISOString(),
          clientName: body.clientName,
          method: body.method,
          outcome: body.outcome,
          promiseDate: body.promiseDate || null,
          followUpDate: body.followUpDate || null,
          note: body.note || '',
          paid: false,
          createdAt: new Date().toISOString()
        };
        await store.setJSON(contact.id, contact);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, contact }) };
      }

      if (action === 'markPaid') {
        const existing = await store.get(body.id, { type: 'json' });
        if (existing) {
          existing.paid = true;
          existing.paidAt = new Date().toISOString();
          await store.setJSON(body.id, existing);
        }
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      if (action === 'delete') {
        await store.delete(body.id);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
};
