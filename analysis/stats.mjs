/**
 * Statistics for timing samples.
 *
 * Mean and standard deviation are deliberately not the headline numbers. Browser
 * timings are right-skewed and contaminated by GC pauses and scheduler noise, so
 * a mean reports the outliers and a standard deviation pretends the distribution
 * is normal when it plainly is not. Median, p95 and MAD are reported instead, and
 * every pairwise claim has to clear a rank test before it is allowed to be called
 * a difference.
 */

export function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarise(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  const median = quantile(s, 0.5);
  const mean = s.reduce((a, b) => a + b, 0) / (n || 1);
  const variance = s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const devs = s.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  return {
    n,
    min: s[0] ?? NaN,
    median,
    p75: quantile(s, 0.75),
    p95: quantile(s, 0.95),
    p99: quantile(s, 0.99),
    max: s[n - 1] ?? NaN,
    mad: quantile(devs, 0.5),
    mean,
    stdev: Math.sqrt(variance),
  };
}

/**
 * Percentile bootstrap confidence interval for the median.
 *
 * Resampling rather than a closed form, because the sampling distribution of a
 * median on skewed timing data has no useful analytic shape.
 */
export function bootstrapMedianCI(samples, iterations = 2000, alpha = 0.05, seed = 0x5eed) {
  const n = samples.length;
  if (n < 3) return { lo: NaN, hi: NaN };
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const medians = new Array(iterations);
  const draw = new Array(n);
  for (let i = 0; i < iterations; i++) {
    for (let j = 0; j < n; j++) draw[j] = samples[Math.floor(rand() * n)];
    draw.sort((a, b) => a - b);
    medians[i] = quantile(draw, 0.5);
  }
  medians.sort((a, b) => a - b);
  return { lo: quantile(medians, alpha / 2), hi: quantile(medians, 1 - alpha / 2) };
}

/**
 * Mann-Whitney U, two-sided, tie-corrected, normal approximation.
 *
 * Non-parametric on purpose: it assumes nothing about the shape of the two
 * distributions, only that samples are independent.
 */
export function compare(a, b, noiseFloorMs = 0) {
  const na = a.length;
  const nb = b.length;
  const medA = quantile([...a].sort((x, y) => x - y), 0.5);
  const medB = quantile([...b].sort((x, y) => x - y), 0.5);
  const medianDelta = medA - medB;
  const medianRatio = medB === 0 ? NaN : medA / medB;

  if (na < 4 || nb < 4) {
    return {
      medianDelta, medianRatio, p: NaN, effect: NaN,
      significant: false, belowNoiseFloor: Math.abs(medianDelta) < noiseFloorMs,
      verdict: 'indistinguishable',
    };
  }

  // Rank the pooled sample, averaging ranks within ties.
  const pooled = [
    ...a.map((v) => ({ v, g: 0 })),
    ...b.map((v) => ({ v, g: 1 })),
  ].sort((x, y) => x.v - y.v);

  const ranks = new Array(pooled.length);
  let tieCorrection = 0;
  for (let i = 0; i < pooled.length; ) {
    let j = i;
    while (j + 1 < pooled.length && pooled[j + 1].v === pooled[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    const t = j - i + 1;
    if (t > 1) tieCorrection += t ** 3 - t;
    i = j + 1;
  }

  let rankSumA = 0;
  for (let i = 0; i < pooled.length; i++) if (pooled[i].g === 0) rankSumA += ranks[i];

  const uA = rankSumA - (na * (na + 1)) / 2;
  const n = na + nb;
  const meanU = (na * nb) / 2;
  const sdU = Math.sqrt(
    ((na * nb) / 12) * (n + 1 - tieCorrection / (n * (n - 1))),
  );

  const z = sdU === 0 ? 0 : (uA - meanU) / sdU;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  const effect = (2 * uA) / (na * nb) - 1;
  const significant = p < 0.05;
  const belowNoiseFloor = Math.abs(medianDelta) < noiseFloorMs;

  return {
    medianDelta,
    medianRatio,
    p,
    effect,
    significant,
    belowNoiseFloor,
    verdict:
      !significant || belowNoiseFloor
        ? 'indistinguishable'
        : medianDelta < 0
          ? 'faster'
          : 'slower',
  };
}

/** Abramowitz & Stegun 26.2.17; accurate to ~7.5e-8, far beyond what we need. */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const upper = d * poly;
  return z >= 0 ? 1 - upper : upper;
}
