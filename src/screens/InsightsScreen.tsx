import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { RATING_COLOR } from '../components/colors'
import { Card, inputClass, PageHeader } from '../components/ui'
import { cx } from '../components/colors'
import { useData } from '../data/DataContext'
import { analyze, formatPct, formatRate, labelOf, type BeforeAfterRow, type RateStat } from '../lib/analysis'
import { fmt1, fmt2, formatDate, formatDateTime } from '../lib/format'
import { RATING_LABEL } from '../lib/labels'
import { RATINGS, type Rating } from '../lib/types'

const AXIS = { stroke: 'var(--ink-2)', fontSize: 12, tickLine: false } as const
const GRID = <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
const RATING_SHAPE: Record<Rating, 'circle' | 'triangle' | 'square'> = { good: 'circle', hesitates: 'triangle', no_power: 'square' }
const RATING_Y: Record<Rating, number> = { good: 0, hesitates: 1, no_power: 2 }

/** "6–51 %" */
function ciText(s: RateStat) {
  return s.low != null && s.high != null ? `${Math.round(s.low * 100)}–${formatPct(s.high)}` : ''
}

function rateOrFew(s: RateStat) {
  if (s.total === 0) return 'ingen ture'
  return s.sufficient ? formatRate(s) : `for få ture (${s.total})`
}

const tooltipStyle = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)', fontSize: 13 },
  itemStyle: { color: 'var(--ink)' },
  labelStyle: { color: 'var(--ink-2)' },
}

export function InsightsScreen() {
  const { trips, events, settings } = useData()
  const a = useMemo(() => analyze(trips, events, settings), [trips, events, settings])

  if (trips.length === 0) {
    return (
      <div>
        <PageHeader title="Indsigt" />
        <Card>Log nogle ture først – så dukker mønstrene op her.</Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Indsigt" />
      <SignalsCard a={a} minSample={settings.minSampleSize} />
      <TimelineCard />
      <Card title="Problemrate pr. faktor" testId="factor-charts">
        <p className="mb-3 text-sm text-[var(--ink-2)]">
          Andel ture med “Hakker” eller “Ingen power”. Stregen viser 95 %-konfidensintervallet: jo bredere, jo mere usikkert. Grupper med under {settings.minSampleSize} ture vises ikke som rate.
        </p>
        <div className="space-y-6">
          {a.groupings
            .filter((g) => g.groups.length > 0)
            .map((g) => (
              <RateBars key={g.id} title={g.title} rows={g.groups.map((x) => ({ key: x.key, label: x.label, stat: x.stat }))} note={g.unclassified > 0 ? `${g.unclassified} ture uden data` : undefined} />
            ))}
          <RateBars
            title="Hvornår skete det (andel af problemture)"
            rows={a.situations.map((s) => ({ key: s.situation, label: s.label, stat: s.stat }))}
          />
        </div>
      </Card>
      <ScatterCard />
      <BeforeAfterCard rows={a.beforeAfter} window={settings.beforeAfterWindow} />
      <OilCard oil={a.oil} />
    </div>
  )
}

function SignalsCard({ a, minSample }: { a: ReturnType<typeof analyze>; minSample: number }) {
  return (
    <Card title="Stærkeste signaler" testId="signals">
      <p className="mb-3 text-sm" data-testid="overall-rate">
        Samlet problemrate: <strong>{a.overall.sufficient ? formatRate(a.overall) : `for få ture (${a.overall.total})`}</strong>
        {a.overall.sufficient && <span className="text-[var(--ink-2)]"> · 95 %-interval {ciText(a.overall)}</span>}
      </p>
      {a.signals.length === 0 ? (
        <p className="text-sm text-[var(--ink-2)]">Ingen signaler endnu. Der skal være mindst {minSample} ture på begge sider af en sammenligning.</p>
      ) : (
        <ol className="space-y-2">
          {a.signals.map((s) => (
            <li key={`${s.groupingId}-${s.groupKey}`} className="rounded-xl bg-[var(--surface)] p-3 text-sm">
              <span className="font-semibold">{s.text}</span>
              <span className={cx('mt-1 block text-xs', s.overlapping ? 'text-[var(--ink-2)]' : 'font-semibold')}>
                {s.overlapping ? 'Usikkert: konfidensintervallerne overlapper.' : 'Intervallerne overlapper ikke – værd at undersøge.'}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-[var(--ink-2)]">Det er sammenhænge, ikke beviser. Flere faktorer hænger sammen (fx kold motor og lav temperatur).</p>
    </Card>
  )
}

interface RateRow {
  key: string
  label: string
  stat: RateStat
}

function RateBars({ title, rows, note }: { title: string; rows: RateRow[]; note?: string }) {
  const data = rows.map((r) => ({
    label: r.label,
    value: r.stat.sufficient && r.stat.rate != null ? r.stat.rate * 100 : null,
    err: r.stat.sufficient && r.stat.rate != null ? [(r.stat.rate - (r.stat.low ?? 0)) * 100, ((r.stat.high ?? 0) - r.stat.rate) * 100] : [0, 0],
    stat: r.stat,
  }))
  return (
    <div data-testid={`rate-${title}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ResponsiveContainer width="100%" height={rows.length * 34 + 36}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
          {GRID}
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit=" %" {...AXIS} />
          <YAxis type="category" dataKey="label" width={92} {...AXIS} />
          <Tooltip
            {...tooltipStyle}
            cursor={{ fill: 'var(--line)', opacity: 0.4 }}
            formatter={(_v, _n, item) => {
              const s = (item.payload as { stat: RateStat }).stat
              return [s.sufficient ? `${formatRate(s)} · interval ${ciText(s)}` : rateOrFew(s), 'Problemrate']
            }}
          />
          <Bar dataKey="value" fill="var(--series)" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <ErrorBar dataKey="err" direction="x" width={6} strokeWidth={2} stroke="var(--ink)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ul className="mt-1 grid grid-cols-1 gap-x-4 text-xs text-[var(--ink-2)] sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.key} className="flex justify-between gap-2">
            <span>{r.label}</span>
            <span className="tabular-nums text-[var(--ink)]">
              {rateOrFew(r.stat)}
              {r.stat.sufficient && <span className="text-[var(--ink-2)]"> [{ciText(r.stat)}]</span>}
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1 text-xs text-[var(--ink-2)]">{note}</p>}
    </div>
  )
}

function TimelineCard() {
  const { trips, events, settings } = useData()
  const series = RATINGS.map((r) => ({
    rating: r,
    data: trips.filter((t) => t.rating === r).map((t) => ({ x: t.timestamp, y: RATING_Y[r], id: t.id })),
  }))
  const xs = [...trips.map((t) => t.timestamp), ...events.map((e) => e.timestamp)]
  const pad = 6 * 3_600_000
  const domain = [Math.min(...xs) - pad, Math.max(...xs) + pad]
  return (
    <Card title="Tidslinje" testId="timeline">
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 104, right: 12, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis type="number" dataKey="x" domain={domain} scale="time" tickFormatter={(v) => formatDate(v)} tickCount={4} {...AXIS} />
          <YAxis type="number" dataKey="y" domain={[-0.5, 2.5]} ticks={[0, 1, 2]} tickFormatter={(v) => RATING_LABEL[RATINGS[v as number]]} width={82} {...AXIS} />
          <ZAxis range={[70, 70]} />
          {events.map((e) => (
            <ReferenceLine
              key={e.id}
              x={e.timestamp}
              stroke="var(--ink-2)"
              strokeDasharray="4 3"
              label={(props: { viewBox?: { x?: number; y?: number } }) => <EventLabel x={props.viewBox?.x ?? 0} y={props.viewBox?.y ?? 0} text={labelOf(e.type, settings.eventTypes)} />}
            />
          ))}
          {series.map((s) => (
            <Scatter key={s.rating} name={RATING_LABEL[s.rating]} data={s.data} fill={RATING_COLOR[s.rating]} shape={RATING_SHAPE[s.rating]} isAnimationActive={false} />
          ))}
          <Tooltip {...tooltipStyle} formatter={(v, n) => (n === 'x' ? formatDateTime(v as number) : RATING_LABEL[RATINGS[v as number]])} labelFormatter={() => ''} />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-[var(--ink-2)]">Prikker er ture; stiplede linjer er hændelser.</p>
    </Card>
  )
}

/** Event name written upwards from the top of the plot, so it never overlaps the dots. */
function EventLabel({ x, y, text }: { x: number; y: number; text: string }) {
  const short = text.length > 17 ? `${text.slice(0, 16)}…` : text
  return (
    <text x={x} y={y - 6} transform={`rotate(-90 ${x} ${y - 6})`} dy={3.5} fontSize={10} fill="var(--ink-2)" textAnchor="start">
      {short}
    </text>
  )
}

function ScatterCard() {
  const { trips } = useData()
  const withWeather = trips.filter((t) => t.weatherStatus === 'ok' && t.weather)
  return (
    <Card title="Temperatur mod temp − dugpunkt" testId="scatter">
      {withWeather.length === 0 ? (
        <p className="text-sm text-[var(--ink-2)]">Ingen ture med vejrdata endnu.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 36, bottom: 16, left: 0 }}>
            {GRID}
            <XAxis type="number" dataKey="x" name="Temperatur" unit=" °C" {...AXIS} label={{ value: 'Temperatur', position: 'insideBottom', offset: -10, fill: 'var(--ink-2)', fontSize: 12 }} />
            <YAxis type="number" dataKey="y" name="Temp − dugpunkt" unit=" °C" width={52} {...AXIS} />
            <ZAxis range={[70, 70]} />
            <ReferenceLine y={2} stroke="var(--ink-2)" strokeDasharray="4 3" label={{ value: '2 °C', position: 'right', fontSize: 10, fill: 'var(--ink-2)' }} />
            {RATINGS.map((r) => (
              <Scatter
                key={r}
                name={RATING_LABEL[r]}
                data={withWeather.filter((t) => t.rating === r).map((t) => ({ x: t.weather!.temperature, y: t.weather!.dewPointSpread }))}
                fill={RATING_COLOR[r]}
                shape={RATING_SHAPE[r]}
                isAnimationActive={false}
              />
            ))}
            <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12, color: 'var(--ink)' }} />
            <Tooltip {...tooltipStyle} formatter={(v) => `${fmt1(v as number)} °C`} />
          </ScatterChart>
        </ResponsiveContainer>
      )}
      <p className="mt-1 text-xs text-[var(--ink-2)]">Lav værdi (under ca. 2 °C) betyder fugtig luft tæt på kondens – typisk værst for tændspoler.</p>
    </Card>
  )
}

function verdict(r: BeforeAfterRow): { text: string; strong: boolean } {
  if (r.reason === 'few_trips') return { text: 'For få ture', strong: false }
  const dir = (r.diff ?? 0) < 0 ? 'Bedre' : (r.diff ?? 0) > 0 ? 'Værre' : 'Uændret'
  return r.reason === 'overlap' ? { text: `${dir} (usikkert)`, strong: false } : { text: dir, strong: true }
}

function BeforeAfterCard({ rows, window }: { rows: BeforeAfterRow[]; window: number }) {
  const { settings } = useData()
  const [filter, setFilter] = useState('all')
  const shown = rows.filter((r) => filter === 'all' || r.event.type === filter).reverse()
  return (
    <Card title="Før/efter hændelser" testId="before-after">
      <p className="mb-3 text-sm text-[var(--ink-2)]">Problemrate i de {window} ture før vs. de {window} ture efter hver hændelse. “Usikkert” betyder, at konfidensintervallerne overlapper.</p>
      <select className={cx(inputClass, 'mb-3')} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrer hændelser">
        <option value="all">Alle hændelser</option>
        {settings.eventTypes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {shown.length === 0 ? (
        <p className="text-sm text-[var(--ink-2)]">Ingen hændelser.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--ink-2)]">
              <tr>
                <th className="py-1 pr-2 font-medium">Hændelse</th>
                <th className="py-1 pr-2 font-medium">Før</th>
                <th className="py-1 pr-2 font-medium">Efter</th>
                <th className="py-1 font-medium">Vurdering</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const v = verdict(r)
                return (
                  <tr key={r.event.id} className="border-t border-[var(--line)] align-top">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{labelOf(r.event.type, settings.eventTypes)}</div>
                      <div className="text-xs text-[var(--ink-2)]">{formatDate(r.event.timestamp)}</div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 tabular-nums">
                      {r.before.total === 0 ? '–' : formatRate(r.before)}
                      <div className="text-xs text-[var(--ink-2)]">{ciText(r.before)}</div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 tabular-nums">
                      {r.after.total === 0 ? '–' : formatRate(r.after)}
                      <div className="text-xs text-[var(--ink-2)]">{ciText(r.after)}</div>
                    </td>
                    <td className={cx('py-2', v.strong ? 'font-semibold' : 'text-[var(--ink-2)]')}>{v.text}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function OilCard({ oil }: { oil: ReturnType<typeof analyze>['oil'] }) {
  const data = oil.intervals.map((i) => ({ x: i.timestamp, rate: i.rate, rolling: i.rolling }))
  return (
    <Card title="Olieforbrug" testId="oil">
      <p className="mb-2 text-sm">
        Samlet:{' '}
        <strong data-testid="oil-overall">{oil.overall != null ? `${fmt2(oil.overall)} L/1000 km` : 'ikke nok data'}</strong>
      </p>
      {data.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            {GRID}
            <XAxis type="number" dataKey="x" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={(v) => formatDate(v)} tickCount={4} {...AXIS} />
            <YAxis width={40} {...AXIS} tickFormatter={(v) => fmt1(v)} />
            {oil.overall != null && <ReferenceLine y={oil.overall} stroke="var(--ink-2)" strokeDasharray="4 3" />}
            <Line type="monotone" dataKey="rate" name="Pr. påfyldning" stroke="var(--series)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="rolling" name="Glidende (3)" stroke="var(--ink-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12 }} />
            <Tooltip {...tooltipStyle} labelFormatter={(v) => formatDate(v as number)} formatter={(v) => `${fmt2(v as number)} L/1000 km`} />
          </LineChart>
        </ResponsiveContainer>
      )}
      {oil.topups.length === 0 ? (
        <p className="text-sm text-[var(--ink-2)]">Ingen “olie efterfyldt”-hændelser endnu.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {[...oil.topups].reverse().map((t) => (
            <li key={t.event.id} className="flex justify-between gap-3">
              <span className="whitespace-nowrap">
                {formatDate(t.event.timestamp)}
                {t.event.liters != null && ` · ${fmt1(t.event.liters)} L`}
              </span>
              <span className="text-right tabular-nums">{t.interval ? `${fmt2(t.interval.rate)} L/1000 km (${t.interval.toKm - t.interval.fromKm} km)` : 'ikke nok data'}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-[var(--ink-2)]">Beregnes ud fra liter påfyldt og km siden forrige påfyldning/olieskift. Mangler km-tal på påfyldningen, interpoleres det mellem km-tal før og efter.</p>
    </Card>
  )
}
