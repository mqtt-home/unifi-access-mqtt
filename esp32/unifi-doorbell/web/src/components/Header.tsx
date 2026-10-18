import type { Tab } from '../types'
import { LANGS, useI18n } from '../lib/i18n'
import type { Key } from '../lib/i18n'
import { BellIcon, LogoutIcon } from './Icons'

interface HeaderProps {
  connected: boolean
  version?: string
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onLogout: () => void
}

const tabs: { id: Tab; label: Key }[] = [
  { id: 'status', label: 'tab.status' },
  { id: 'setup', label: 'tab.setup' },
  { id: 'settings', label: 'tab.settings' },
  { id: 'system', label: 'tab.system' }
]

export function LangSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div class="seg" role="group" aria-label={t('language')}>
      {LANGS.map(l => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export function Header({ connected, version, activeTab, onTabChange, onLogout }: HeaderProps) {
  const { t } = useI18n()
  return (
    <header class="top-bar">
      <div class="wrap">
        <div class="app-head">
          <span class="ico"><BellIcon /></span>
          <div class="head-text">
            <h1 class="tt">{t('title')}</h1>
            <div class="st">
              <span class={`dot ${connected ? 'live' : 'bad'}`} />
              <span>{connected ? t('conn.live') : t('conn.off')}</span>
              {version && <span class="ver mono">· {version}</span>}
            </div>
          </div>
          <LangSwitch />
          <button type="button" class="icon-btn" onClick={onLogout} title={t('logout')} aria-label={t('logout')}>
            <LogoutIcon />
          </button>
        </div>
        <nav class="app-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              class={activeTab === tab.id ? 'active' : ''}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => onTabChange(tab.id)}
            >
              {t(tab.label)}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}
