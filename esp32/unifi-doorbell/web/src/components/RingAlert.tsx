import api from '../api/api'
import { useI18n } from '../lib/i18n'
import { BellRingIcon } from './Icons'

interface RingAlertProps {
  active: boolean
}

export function RingAlert({ active }: RingAlertProps) {
  const { t } = useI18n()
  if (!active) return null

  const handleDismiss = async () => {
    const result = await api.dismissCall()
    if (!result.success) {
      alert(t('ring.dismissFailed', { e: result.message ?? t('unknownError') }))
    }
  }

  return (
    <div class="alert-banner ring" role="alert">
      <span class="ico"><BellRingIcon /></span>
      <div class="grow">
        <div class="t">{t('ring.title')}</div>
        <div class="s">{t('ring.sub')}</div>
      </div>
      <button type="button" class="btn" onClick={handleDismiss}>{t('ring.dismiss')}</button>
    </div>
  )
}
