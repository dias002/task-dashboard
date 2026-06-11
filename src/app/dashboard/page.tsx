import type { Metadata } from 'next';

import { getYandexMetrikaOverview, type MetrikaDailyRow } from '@/lib/yandex-metrika';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Метрика Velor Express',
  description: 'Операционная панель Яндекс.Метрики для Velor Express.',
};

function numberFormat(value: number | null | undefined) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value ?? 0);
}

function percentFormat(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${value > 0 ? '+' : ''}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)}%`;
}

function rateFormat(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)}%`;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(new Date(`${value}T00:00:00`));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function duration(seconds: number | null | undefined) {
  const value = seconds ?? 0;
  const minutes = Math.floor(value / 60);
  const rest = Math.round(value % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function deltaClass(delta: number | null | undefined) {
  if (delta === null || delta === undefined) return 'metricMuted';
  if (delta >= 0) return 'metricGood';
  if (delta >= -10) return 'metricWarn';
  return 'metricBad';
}

function urlLabel(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/' ? '/' : parsed.pathname.replace(/^\/+/, '');
  } catch {
    return url;
  }
}

function DailyChart({ rows }: { rows: MetrikaDailyRow[] }) {
  const maxVisits = Math.max(...rows.map((row) => row.visits), 1);

  return (
    <div className="metricBars">
      {rows.map((row) => (
        <div className="metricBarCell" key={row.date}>
          <div className="metricBarTrack">
            <div className="metricBarFill" style={{ height: `${Math.max(7, (row.visits / maxVisits) * 100)}%` }} />
          </div>
          <span>{shortDate(row.date)}</span>
          <strong>{numberFormat(row.visits)}</strong>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const data = await getYandexMetrikaOverview();

  if (!data.configured) {
    return (
      <main className="page">
        <section className="hero compactHero">
          <div>
            <p className="eyebrow">Velor Analytics</p>
            <h1>Метрика Velor Express</h1>
            <p className="lead">Панель не смогла получить данные Яндекс.Метрики. Проверьте production env в Vercel.</p>
          </div>
          <div className="stats">
            <a className="statLink" href="/"><strong>←</strong><span>задачи</span></a>
            <div><strong>!</strong><span>нет данных</span></div>
          </div>
        </section>

        <section className="layout singleLayout">
          <div className="panel">
            <p className="eyebrow smallEyebrow">Ошибка</p>
            <h2>Метрика недоступна</h2>
            <p className="metricLead">{data.error ?? 'YANDEX_METRIKA_TOKEN не задан'}</p>
          </div>
        </section>
      </main>
    );
  }

  const today = data.today;
  const yesterday = data.yesterday;
  const searchSource = data.sources.find((source) => source.source === 'Поиск');
  const yandexVisits = data.searchEnginesToday
    .filter((engine) => {
      const name = engine.engine.toLowerCase();
      return name.includes('yandex') || name.includes('янд');
    })
    .reduce((sum, engine) => sum + engine.visits, 0);

  return (
    <main className="page">
      <section className="hero compactHero metricHero">
        <div>
          <p className="eyebrow">Velor Analytics</p>
          <h1>Метрика Velor Express</h1>
          <p className="lead">
            Счетчик {data.counterId}. Обновлено {dateTime(data.generatedAt)}
            {data.latestCompleteHour ? `, последний полный час ${data.latestCompleteHour}` : ''}.
          </p>
        </div>
        <div className="stats fourStats">
          <div><strong>{numberFormat(data.sameHours.todayVisits)}</strong><span>визиты к часу</span></div>
          <div><strong>{numberFormat(data.sameHours.todayUsers)}</strong><span>посетители</span></div>
          <div><strong>{numberFormat(yandexVisits)}</strong><span>яндекс сегодня</span></div>
          <a className="statLink" href="/"><strong>←</strong><span>к задачам</span></a>
        </div>
      </section>

      <nav className="shellNav">
        <a href="/">Задачи</a>
        <a href="/completed">Архив</a>
        <a href="/admin">Команда и роли</a>
        <a className="active" href="/dashboard">Метрика</a>
      </nav>

      <section className="metricGrid">
        <div className={`panel metricStatus metricStatus-${data.movement.tone}`}>
          <div>
            <p className="eyebrow smallEyebrow">Сдвиг</p>
            <h2>{data.movement.label}</h2>
            <p className="metricLead">{data.movement.summary}</p>
          </div>
          <div className="metricStatusGrid">
            <div>
              <span>Сегодня / вчера к часу</span>
              <strong>{numberFormat(data.sameHours.todayVisits)} / {numberFormat(data.sameHours.yesterdayVisits)}</strong>
              <em className={deltaClass(data.sameHours.visitsDeltaPercent)}>{percentFormat(data.sameHours.visitsDeltaPercent)}</em>
            </div>
            <div>
              <span>Последние 3 полных часа</span>
              <strong>{numberFormat(data.lastThreeHours.todayVisits)} / {numberFormat(data.lastThreeHours.yesterdayVisits)}</strong>
              <em className={deltaClass(data.lastThreeHours.visitsDeltaPercent)}>{percentFormat(data.lastThreeHours.visitsDeltaPercent)}</em>
            </div>
            <div>
              <span>Поиск к тому же часу</span>
              <strong>{numberFormat(searchSource?.todayVisits)} / {numberFormat(searchSource?.yesterdayVisits)}</strong>
              <em className={deltaClass(searchSource?.deltaPercent)}>{percentFormat(searchSource?.deltaPercent)}</em>
            </div>
          </div>
        </div>

        <section className="metricCards">
          <div className="panel metricCard">
            <span>Просмотры к часу</span>
            <strong>{numberFormat(data.sameHours.todayPageviews)}</strong>
            <p>вчера {numberFormat(data.sameHours.yesterdayPageviews)}</p>
          </div>
          <div className="panel metricCard">
            <span>Корзина / покупки</span>
            <strong>{numberFormat(today?.ecommerceAddToCart)} / {numberFormat(today?.ecommercePurchases)}</strong>
            <p>вчера покупки {numberFormat(yesterday?.ecommercePurchases)}</p>
          </div>
          <div className="panel metricCard">
            <span>Отказы сегодня</span>
            <strong>{rateFormat(today?.bounceRate)}</strong>
            <p>глубина {today?.depth.toFixed(1) ?? '-'}</p>
          </div>
          <div className="panel metricCard">
            <span>Время на сайте</span>
            <strong>{duration(today?.duration)}</strong>
            <p>средняя длительность визита</p>
          </div>
        </section>

        <section className="panel metricWide">
          <div className="tasksHead">
            <div>
              <p className="eyebrow smallEyebrow">Динамика</p>
              <h2>8 дней по визитам</h2>
            </div>
          </div>
          <DailyChart rows={data.dailyRows} />
          <div className="metricTableWrap">
            <table className="metricTable">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Визиты</th>
                  <th>Посетители</th>
                  <th>Отказы</th>
                  <th>Время</th>
                  <th>Корзина</th>
                  <th>Покупки</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyRows.map((row) => (
                  <tr key={row.date}>
                    <td>{shortDate(row.date)}</td>
                    <td>{numberFormat(row.visits)}</td>
                    <td>{numberFormat(row.users)}</td>
                    <td>{rateFormat(row.bounceRate)}</td>
                    <td>{duration(row.duration)}</td>
                    <td>{numberFormat(row.ecommerceAddToCart)}</td>
                    <td>{numberFormat(row.ecommercePurchases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel metricPanel">
          <p className="eyebrow smallEyebrow">Источники</p>
          <h2>К тому же часу</h2>
          <div className="metricStack">
            {data.sources.map((source) => (
              <div className="metricSource" key={source.source}>
                <div>
                  <strong>{source.source}</strong>
                  <span>{numberFormat(source.todayVisits)} сегодня · {numberFormat(source.yesterdayVisits)} вчера</span>
                </div>
                <em className={deltaClass(source.deltaPercent)}>{percentFormat(source.deltaPercent)}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel metricPanel">
          <p className="eyebrow smallEyebrow">Поиск</p>
          <h2>Поисковые системы</h2>
          <div className="metricStack">
            {data.searchEnginesToday.map((engine) => (
              <div className="metricSource" key={engine.engine}>
                <div>
                  <strong>{engine.engine}</strong>
                  <span>отказы {rateFormat(engine.bounceRate)}</span>
                </div>
                <em>{numberFormat(engine.visits)}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel metricWide">
          <div className="tasksHead">
            <div>
              <p className="eyebrow smallEyebrow">Посадочные</p>
              <h2>Топ входов сегодня</h2>
            </div>
          </div>
          <div className="metricLandingGrid">
            {data.topLandingsToday.map((landing) => (
              <article className="metricLanding" key={landing.url}>
                <div>
                  <strong title={landing.url}>{urlLabel(landing.url)}</strong>
                  <span>отказы {rateFormat(landing.bounceRate)} · глубина {landing.depth.toFixed(1)}</span>
                </div>
                <em>{numberFormat(landing.visits)}</em>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
