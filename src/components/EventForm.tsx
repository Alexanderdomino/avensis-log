import { useState } from 'react'
import { useData } from '../data/DataContext'
import { addEvent, updateEvent, type EventInput } from '../data/repo'
import { kindOf } from '../lib/analysis/derive'
import { fromLocalInput, parseDecimal, toLocalInput } from '../lib/format'
import type { CarEvent } from '../lib/types'
import { Button, Card, Chip, ChipGroup, Field, inputClass } from './ui'
import { cx } from './colors'

export function EventForm({ initial, defaultType, onSaved, footer }: { initial?: CarEvent; defaultType?: string; onSaved: (id: string) => void; footer?: React.ReactNode }) {
  const { uid, settings } = useData()
  const types = settings.eventTypes
  const [type, setType] = useState(initial?.type ?? defaultType ?? types[0]?.id ?? 'other')
  const [timeInput, setTimeInput] = useState(() => toLocalInput(initial?.timestamp ?? Date.now()))
  const [timeEdited, setTimeEdited] = useState(false)
  const [odometer, setOdometer] = useState(initial?.odometer != null ? String(initial.odometer) : '')
  const [liters, setLiters] = useState(initial?.liters != null ? String(initial.liters).replace('.', ',') : '')
  const [fuelBrand, setFuelBrand] = useState(initial?.fuelBrand ?? '')
  const [octane, setOctane] = useState(initial?.octane != null ? String(initial.octane) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const kind = kindOf(type, types)
  const isFuel = kind === 'fuel'
  const hasLiters = isFuel || kind === 'oil_topup' || kind === 'oil_change'
  const fuelTypes = types.filter((t) => t.kind === 'fuel')
  const litersValue = parseDecimal(liters)
  const litersInvalid = litersValue != null && (litersValue < 0 || litersValue > 100)
  const odoValue = parseDecimal(odometer)
  const odoInvalid = odoValue != null && odoValue < 0

  const save = () => {
    if (litersInvalid || odoInvalid) return
    const ts = !initial && !timeEdited ? Date.now() : fromLocalInput(timeInput)
    const record: EventInput = {
      timestamp: Number.isNaN(ts) ? Date.now() : ts,
      type,
      odometer: odoValue,
      liters: hasLiters ? litersValue : null,
      fuelBrand: isFuel ? fuelBrand.trim() : '',
      octane: isFuel ? parseDecimal(octane) : null,
      notes: notes.trim(),
    }
    if (initial) {
      updateEvent(uid, initial.id, record)
      onSaved(initial.id)
    } else {
      onSaved(addEvent(uid, record))
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        {isFuel && fuelTypes.length > 1 && (
          <ChipGroup label="Brændstof">
            {fuelTypes.map((t) => (
              <Chip key={t.id} selected={type === t.id} onClick={() => setType(t.id)}>
                {t.label}
              </Chip>
            ))}
          </ChipGroup>
        )}
        <Field label="Type">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
            {!types.some((t) => t.id === type) && <option value={type}>{type} (slettet type)</option>}
          </select>
        </Field>
        {hasLiters && (
          <Field label="Liter (valgfrit)">
            <input inputMode="decimal" className={cx(inputClass, litersInvalid && 'border-crit')} value={liters} onChange={(e) => setLiters(e.target.value)} placeholder={isFuel ? 'fx 45,2' : 'fx 0,5'} aria-invalid={litersInvalid} />
          </Field>
        )}
        {litersInvalid && <p className="text-sm text-crit">Liter skal være mellem 0 og 100.</p>}
        {isFuel && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mærke/station">
              <input className={inputClass} value={fuelBrand} onChange={(e) => setFuelBrand(e.target.value)} placeholder="fx Q8" maxLength={100} />
            </Field>
            <Field label="Oktan">
              <input inputMode="numeric" className={inputClass} value={octane} onChange={(e) => setOctane(e.target.value)} placeholder="95" />
            </Field>
          </div>
        )}
        <Field label="Kilometertal (valgfrit)">
          <input inputMode="numeric" className={cx(inputClass, odoInvalid && 'border-crit')} value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="fx 214500" />
        </Field>
        <Field label="Tidspunkt">
          <input
            type="datetime-local"
            className={inputClass}
            value={timeInput}
            onChange={(e) => {
              setTimeInput(e.target.value)
              setTimeEdited(true)
            }}
          />
        </Field>
        <Field label="Noter (valgfrit)">
          <textarea className={cx(inputClass, 'min-h-20 py-2')} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>
      </Card>
      {footer}
      <Button className="min-h-14 w-full text-lg" onClick={save} disabled={litersInvalid || odoInvalid}>
        {initial ? 'Gem ændringer' : 'Gem hændelse'}
      </Button>
    </div>
  )
}
