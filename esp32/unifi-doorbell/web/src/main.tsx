import { render } from 'preact'
import { App } from './App'
import { I18nProvider } from './lib/i18n'
import './styles/global.css'

// Follow the system appearance live (index.html sets it before first paint).
const media = matchMedia('(prefers-color-scheme: dark)')
// In the Wall Display panel (html[data-embed=wall-display]) always dark.
media.addEventListener('change', (e) => {
  const dark = e.matches || document.documentElement.dataset.embed === 'wall-display'
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})

render(<I18nProvider><App /></I18nProvider>, document.getElementById('app')!)
