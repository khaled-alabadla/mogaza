import { lazy, Suspense } from 'react'
import LoadingState from '../components/LoadingState'
import PageHeader from '../components/PageHeader'

// the map and Leaflet are their own chunk: downloaded only when this page opens
const WaterMap = lazy(() => import('../components/WaterMap'))

/** «الخريطة»: Gaza City's neighborhoods on the real map (the water schedule will be laid on it later). */
export default function MapPage() {
  return (
    <div>
      <PageHeader title="الخريطة" subtitle="أحياء مدينة غزة ومواقعنا ومعالمها على الخريطة." />
      <Suspense fallback={<LoadingState label="جارٍ تحميل الخريطة…" />}>
        <WaterMap />
      </Suspense>
    </div>
  )
}
