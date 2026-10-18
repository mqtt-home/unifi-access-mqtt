import { useState, useRef, useEffect } from 'preact/hooks'
import type { UpdateInfo } from '../types'
import api from '../api/api'
import { useI18n } from '../lib/i18n'

interface LogEntry {
  timestamp: string
  message: string
}

interface SystemTabProps {
  version: string
  board: string
  logs: LogEntry[]
  onClearLogs: () => void
  updateInfo: UpdateInfo | null
  onCheckUpdate: () => void
  checkingUpdate: boolean
}

export function SystemTab({ version, board, logs, onClearLogs, updateInfo, onCheckUpdate, checkingUpdate }: SystemTabProps) {
  const { t } = useI18n()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleFileSelect = (e: Event) => {
    const input = e.target as HTMLInputElement
    if (input.files && input.files[0]) {
      setSelectedFile(input.files[0])
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      alert(t('sys.noFile'))
      return
    }

    if (!selectedFile.name.endsWith('.bin')) {
      alert(t('sys.notBin'))
      return
    }

    if (!confirm(t('sys.uploadConfirm'))) {
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setUploadStatus(t('sys.uploading', { p: 0 }))

    try {
      const result = await api.uploadFirmware(selectedFile, (percent) => {
        setUploadProgress(percent)
        setUploadStatus(t('sys.uploading', { p: percent }))
      })

      if (result.success) {
        setUploadStatus(t('sys.uploadDone'))
        setTimeout(() => location.reload(), 10000)
      } else {
        alert(t('sys.updateFailed', { e: result.message ?? t('unknownError') }))
        setUploading(false)
        setUploadStatus('')
      }
    } catch (err) {
      alert(t('sys.uploadFailed', { e: (err as Error).message }))
      setUploading(false)
      setUploadStatus('')
    }
  }

  const handleReboot = async () => {
    if (!confirm(t('sys.rebootConfirm'))) return
    try {
      await api.reboot()
      alert(t('sys.rebooting'))
    } catch {
      // Expected - device reboots and connection drops
    }
  }

  const handleReset = async () => {
    if (!confirm(t('sys.resetConfirm'))) return
    if (!confirm(t('sys.resetConfirm2'))) return
    try {
      await api.factoryReset()
      alert(t('sys.resetDone'))
    } catch {
      // Expected - device reboots and connection drops
    }
  }

  return (
    <section class="stack">
      <div class="cards">
        <div class="card">
          <div class="card-h"><h3>{t('sys.firmware')}</h3></div>
          <div class="card-b">
            <div class="kv"><span class="k">{t('sys.version')}</span><span class="v mono">{version}</span></div>
            <div class="kv"><span class="k">{t('sys.board')}</span><span class="v mono">{board || 'unknown'}</span></div>

            {updateInfo?.available && (
              <div class="note info col">
                <strong>{t('sys.updateTitle')}</strong>
                <span>{t('sys.updateText', { latest: updateInfo.latestVersion, current: updateInfo.currentVersion })}</span>
                <a href={updateInfo.manifestUrl} target="_blank" rel="noopener noreferrer" class="btn">
                  {t('sys.installer')}
                </a>
              </div>
            )}

            <div class="row wrap-row">
              {updateInfo && !updateInfo.available && <p class="hint grow">{t('sys.latest')}</p>}
              <button type="button" class="btn" onClick={onCheckUpdate} disabled={checkingUpdate}>
                {checkingUpdate ? <><span class="spinner"></span> {t('sys.checking')}</> : t('sys.check')}
              </button>
            </div>

            <div class="divider" />

            <h4 class="sub-h">{t('sys.manual')}</h4>
            <div class="form-group">
              <label for="fw-file">{t('sys.file')}</label>
              <input id="fw-file" type="file" accept=".bin" onChange={handleFileSelect} disabled={uploading} />
            </div>
            {uploading && (
              <div class="form-group">
                <div class="meter"><i style={{ width: `${uploadProgress}%` }} /></div>
                <p class="hint num">{uploadStatus}</p>
              </div>
            )}
            <button type="button" class="btn" onClick={handleUpload} disabled={uploading || !selectedFile}>
              {t('sys.upload')}
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-h"><h3>{t('sys.actions')}</h3></div>
          <div class="card-b">
            <div class="btn-group">
              <button type="button" class="btn" onClick={handleReboot}>{t('sys.reboot')}</button>
              <button type="button" class="btn danger" onClick={handleReset}>{t('sys.reset')}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h">
          <h3>{t('sys.log')}</h3>
          <label class="check meta">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll((e.target as HTMLInputElement).checked)}
            />
            {t('sys.autoscroll')}
          </label>
          <button type="button" class="btn sm" onClick={onClearLogs}>{t('sys.clear')}</button>
        </div>
        <div class="card-b">
          <div ref={logContainerRef} class="log-container">
            {logs.length === 0 && <div class="log-empty">{t('sys.logEmpty')}</div>}
            {logs.map((log, i) => (
              <div key={i}>
                <span class="log-ts">{log.timestamp}</span> {log.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
