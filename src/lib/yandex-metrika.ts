type MetrikaDimension = {
  name?: string | null;
};

type MetrikaRow = {
  dimensions?: MetrikaDimension[];
  metrics?: number[];
};

type MetrikaResponse = {
  data?: MetrikaRow[];
  errors?: Array<{ message?: string }>;
  message?: string;
};

export type MetrikaDailyRow = {
  date: string;
  visits: number;
  users: number;
  pageviews: number;
  bounceRate: number;
  depth: number;
  duration: number;
  ecommercePurchases: number;
  checkoutSteps: number;
  addToCartActions: number;
  ecommerceAddToCart: number;
};

export type MetrikaSourceRow = {
  source: string;
  todayVisits: number;
  yesterdayVisits: number;
  deltaPercent: number | null;
};

export type MetrikaSearchEngineRow = {
  engine: string;
  visits: number;
  users: number;
  bounceRate: number;
};

export type MetrikaLandingRow = {
  url: string;
  visits: number;
  users: number;
  bounceRate: number;
  depth: number;
};

export type MetrikaOverview = {
  configured: true;
  counterId: string;
  generatedAt: string;
  latestCompleteHour: string | null;
  today: MetrikaDailyRow | null;
  yesterday: MetrikaDailyRow | null;
  sameHours: {
    todayVisits: number;
    yesterdayVisits: number;
    todayUsers: number;
    yesterdayUsers: number;
    todayPageviews: number;
    yesterdayPageviews: number;
    visitsDeltaPercent: number | null;
  };
  lastThreeHours: {
    todayVisits: number;
    yesterdayVisits: number;
    visitsDeltaPercent: number | null;
  };
  movement: {
    label: string;
    tone: 'good' | 'warning' | 'bad';
    summary: string;
  };
  sources: MetrikaSourceRow[];
  searchEnginesToday: MetrikaSearchEngineRow[];
  topLandingsToday: MetrikaLandingRow[];
  dailyRows: MetrikaDailyRow[];
};

export type MetrikaUnavailable = {
  configured: false;
  error?: string;
};

export type MetrikaData = MetrikaOverview | MetrikaUnavailable;

const COUNTER_ID = process.env.YANDEX_METRIKA_COUNTER_ID ?? '47438650';
const TOKEN = process.env.YANDEX_METRIKA_TOKEN;
const API_URL = 'https://api-metrika.yandex.net/stat/v1/data';

const GOALS = {
  ecommercePurchase: '268919825',
  checkout: '271631581',
  addToCartAction: '271637228',
  ecommerceAddToCart: '268885078',
};

const SOURCE_LABELS: Record<string, string> = {
  'Search engine traffic': 'Поиск',
  'Direct traffic': 'Прямые заходы',
  'Link traffic': 'Переходы по ссылкам',
  'Internal traffic': 'Внутренние переходы',
  'Recommendation system traffic': 'Рекомендательные системы',
  null: 'Не определено',
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function metric(row: MetrikaRow, index: number) {
  return row.metrics?.[index] ?? 0;
}

function dimension(row: MetrikaRow, index: number) {
  return row.dimensions?.[index]?.name ?? '';
}

function round(value: number, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function percentDelta(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return round(((current - previous) / previous) * 100, 1);
}

function sourceLabel(value: string) {
  return SOURCE_LABELS[value] ?? value;
}

function isToday(date: Date, timeZone = 'Asia/Almaty') {
  const current = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const candidate = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return current === candidate;
}

async function fetchMetrika(params: Record<string, string | number>) {
  if (!TOKEN) {
    throw new Error('YANDEX_METRIKA_TOKEN не задан');
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const url = new URL(API_URL);
    url.searchParams.set('ids', COUNTER_ID);
    url.searchParams.set('accuracy', 'full');
    url.searchParams.set('limit', '500');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      headers: { Authorization: `OAuth ${TOKEN}` },
      next: { revalidate: 300 },
    });
    const json = (await response.json()) as MetrikaResponse;

    if (response.ok && !json.errors?.length) {
      return json;
    }

    const message = json.errors?.[0]?.message ?? json.message ?? `Метрика вернула HTTP ${response.status}`;
    if (attempt < 2 && message.toLowerCase().includes('quota exceeded')) {
      await sleep(750 * (attempt + 1));
      continue;
    }

    throw new Error(message);
  }

  throw new Error('Метрика не ответила');
}

function toDailyRows(daily: MetrikaResponse, goals: MetrikaResponse) {
  const goalRows = new Map<string, MetrikaRow>();
  for (const row of goals.data ?? []) {
    goalRows.set(dimension(row, 0), row);
  }

  return (daily.data ?? [])
    .map((row) => {
      const date = dimension(row, 0);
      const goal = goalRows.get(date);
      return {
        date,
        visits: metric(row, 0),
        users: metric(row, 1),
        pageviews: metric(row, 2),
        bounceRate: metric(row, 3),
        depth: metric(row, 4),
        duration: metric(row, 5),
        ecommercePurchases: goal ? metric(goal, 1) : 0,
        checkoutSteps: goal ? metric(goal, 2) : 0,
        addToCartActions: goal ? metric(goal, 3) : 0,
        ecommerceAddToCart: goal ? metric(goal, 4) : 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateHourly(response: MetrikaResponse) {
  const dates = Array.from(new Set((response.data ?? []).map((row) => dimension(row, 0)).filter(Boolean))).sort();
  const todayDate = dates.at(-1) ?? '';
  const yesterdayDate = dates.at(-2) ?? dates[0] ?? '';
  const todayRows = (response.data ?? []).filter((row) => dimension(row, 0) === todayDate);
  const yesterdayRows = (response.data ?? []).filter((row) => dimension(row, 0) === yesterdayDate);
  const hours = todayRows.map((row) => dimension(row, 1)).filter(Boolean).sort();
  const maxHour = hours.at(-1) ?? null;
  const latestCompleteHour = maxHour && todayRows.length > 1 ? hours.at(-2) ?? maxHour : maxHour;

  const sum = (rows: MetrikaRow[], metricIndex: number, hourLimit: string | null) =>
    rows
      .filter((row) => !hourLimit || dimension(row, 1) <= hourLimit)
      .reduce((total, row) => total + metric(row, metricIndex), 0);

  const lastThreeHours = latestCompleteHour
    ? hours.filter((hour) => hour <= latestCompleteHour).slice(-3)
    : [];
  const sumLastThree = (rows: MetrikaRow[]) =>
    rows
      .filter((row) => lastThreeHours.includes(dimension(row, 1)))
      .reduce((total, row) => total + metric(row, 0), 0);

  const todayVisits = sum(todayRows, 0, latestCompleteHour);
  const yesterdayVisits = sum(yesterdayRows, 0, latestCompleteHour);
  const todayLastThree = sumLastThree(todayRows);
  const yesterdayLastThree = sumLastThree(yesterdayRows);

  return {
    latestCompleteHour,
    sameHours: {
      todayVisits,
      yesterdayVisits,
      todayUsers: sum(todayRows, 1, latestCompleteHour),
      yesterdayUsers: sum(yesterdayRows, 1, latestCompleteHour),
      todayPageviews: sum(todayRows, 2, latestCompleteHour),
      yesterdayPageviews: sum(yesterdayRows, 2, latestCompleteHour),
      visitsDeltaPercent: percentDelta(todayVisits, yesterdayVisits),
    },
    lastThreeHours: {
      todayVisits: todayLastThree,
      yesterdayVisits: yesterdayLastThree,
      visitsDeltaPercent: percentDelta(todayLastThree, yesterdayLastThree),
    },
  };
}

function aggregateSources(response: MetrikaResponse, latestCompleteHour: string | null) {
  const totals = new Map<string, { today: number; yesterday: number }>();
  const dates = Array.from(new Set((response.data ?? []).map((row) => dimension(row, 0)).filter(Boolean))).sort();
  const todayDate = dates.at(-1) ?? '';
  const yesterdayDate = dates.at(-2) ?? dates[0] ?? '';

  for (const row of response.data ?? []) {
    const date = dimension(row, 0);
    const hour = dimension(row, 1);
    if (latestCompleteHour && hour > latestCompleteHour) continue;
    const source = sourceLabel(dimension(row, 2) || 'null');
    const current = totals.get(source) ?? { today: 0, yesterday: 0 };
    if (date === todayDate) current.today += metric(row, 0);
    if (date === yesterdayDate) current.yesterday += metric(row, 0);
    totals.set(source, current);
  }

  return Array.from(totals.entries())
    .map(([source, values]) => ({
      source,
      todayVisits: values.today,
      yesterdayVisits: values.yesterday,
      deltaPercent: percentDelta(values.today, values.yesterday),
    }))
    .sort((a, b) => b.todayVisits - a.todayVisits)
    .slice(0, 8);
}

function movementLabel(sameHoursDelta: number | null, lastThreeDelta: number | null) {
  if (lastThreeDelta !== null && lastThreeDelta >= 5) {
    return {
      label: 'Движение вверх',
      tone: 'good' as const,
      summary: 'Последние полные часы идут лучше вчерашнего окна.',
    };
  }
  if (sameHoursDelta !== null && sameHoursDelta >= -10) {
    return {
      label: 'Почти стабилизация',
      tone: 'warning' as const,
      summary: 'Трафик ниже нормы, но просадка уже не выглядит резкой.',
    };
  }
  return {
    label: 'Еще в просадке',
    tone: 'bad' as const,
    summary: 'Нужно смотреть поиск, фиды и посадочные страницы.',
  };
}

export async function getYandexMetrikaOverview(): Promise<MetrikaData> {
  if (!TOKEN) {
    return { configured: false, error: 'YANDEX_METRIKA_TOKEN не задан' };
  }

  try {
    const daily = await fetchMetrika({
      date1: '7daysAgo',
      date2: 'today',
      metrics: 'ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:pageDepth,ym:s:avgVisitDurationSeconds',
      dimensions: 'ym:s:date',
      sort: 'ym:s:date',
    });
    const hourly = await fetchMetrika({
      date1: 'yesterday',
      date2: 'today',
      metrics: 'ym:s:visits,ym:s:users,ym:s:pageviews',
      dimensions: 'ym:s:date,ym:s:hour',
      sort: 'ym:s:date,ym:s:hour',
    });
    const sourceHourly = await fetchMetrika({
      date1: 'yesterday',
      date2: 'today',
      metrics: 'ym:s:visits,ym:s:users',
      dimensions: 'ym:s:date,ym:s:hour,ym:s:lastsignTrafficSource',
      sort: 'ym:s:date,ym:s:hour',
    });
    const engines = await fetchMetrika({
      date1: 'today',
      date2: 'today',
      metrics: 'ym:s:visits,ym:s:users,ym:s:bounceRate',
      dimensions: 'ym:s:lastsignSearchEngine',
      sort: '-ym:s:visits',
      limit: 10,
    });
    const landings = await fetchMetrika({
      date1: 'today',
      date2: 'today',
      metrics: 'ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:pageDepth',
      dimensions: 'ym:s:startURL',
      sort: '-ym:s:visits',
      limit: 12,
    });
    const goals = await fetchMetrika({
      date1: '7daysAgo',
      date2: 'today',
      metrics: `ym:s:visits,ym:s:goal${GOALS.ecommercePurchase}reaches,ym:s:goal${GOALS.checkout}reaches,ym:s:goal${GOALS.addToCartAction}reaches,ym:s:goal${GOALS.ecommerceAddToCart}reaches`,
      dimensions: 'ym:s:date',
      sort: 'ym:s:date',
    });

    const dailyRows = toDailyRows(daily, goals);
    const today = dailyRows.find((row) => isToday(new Date(`${row.date}T00:00:00+06:00`))) ?? dailyRows.at(-1) ?? null;
    const yesterday = dailyRows.at(-2) ?? null;
    const hourlySummary = aggregateHourly(hourly);

    return {
      configured: true,
      counterId: COUNTER_ID,
      generatedAt: new Date().toISOString(),
      latestCompleteHour: hourlySummary.latestCompleteHour,
      today,
      yesterday,
      sameHours: hourlySummary.sameHours,
      lastThreeHours: hourlySummary.lastThreeHours,
      movement: movementLabel(hourlySummary.sameHours.visitsDeltaPercent, hourlySummary.lastThreeHours.visitsDeltaPercent),
      sources: aggregateSources(sourceHourly, hourlySummary.latestCompleteHour),
      searchEnginesToday: (engines.data ?? []).map((row) => ({
        engine: dimension(row, 0) || 'Не определено',
        visits: metric(row, 0),
        users: metric(row, 1),
        bounceRate: metric(row, 2),
      })),
      topLandingsToday: (landings.data ?? []).map((row) => ({
        url: dimension(row, 0),
        visits: metric(row, 0),
        users: metric(row, 1),
        bounceRate: metric(row, 2),
        depth: metric(row, 3),
      })),
      dailyRows,
    };
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : 'Не удалось получить данные Метрики',
    };
  }
}
