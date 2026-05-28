const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const store = getStore("recap-logs");
  const params = event.queryStringParameters || {};

  try {
    // POST — save a recap entry
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body);
      const { memberName, program, sessionDate, win, struggle, commits, recapData } = body;

      if (!memberName || !program) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "memberName and program required" }) };
      }

      // Key: program/memberName/timestamp
      const timestamp = new Date().toISOString();
      const key = `${program}/${memberName.toLowerCase().replace(/\s+/g, '-')}/${timestamp}`;

      const entry = { memberName, program, sessionDate, win, struggle, commits, recapData, savedAt: timestamp };
      await store.setJSON(key, entry);

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, key }) };
    }

    // GET — retrieve logs
    if (event.httpMethod === "GET") {
      const { program, memberName } = params;

      // List all entries for a program
      const prefix = program ? (memberName ? `${program}/${memberName.toLowerCase().replace(/\s+/g, '-')}/` : `${program}/`) : '';
      const { blobs } = await store.list({ prefix });

      const entries = await Promise.all(
        blobs.map(async (blob) => {
          try {
            return await store.get(blob.key, { type: "json" });
          } catch(e) {
            return null;
          }
        })
      );

      const valid = entries.filter(Boolean).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      return { statusCode: 200, headers, body: JSON.stringify({ entries: valid }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
