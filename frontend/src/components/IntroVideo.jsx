import { useState } from 'react'
import { useText } from '../context/ContentContext'
import { PlayIcon } from './Icons'
import Modal from './Modal'

export const INTRO_VIDEO_KEY = 'site.intro_video'

/** The id of a YouTube link (watch?v=…, youtu.be/…, /embed/…, /shorts/…), or '' when it isn't one. */
// eslint-disable-next-line react-refresh/only-export-components
export function youtubeId(url) {
  const text = String(url || '').trim()
  const match =
    text.match(/[?&]v=([\w-]{11})/) || text.match(/(?:youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/)
  return match ? match[1] : ''
}

/** The video in a window. YouTube is only contacted once it is opened (privacy-enhanced mode, no cookies). */
function VideoWindow({ id, onClose }) {
  return (
    <Modal open size="lg" title="الفيديو التعريفي بالنظام" onClose={onClose}>
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title="الفيديو التعريفي بالنظام"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </Modal>
  )
}

function useIntroVideo() {
  const id = youtubeId(useText(INTRO_VIDEO_KEY))
  const [open, setOpen] = useState(false)
  const player = open && id ? <VideoWindow id={id} onClose={() => setOpen(false)} /> : null
  return { id, open: () => setOpen(true), player }
}

/** «شاهد الفيديو التعريفي» (login page). Nothing when no video is set in the developer dashboard. */
export function IntroVideoButton({ className = '' }) {
  const video = useIntroVideo()
  if (!video.id) return null
  return (
    <>
      <button
        type="button"
        onClick={video.open}
        className={`inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100 transition hover:bg-brand-50 ${className}`}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">
          <PlayIcon className="h-3.5 w-3.5" />
        </span>
        شاهد الفيديو التعريفي
      </button>
      {video.player}
    </>
  )
}

/** A card that plays the video (top of «دليل القسم»). */
export function IntroVideoCard({ className = '' }) {
  const video = useIntroVideo()
  if (!video.id) return null
  return (
    <>
      <button
        type="button"
        onClick={video.open}
        className={`group flex w-full items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-l from-brand-800 to-brand-600 p-4 text-start text-white shadow-sm ring-1 ring-brand-700/30 transition hover:shadow-md sm:p-5 ${className}`}
      >
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-white text-brand-700 shadow-lg ring-4 ring-gold-400/60 transition group-hover:scale-105">
          <PlayIcon className="h-6 w-6 translate-x-[-1px]" />
        </span>
        <span className="min-w-0">
          <span className="block text-lg font-bold">الفيديو التعريفي بالنظام</span>
          <span className="block text-sm text-white/80">جولة في دقيقة ونصف على أهم ما يقدّمه النظام للموظف.</span>
        </span>
      </button>
      {video.player}
    </>
  )
}
