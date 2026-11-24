import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const content = vi.hoisted(() => ({ video: 'https://www.youtube.com/watch?v=ab_4_zdStFQ' }))
vi.mock('../context/ContentContext', () => ({ useText: () => content.video }))

const { IntroVideoButton, IntroVideoCard, youtubeId } = await import('../components/IntroVideo')

describe('the intro video', () => {
  it('reads the id of every kind of YouTube link', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=ab_4_zdStFQ',
      'https://www.youtube.com/watch?feature=share&v=ab_4_zdStFQ',
      'https://youtu.be/ab_4_zdStFQ?si=x',
      'https://www.youtube.com/embed/ab_4_zdStFQ',
      'https://youtube.com/shorts/ab_4_zdStFQ',
    ]) {
      expect(youtubeId(url), url).toBe('ab_4_zdStFQ')
    }
    expect(youtubeId('')).toBe('')
    expect(youtubeId('https://example.com/video')).toBe('')
  })

  it('YouTube is contacted only once the video is opened, without cookies', async () => {
    render(<IntroVideoButton />)
    expect(document.querySelector('iframe')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'شاهد الفيديو التعريفي' }))
    const dialog = screen.getByRole('dialog', { name: 'الفيديو التعريفي بالنظام' })
    expect(within(dialog).getByTitle('الفيديو التعريفي بالنظام')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/ab_4_zdStFQ?autoplay=1&rel=0',
    )
  })

  it('no link set in the dashboard: nothing is shown', () => {
    content.video = ''
    const { container } = render(
      <>
        <IntroVideoButton />
        <IntroVideoCard />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
    content.video = 'https://youtu.be/ab_4_zdStFQ'
  })
})
