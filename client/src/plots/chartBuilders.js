import { round3, wrapLabel } from "./chartUtils";

function quantile(arr, q) {
  if (!arr || arr.length === 0) {
    return NaN;
  }
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (arr[base + 1] !== undefined) {
    return arr[base] + rest * (arr[base + 1] - arr[base]);
  }
  return arr[base];
}

export function buildTrendChart(rawData, cfg, palette) {
  const {
    parameter,
    selectedSites = [],
    startYear,
    endYear,
    trendIndex,
  } = cfg;

  let site = null;
  if (selectedSites.length) {
    const count = selectedSites.length;
    let index = Number.isFinite(trendIndex) ? trendIndex : count - 1;
    index = ((index % count) + count) % count;
    site = selectedSites[index] || selectedSites[count - 1];
  }

  const filtered = rawData.filter((row) => {
    const rowParam = row?.Parameter ? String(row.Parameter).trim() : "";
    const rowSite = row?.Site ? String(row.Site).trim() : "";
    const yearNum = parseInt(row?.Year, 10);
    return (
      rowParam === parameter &&
      (!!site && rowSite === site) &&
      Number.isFinite(yearNum) &&
      (startYear == null || yearNum >= startYear) &&
      (endYear == null || yearNum <= endYear)
    );
  });

  const groupAvgs = {};
  const groupMins = {};
  const groupMaxs = {};
  const countByYear = {};

  filtered.forEach((row) => {
    const year = row.Year;
    const avgVal = round3(parseFloat(row.Avg));
    const minVal = round3(parseFloat(row.Min));
    const maxVal = round3(parseFloat(row.Max));
    const count = parseInt(row.Count, 10);

    if (Number.isFinite(avgVal)) {
      (groupAvgs[year] ||= []).push(avgVal);
    }
    if (Number.isFinite(minVal)) {
      (groupMins[year] ||= []).push(minVal);
    }
    if (Number.isFinite(maxVal)) {
      (groupMaxs[year] ||= []).push(maxVal);
    }
    if (Number.isFinite(count)) {
      countByYear[year] = (countByYear[year] || 0) + count;
    }
  });

  const years = Array.from(
    new Set([...Object.keys(groupAvgs), ...Object.keys(groupMins), ...Object.keys(groupMaxs)])
  ).sort((a, b) => +a - +b);

  const boxData = [];
  const counts = [];

  years.forEach((year) => {
    const avgs = groupAvgs[year] || [];
    if (!avgs.length) {
      return;
    }

    const sorted = avgs.slice().sort((a, b) => a - b);
    const meanAvg = avgs.reduce((sum, value) => sum + value, 0) / avgs.length;
    const q1 = quantile(sorted, 0.25);
    const median = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    const mins = groupMins[year] || [];
    const maxs = groupMaxs[year] || [];
    const minVal = mins.length ? Math.min(...mins) : meanAvg;
    const maxVal = maxs.length ? Math.max(...maxs) : meanAvg;

    boxData.push({
      min: round3(minVal),
      q1: round3(q1),
      median: round3(median),
      q3: round3(q3),
      max: round3(maxVal),
      mean: round3(meanAvg),
    });
    counts.push(countByYear[year] || 0);
  });

  return {
    title: site ? `${parameter} Trend for ${site}` : "Trend",
    subtitle: parameter ? `${parameter} by year` : "",
    type: "boxplot",
    data: {
      labels: years,
      datasets: [
        {
          label: parameter,
          data: boxData,
          backgroundColor: palette[0],
          borderColor: palette[0],
          customCounts: counts,
        },
      ],
    },
  };
}

export function buildComparisonChart(rawData, cfg, palette) {
  const { parameter, selectedSites = [], startYear, endYear } = cfg;
  const subtitle = `Selected lakes (n): ${new Set(selectedSites).size}`;

  const filtered = rawData.filter((row) => {
    const rowParam = row?.Parameter ? String(row.Parameter).trim() : "";
    const rowSite = row?.Site ? String(row.Site).trim() : "";
    const yearNum = parseInt(row?.Year, 10);
    return (
      rowParam === parameter &&
      selectedSites.includes(rowSite) &&
      Number.isFinite(yearNum) &&
      (startYear == null || yearNum >= startYear) &&
      (endYear == null || yearNum <= endYear)
    );
  });

  const groups = {};
  const countsBySite = {};
  filtered.forEach((row) => {
    const site = row?.Site ? String(row.Site).trim() : "";
    const avgVal = round3(parseFloat(row.Avg));
    const count = parseInt(row.Count, 10);
    if (!site || !Number.isFinite(avgVal)) {
      return;
    }
    (groups[site] ||= []).push(avgVal);
    countsBySite[site] = (countsBySite[site] || 0) + (Number.isFinite(count) ? count : 0);
  });

  const sites = Object.keys(groups);
  const values = sites.map((site) => {
    const series = groups[site];
    const mean = series.reduce((sum, value) => sum + value, 0) / series.length;
    return round3(mean);
  });
  const counts = sites.map((site) => countsBySite[site] || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    title: `${parameter} Comparison by Site`,
    type: "d3bar",
    subtitle,
    yMeta: {
      suggestedMin: round3(min),
      suggestedMax: round3(max),
    },
    data: {
      labels: sites.map((site) => wrapLabel(site, 12)),
      datasets: [
        {
          label: parameter,
          data: values,
          backgroundColor: sites.map((_, index) => palette[index % palette.length]),
          customCounts: counts,
        },
      ],
    },
  };
}
