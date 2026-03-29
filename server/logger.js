/**
 * Log structurat pentru corelare roomId / rută (JSON Lines style).
 * @param {"preview"|"run"|"api"} svc
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
function logStructured(svc, event, fields = {}) {
  const payload = {
    ts: new Date().toISOString(),
    svc,
    event,
    ...fields,
  };
  console.log(JSON.stringify(payload));
}

module.exports = { logStructured };
