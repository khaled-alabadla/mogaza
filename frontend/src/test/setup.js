import '@testing-library/jest-dom/vitest'

// jsdom has no scrolling: the layout scrolls each new page to its top
window.scrollTo = () => {}
