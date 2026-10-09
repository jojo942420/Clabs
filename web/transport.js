// Bound the whole request, including response-body reads. Only safe reads are retried.
export async function requestJSON(path, options = {}, { timeoutMs = 20000, retries = 1, fetchImpl = fetch } = {}) {
  const method = options.method || 'GET';
  const safeRead = method === 'GET' || (method === 'POST' && path === '/api/state/read');
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          let response;
          try { response = await fetchImpl(path, { ...options, signal: controller.signal }); }
          catch (cause) { throw Object.assign(new Error('Connection interrupted. Your changes remain on this page.'), { transportFailure: true, cause }); }
          let payload;
          try { payload = await response.json(); }
          catch (cause) { throw Object.assign(new Error('The server returned an incomplete response. Please retry.'), { status: response.status || 503, transportFailure: true, cause }); }
          if (!response.ok) throw Object.assign(new Error(payload.error || 'Request failed. Please retry.'), { status: response.status });
          return payload;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(Object.assign(new Error('Connection timed out. Your changes are preserved; reconnect and retry.'), { transportFailure: true }));
            controller.abort();
          }, timeoutMs);
        })
      ]);
    } catch (error) {
      if (!safeRead || attempt >= retries || (!error.transportFailure && ![409, 502, 503, 504].includes(error.status))) throw error;
    } finally { clearTimeout(timer); }
  }
}

// Share only in-flight reads, never cache patient data or retry writes.
export function createReadCoalescer(){const pending=new Map();return function(key,load){if(!pending.has(key)){const promise=Promise.resolve().then(load);pending.set(key,promise);promise.finally(()=>{if(pending.get(key)===promise)pending.delete(key)}).catch(()=>{});}return pending.get(key).then(value=>structuredClone(value));};}
