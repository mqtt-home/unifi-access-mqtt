import { render } from 'preact'
import { App } from './App'
import { I18nProvider } from './lib/i18n'
import './styles/global.css'

// Follow the system appearance live (index.html sets it before first paint).
const media = matchMedia('(prefers-color-scheme: dark)')
media.addEventListener('change', (e) => {
  document.documentElement.classList.toggle('dark', e.matches)
  document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'
})

render(<I18nProvider><App /></I18nProvider>, document.getElementById('app')!)
