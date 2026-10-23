/**
 * @file stats.js
 * @description Robust summary statistics for benchmark samples. Median and IQR rather than
 *              mean and standard deviation: a single GC pause or OS scheduling hiccup skews
 *              a mean badly, and a benchmark that reports a skewed mean is reporting noise.
 */
"use strict";

/** Linear-interpolated quantile over a copy-sorted sample. */
function quantile(sorted, q) {
    if (sorted.length === 0) return NaN;
    if (sorted.length === 1) return sorted[0];
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Summarises a numeric sample.
 *
 * @param {number[]} values raw samples
 * @returns {{n:number,min:number,p25:number,median:number,p75:number,max:number,iqr:number,rsd:number}}
 *          `rsd` is the IQR expressed as a percentage of the median: the stability indicator.
 */
function summarize(values) {
    const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v));
    if (clean.length === 0) {
        return { n: 0, min: NaN, p25: NaN, median: NaN, p75: NaN, max: NaN, iqr: NaN, rsd: NaN };
    }
    const sorted = clean.slice().sort((a, b) => a - b);
    const median = quantile(sorted, 0.5);
    const p25 = quantile(sorted, 0.25);
    const p75 = quantile(sorted, 0.75);
    const iqr = p75 - p25;
    return {
        n: sorted.length,
        min: sorted[0],
        p25,
        median,
        p75,
        max: sorted[sorted.length - 1],
        iqr,
        rsd: median > 0 ? (iqr / median) * 100 : 0
    };
}

/**
 * Classifies a summary's trustworthiness. The thresholds are deliberately conservative:
 * anything above 25% IQR-over-median on a desktop with no other load is not a number
 * anyone should budget against.
 */
function stability(summary) {
    if (summary.n < 5) return "insufficient-samples";
    if (!Number.isFinite(summary.rsd)) return "unknown";
    if (summary.median < 0.5) return "below-timer-resolution";
    if (summary.rsd <= 10) return "stable";
    if (summary.rsd <= 25) return "usable";
    return "noisy";
}

function fmt(n, digits = 1) {
    if (!Number.isFinite(n)) return "n/a";
    return n.toFixed(digits);
}

/**
 * Least-squares fit of y = a + b*x and y = a + b*x^2 over the observed curve, reporting
 * which model explains the data better. This is what answers "is it linear or quadratic".
 */
function fitCurve(xs, ys) {
    function lsq(xv, yv) {
        const n = xv.length;
        const sx = xv.reduce((a, b) => a + b, 0);
        const sy = yv.reduce((a, b) => a + b, 0);
        const sxx = xv.reduce((a, b) => a + b * b, 0);
        const sxy = xv.reduce((a, b, i) => a + b * yv[i], 0);
        const denom = n * sxx - sx * sx;
        const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
        const intercept = (sy - slope * sx) / n;
        const yMean = sy / n;
        let ssRes = 0;
        let ssTot = 0;
        for (let i = 0; i < n; i++) {
            const pred = intercept + slope * xv[i];
            ssRes += (yv[i] - pred) ** 2;
            ssTot += (yv[i] - yMean) ** 2;
        }
        return { slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot };
    }
    const linear = lsq(xs, ys);
    const quad = lsq(
        xs.map((x) => x * x),
        ys
    );
    // Per-unit cost at the smallest and largest observed sizes. A flat ratio means linear;
    // a ratio that grows with n means super-linear, whatever the R^2 values say.
    const perUnit = xs.map((x, i) => ys[i] / x);
    const growth = perUnit[0] > 0 ? perUnit[perUnit.length - 1] / perUnit[0] : NaN;
    return {
        linear,
        quadratic: quad,
        perUnitFirst: perUnit[0],
        perUnitLast: perUnit[perUnit.length - 1],
        perUnitGrowth: growth,
        verdict:
            !Number.isFinite(growth)
                ? "indeterminate"
                : growth < 1.35
                  ? "linear"
                  : growth < 2.5
                    ? "mildly super-linear"
                    : "super-linear"
    };
}

module.exports = { summarize, stability, fmt, fitCurve, quantile };
