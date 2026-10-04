import { RATING_LABEL } from '../lib/labels'
import { RATINGS, type Rating } from '../lib/types'
import {  } from './ui'
import { cx } from './colors'
import { RATING_COLOR } from './colors'
import { RatingIcon } from './RatingIcon'

/** Three huge tap targets styled like dashboard warning lights. */
export function RatingButtons({ value, onChange }: { value: Rating | null; onChange: (r: Rating) => void }) {
  return (
    <div role="radiogroup" aria-label="Hvordan kørte bilen?" className="grid grid-cols-3 gap-3">
      {RATINGS.map((r) => {
        const selected = value === r
        const color = RATING_COLOR[r]
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(r)}
            className={cx(
              'flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-3xl border-2 px-1 text-center font-bold leading-tight transition-all active:scale-95',
              selected ? 'text-black' : 'bg-[var(--card)]',
            )}
            style={{
              borderColor: color,
              color: selected ? (r === 'no_power' ? '#fff' : '#111') : color,
              background: selected ? color : undefined,
              boxShadow: selected ? `0 0 0 4px ${color}55, 0 0 28px 6px ${color}88` : undefined,
            }}
          >
            <RatingIcon rating={r} className="h-11 w-11" />
            <span className="text-[15px]">{RATING_LABEL[r]}</span>
          </button>
        )
      })}
    </div>
  )
}
