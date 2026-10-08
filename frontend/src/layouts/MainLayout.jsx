import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import Footer from '../components/Footer'
import LoadingState from '../components/LoadingState'
import Navbar from '../components/Navbar'

export default function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      {/* At least one screen tall (minus the ~69px navbar): while a page or its data loads, the
          content is momentarily short, and the footer would otherwise flash into view and jump away. */}
      <main className="mx-auto min-h-[calc(100svh-4.3rem)] w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        {/* pages are lazy-loaded: keep the header/footer while a page's code downloads */}
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
