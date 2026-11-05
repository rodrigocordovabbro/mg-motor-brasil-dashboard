export type FollowerAnalysisPlatform = "instagram" | "tiktok";

export type FollowerAnalysisDailyInput = {
  date: string;
  newFollowers: number;
  dailyReach: number;
  interactions: number;
  views: number;
};

export type FollowerAnalysisContentInput = {
  id: string;
  timestamp: string;
  caption: string;
  thumbnailUrl: string | null;
  permalink: string | null;
  reach: number;
  engagements: number;
  follows: number;
};

type DayType = "weekday" | "weekend";
type WeekendStatus = "pending" | "spike" | "above" | "typical" | "below" | "insufficient";

const DAY_MS = 86_400_000;

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint] ?? 0
    : ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2;
}

function percentChange(current: number, baseline: number) {
  if (baseline === 0) return current === 0 ? 0 : null;
  return round(((current - baseline) / baseline) * 100, 1);
}

function dayOfWeek(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function getDayType(date: string): DayType {
  const day = dayOfWeek(date);
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

function summarizeDays(rows: FollowerAnalysisDailyInput[]) {
  const values = rows.map(row => row.newFollowers);
  return {
    days: rows.length,
    total: round(values.reduce((total, value) => total + value, 0)),
    average: round(average(values), 1),
    median: round(median(values), 1),
    minimum: values.length ? Math.min(...values) : 0,
    maximum: values.length ? Math.max(...values) : 0,
  };
}

function robustUpperThreshold(values: number[], minimumSample = 4) {
  if (values.length < minimumSample) return null;
  const center = median(values);
  const mad = median(values.map(value => Math.abs(value - center)));
  return round(center + Math.max(10, mad * 3), 1);
}

function pearson(
  rows: FollowerAnalysisDailyInput[],
  selector: (row: FollowerAnalysisDailyInput) => number,
) {
  if (rows.length < 5) return null;
  const followers = rows.map(row => row.newFollowers);
  const signal = rows.map(selector);
  const followerMean = average(followers);
  const signalMean = average(signal);
  let numerator = 0;
  let followerSquares = 0;
  let signalSquares = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const followerDelta = (followers[index] ?? 0) - followerMean;
    const signalDelta = (signal[index] ?? 0) - signalMean;
    numerator += followerDelta * signalDelta;
    followerSquares += followerDelta ** 2;
    signalSquares += signalDelta ** 2;
  }
  const denominator = Math.sqrt(followerSquares * signalSquares);
  return denominator > 0 ? round(numerator / denominator, 2) : null;
}

function contentDate(content: FollowerAnalysisContentInput) {
  return content.timestamp.slice(0, 10);
}

function relatedContents(
  contents: FollowerAnalysisContentInput[],
  dateFrom: string,
  dateTo: string,
) {
  const leadInFrom = addDays(dateFrom, -2);
  return contents
    .filter(content => {
      const date = contentDate(content);
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= leadInFrom && date <= dateTo;
    })
    .sort(
      (left, right) =>
        right.follows - left.follows ||
        right.reach - left.reach ||
        right.engagements - left.engagements,
    )
    .slice(0, 3)
    .map(content => ({
      ...content,
      relationship: contentDate(content) < dateFrom ? ("lead-in" as const) : ("during" as const),
    }));
}

function metricTotals(rows: FollowerAnalysisDailyInput[]) {
  return rows.reduce(
    (totals, row) => ({
      reach: totals.reach + row.dailyReach,
      views: totals.views + row.views,
      interactions: totals.interactions + row.interactions,
    }),
    { reach: 0, views: 0, interactions: 0 },
  );
}

export function buildFollowerAnalysis(
  daily: FollowerAnalysisDailyInput[],
  contents: FollowerAnalysisContentInput[],
  platform: FollowerAnalysisPlatform,
) {
  const sortedDaily = [...daily].sort((left, right) => left.date.localeCompare(right.date));
  const pendingDates: string[] = [];

  if (platform === "instagram") {
    for (let index = sortedDaily.length - 1; index >= 0; index -= 1) {
      const row = sortedDaily[index];
      if (!row) continue;
      const hasOtherActivity = row.dailyReach > 0 || row.interactions > 0 || row.views > 0;
      if (row.newFollowers === 0 && hasOtherActivity) {
        pendingDates.unshift(row.date);
        continue;
      }
      break;
    }
  }

  const pendingSet = new Set(pendingDates);
  const reliableRows = sortedDaily.filter(row => !pendingSet.has(row.date));
  const weekdayRows = reliableRows.filter(row => getDayType(row.date) === "weekday");
  const weekendRows = reliableRows.filter(row => getDayType(row.date) === "weekend");
  const weekday = summarizeDays(weekdayRows);
  const weekend = summarizeDays(weekendRows);
  const weekendVsWeekdayPercent = percentChange(weekend.average, weekday.average);

  const dayOfWeekStats = Array.from({ length: 7 }, (_, day) => {
    const rows = reliableRows.filter(row => dayOfWeek(row.date) === day);
    return { day, ...summarizeDays(rows) };
  });

  const weekendsByStart = new Map<string, FollowerAnalysisDailyInput[]>();
  for (const row of sortedDaily) {
    const day = dayOfWeek(row.date);
    if (day !== 0 && day !== 6) continue;
    const start = day === 0 ? addDays(row.date, -1) : row.date;
    const rows = weekendsByStart.get(start) ?? [];
    rows.push(row);
    weekendsByStart.set(start, rows);
  }

  const weekends = Array.from(weekendsByStart.entries())
    .map(([dateFrom, rows]) => {
      const dateTo = addDays(dateFrom, 1);
      const reliable = rows.filter(row => !pendingSet.has(row.date));
      const dateSet = new Set(rows.map(row => row.date));
      const complete =
        dateSet.has(dateFrom) &&
        dateSet.has(dateTo) &&
        !pendingSet.has(dateFrom) &&
        !pendingSet.has(dateTo);
      return {
        dateFrom,
        dateTo,
        complete,
        pendingDates: rows.filter(row => pendingSet.has(row.date)).map(row => row.date),
        reportedFollowerDays: reliable.length,
        followerTotal: round(reliable.reduce((total, row) => total + row.newFollowers, 0)),
        followerDailyAverage: round(average(reliable.map(row => row.newFollowers)), 1),
        ...metricTotals(rows),
        relatedContents: relatedContents(contents, dateFrom, dateTo),
      };
    })
    .sort((left, right) => left.dateFrom.localeCompare(right.dateFrom));

  const latestWeekend = weekends.at(-1) ?? null;
  const previousCompletedWeekends = latestWeekend
    ? weekends.filter(
        weekendPeriod =>
          weekendPeriod.complete && weekendPeriod.dateFrom < latestWeekend.dateFrom,
      )
    : [];
  const completedWeekendTotals = previousCompletedWeekends.map(
    weekendPeriod => weekendPeriod.followerTotal,
  );
  const completedWeekendFollowerDays = previousCompletedWeekends.flatMap(weekendPeriod =>
    sortedDaily.filter(
      row =>
        row.date >= weekendPeriod.dateFrom &&
        row.date <= weekendPeriod.dateTo &&
        !pendingSet.has(row.date),
    ),
  );
  const weekendBenchmarkDailyAverage = round(
    average(completedWeekendFollowerDays.map(row => row.newFollowers)),
    1,
  );
  const weekendBenchmarkTotalAverage = round(average(completedWeekendTotals), 1);
  const weekendBenchmarkTotalMedian = round(median(completedWeekendTotals), 1);
  const weekendOutlierThreshold = robustUpperThreshold(completedWeekendTotals, 3);

  let latestWeekendStatus: WeekendStatus = "insufficient";
  if (latestWeekend) {
    if (!latestWeekend.complete) latestWeekendStatus = "pending";
    else if (previousCompletedWeekends.length < 2) latestWeekendStatus = "insufficient";
    else if (
      weekendOutlierThreshold != null &&
      latestWeekend.followerTotal >= weekendOutlierThreshold &&
      latestWeekend.followerTotal > weekendBenchmarkTotalMedian * 1.25
    ) latestWeekendStatus = "spike";
    else if (latestWeekend.followerTotal > weekendBenchmarkTotalMedian * 1.15) {
      latestWeekendStatus = "above";
    } else if (latestWeekend.followerTotal < weekendBenchmarkTotalMedian * 0.75) {
      latestWeekendStatus = "below";
    } else latestWeekendStatus = "typical";
  }

  const previousWeekendMetricAverages = previousCompletedWeekends.length
    ? {
        reach: average(previousCompletedWeekends.map(item => item.reach)),
        views: average(previousCompletedWeekends.map(item => item.views)),
        interactions: average(previousCompletedWeekends.map(item => item.interactions)),
      }
    : { reach: 0, views: 0, interactions: 0 };

  const latestWeekendAnalysis = latestWeekend
    ? {
        ...latestWeekend,
        status: latestWeekendStatus,
        followerDifferencePercent: percentChange(
          latestWeekend.followerDailyAverage,
          weekendBenchmarkDailyAverage,
        ),
        benchmarkDailyAverage: weekendBenchmarkDailyAverage,
        reachDifferencePercent: percentChange(
          latestWeekend.reach,
          previousWeekendMetricAverages.reach,
        ),
        viewsDifferencePercent: percentChange(
          latestWeekend.views,
          previousWeekendMetricAverages.views,
        ),
        interactionsDifferencePercent: percentChange(
          latestWeekend.interactions,
          previousWeekendMetricAverages.interactions,
        ),
      }
    : null;

  const dailyValues = reliableRows.map(row => row.newFollowers);
  const dailyThreshold = robustUpperThreshold(dailyValues);
  const anomalies = dailyThreshold == null
    ? []
    : reliableRows
        .filter(row => row.newFollowers >= dailyThreshold)
        .map(row => ({
          date: row.date,
          dayType: getDayType(row.date),
          followers: row.newFollowers,
          threshold: dailyThreshold,
          upliftVsTypicalPercent: percentChange(row.newFollowers, median(dailyValues)),
          reach: row.dailyReach,
          views: row.views,
          interactions: row.interactions,
          relatedContents: relatedContents(contents, row.date, row.date),
        }))
        .sort(
          (left, right) =>
            right.followers - left.followers || right.date.localeCompare(left.date),
        )
        .slice(0, 5);

  const correlations = [
    { metric: "reach" as const, coefficient: pearson(reliableRows, row => row.dailyReach) },
    { metric: "views" as const, coefficient: pearson(reliableRows, row => row.views) },
    { metric: "interactions" as const, coefficient: pearson(reliableRows, row => row.interactions) },
  ];
  const strongestCorrelation = [...correlations]
    .filter(item => item.coefficient != null)
    .sort(
      (left, right) =>
        Math.abs(right.coefficient ?? 0) - Math.abs(left.coefficient ?? 0),
    )[0] ?? null;

  const anomalyDates = new Set(anomalies.map(item => item.date));
  return {
    available: reliableRows.some(row => row.newFollowers !== 0),
    dataQuality: {
      reliableThroughDate: reliableRows.at(-1)?.date ?? null,
      pendingDates,
      complete: pendingDates.length === 0,
    },
    weekday,
    weekend,
    weekendVsWeekdayPercent,
    dayOfWeek: dayOfWeekStats,
    benchmark: {
      completedWeekendCount: previousCompletedWeekends.length,
      weekendDailyAverage: weekendBenchmarkDailyAverage,
      weekendTotalAverage: weekendBenchmarkTotalAverage,
      weekendTotalMedian: weekendBenchmarkTotalMedian,
      weekendOutlierThreshold,
      dailyOutlierThreshold: dailyThreshold,
    },
    latestWeekend: latestWeekendAnalysis,
    anomalies,
    correlations,
    strongestCorrelation,
    timeline: sortedDaily.map(row => ({
      date: row.date,
      newFollowers: row.newFollowers,
      dayType: getDayType(row.date),
      pending: pendingSet.has(row.date),
      anomaly: anomalyDates.has(row.date),
    })),
    confidence:
      reliableRows.length >= 28 && previousCompletedWeekends.length >= 3
        ? ("high" as const)
        : reliableRows.length >= 14 && previousCompletedWeekends.length >= 2
          ? ("medium" as const)
          : ("low" as const),
  };
}
