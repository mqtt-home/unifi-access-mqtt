import { render } from 'preact'
import { App } from './App'
import { I18nProvider } from './lib/i18n'
import './styles/global.css'

render(<I18nProvider><App /></I18nProvider>, document.getElementById('app')!)
