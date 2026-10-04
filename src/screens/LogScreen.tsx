import { useState } from 'react'
import { useNavigate } from 'react-router'
import { TripForm } from '../components/TripForm'
import { Button, PageHeader, useToast } from '../components/ui'
import { useData } from '../data/DataContext'
import { labelOf, lastFuelTypeId } from '../lib/analysis/derive'

export function LogScreen() {
  const { events, settings } = useData()
  const [formKey, setFormKey] = useState(0)
  const toast = useToast()
  const navigate = useNavigate()
  const fuelType = lastFuelTypeId(events, settings.eventTypes)
  const oilType = settings.eventTypes.find((t) => t.kind === 'oil_topup')?.id

  return (
    <div>
      <PageHeader title="Ny tur" />
      <TripForm
        key={formKey}
        onSaved={() => {
          toast('Tur gemt')
          setFormKey((k) => k + 1)
          window.scrollTo({ top: 0 })
        }}
        footer={
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">Hurtig hændelse</div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" className="text-sm" onClick={() => navigate(`/haendelse/ny?type=${fuelType ?? ''}`)} aria-label={`Tanket (${fuelType ? labelOf(fuelType, settings.eventTypes) : ''})`}>
                ⛽ Tanket
                {fuelType && <span className="block text-[11px] font-normal text-[var(--ink-2)]">{labelOf(fuelType, settings.eventTypes)}</span>}
              </Button>
              <Button variant="secondary" className="text-sm" onClick={() => navigate(`/haendelse/ny?type=${oilType ?? 'other'}`)}>
                🛢 Olie efterfyldt
              </Button>
              <Button variant="secondary" className="text-sm" onClick={() => navigate('/haendelse/ny?type=other')}>
                ＋ Andet
              </Button>
            </div>
          </div>
        }
      />
    </div>
  )
}
