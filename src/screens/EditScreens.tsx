import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { EventForm } from '../components/EventForm'
import { TripForm } from '../components/TripForm'
import { Button, PageHeader, useToast } from '../components/ui'
import { useData } from '../data/DataContext'
import { deleteEvent, deleteTrip } from '../data/repo'

const back = (
  <Link to="/historik" className="min-h-11 px-2 py-2 text-sm font-semibold underline">
    Tilbage
  </Link>
)

export function TripEditScreen() {
  const { id } = useParams()
  const { uid, trips } = useData()
  const navigate = useNavigate()
  const toast = useToast()
  const trip = trips.find((t) => t.id === id)
  if (!trip) return <NotFound title="Rediger tur" />
  return (
    <div>
      <PageHeader title="Rediger tur" right={back} />
      <TripForm
        key={trip.id}
        initial={trip}
        onSaved={() => {
          toast('Tur opdateret')
          navigate('/historik')
        }}
        footer={
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              if (!confirm('Slet denne tur?')) return
              deleteTrip(uid, trip.id)
              toast('Tur slettet')
              navigate('/historik')
            }}
          >
            Slet tur
          </Button>
        }
      />
    </div>
  )
}

export function EventEditScreen() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { uid, events } = useData()
  const navigate = useNavigate()
  const toast = useToast()
  if (id === undefined) {
    return (
      <div>
        <PageHeader title="Ny hændelse" right={<Link to="/" className="min-h-11 px-2 py-2 text-sm font-semibold underline">Annuller</Link>} />
        <EventForm
          defaultType={params.get('type') || undefined}
          onSaved={() => {
            toast('Hændelse gemt')
            navigate('/')
          }}
        />
      </div>
    )
  }
  const event = events.find((e) => e.id === id)
  if (!event) return <NotFound title="Rediger hændelse" />
  return (
    <div>
      <PageHeader title="Rediger hændelse" right={back} />
      <EventForm
        key={event.id}
        initial={event}
        onSaved={() => {
          toast('Hændelse opdateret')
          navigate('/historik')
        }}
        footer={
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              if (!confirm('Slet denne hændelse?')) return
              deleteEvent(uid, event.id)
              toast('Hændelse slettet')
              navigate('/historik')
            }}
          >
            Slet hændelse
          </Button>
        }
      />
    </div>
  )
}

function NotFound({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} right={back} />
      <p>Findes ikke (måske slettet).</p>
    </div>
  )
}
