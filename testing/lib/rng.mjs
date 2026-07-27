// Deterministic PRNG (mulberry32) + small helpers. Every seed module takes
// an `Rng` instance instead of touching Math.random() directly, so a whole
// run is reproducible from a single --seed value (requirement #20/#22).

export function createRng(seed) {
  let s = seed >>> 0;

  function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    float(min, max, dp = 2) {
      return parseFloat((next() * (max - min) + min).toFixed(dp));
    },
    bool(pTrue = 0.5) {
      return next() < pTrue;
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    /** Weighted pick: entries is [{value, weight}] */
    weighted(entries) {
      const total = entries.reduce((sum, e) => sum + e.weight, 0);
      let roll = next() * total;
      for (const e of entries) {
        roll -= e.weight;
        if (roll <= 0) return e.value;
      }
      return entries[entries.length - 1].value;
    },
    /** Pick n distinct items from arr without replacement. */
    sample(arr, n) {
      const copy = [...arr];
      const out = [];
      for (let i = 0; i < n && copy.length; i++) {
        out.push(copy.splice(Math.floor(next() * copy.length), 1)[0]);
      }
      return out;
    },
    shuffle(arr) {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    /** New independently-seeded child Rng, derived deterministically from a label. */
    child(label) {
      let h = 0;
      for (let i = 0; i < label.length; i++) h = (Math.imul(h, 31) + label.charCodeAt(i)) | 0;
      return createRng((s ^ h) >>> 0);
    },
  };
}
