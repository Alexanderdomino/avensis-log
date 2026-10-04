/** Danish number/date formatting and <input type="datetime-local"> helpers. */

const nf1 = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmt1 = (n: number) => nf1.format(n)
export const fmt0 = (n: number) => nf0.format(n)
export const fmt2 = (n: number) => nf2.format(n)

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('da-DK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: '2-digit' })
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Epoch ms → "YYYY-MM-DDTHH:mm" in local time. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "YYYY-MM-DDTHH:mm" in local time → epoch ms (NaN if invalid). */
export function fromLocalInput(value: string): number {
  return new Date(value).getTime()
}

/** Parse a Danish or English decimal ("12,5" or "12.5"); empty → null. */
export function parseDecimal(value: string): number | null {
  const v = value.trim().replace(/\s/g, '').replace(',', '.')
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
