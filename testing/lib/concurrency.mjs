// Minimal p-limit-style concurrency gate — no dependency needed for this.
export function createLimiter(concurrency) {
  let active = 0;
  const queue = [];

  function runNext() {
    if (active >= concurrency || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    fn().then(
      (v) => { active -= 1; resolve(v); runNext(); },
      (e) => { active -= 1; reject(e); runNext(); }
    );
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
  };
}

/** Run `fn(item, index)` over `items` with bounded concurrency, collecting results in order. Never throws on a single item's failure — records {ok:false, error} instead so a bulk run can report partial failures without dying (requirement: safe re-execution). */
export async function mapPool(items, concurrency, fn) {
  const limit = createLimiter(concurrency);
  const results = new Array(items.length);
  await Promise.all(
    items.map((item, i) =>
      limit(async () => {
        try {
          results[i] = { ok: true, value: await fn(item, i) };
        } catch (error) {
          results[i] = { ok: false, error };
        }
      })
    )
  );
  return results;
}
