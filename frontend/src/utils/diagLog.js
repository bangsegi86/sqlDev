// Diagnostic logger: writes to console AND to the backend server.
// Even if the browser tab crashes, entries already sent survive on the server.
// View them at: GET /api/diag-log
//
// Uses keepalive:true so the request is sent even if the page is unloading/crashing.

export function diagLog(msg) {
  console.log(msg);
  try {
    fetch('/api/diag-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg }),
      keepalive: true,   // survives page unload / renderer crash
    }).catch(() => {});
  } catch {}
}
