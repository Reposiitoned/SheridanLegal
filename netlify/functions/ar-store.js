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

    // All contacts stored as a single blob under key 'all'
    async function getAll() {
      try {
        const data = await store.get('all', { type: 'json' });
        return Array.isArray(data) ? data : [];
      } catch(e) {
        return [];
      }
    }

    async function saveAll(contacts) {
      await store.setJSON('all', contacts);
    }

    if (event.httpMethod === 'GET') {
      const contacts = await getAll();
      contacts.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
      return { statusCode: 200, headers, body: JSON.stringify(contacts) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const action = body.action;
      const contacts = await getAll();

      if (action === 'save') {
        const contact = {
          id: `contact_${Date.now()}`,
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
        await saveAll(contacts);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, contact }) };
      }

      if (action === 'markPaid') {
        const idx = contacts.findIndex(c => c.id === body.id);
        if (idx !== -1) {
          contacts[idx].paid = true;
          contacts[idx].paidAt = new Date().toISOString();
          await saveAll(contacts);
        }
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      if (action === 'delete') {
        const updated = contacts.filter(c => c.id !== body.id);
        await saveAll(updated);
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
