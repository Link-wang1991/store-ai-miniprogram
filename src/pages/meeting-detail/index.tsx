import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { meetingApi } from '@/utils/api'
import { isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import { showEditableModal } from '@/utils/ui'
import './index.scss'

const CARD_FIELDS = [
  { key: 'summary', label: '会谈摘要', color: 'green' },
  { key: 'needs', label: '真实需求', color: 'blue' },
  { key: 'concerns', label: '主要顾虑', color: 'yellow' },
  { key: 'highlights', label: '员工亮点', color: 'green' },
  { key: 'misses', label: '错失机会', color: 'yellow' },
  { key: 'risks', label: '合规风险', color: 'red' },
]
const ROLE_LABEL: Record<string, string> = {
  employee: '员工',
  customer: '客户',
  manager: '店长',
  other: '其他',
}
const ROLE_TAG: Record<string, string> = {
  employee: 'ref-status-green',
  customer: 'ref-status-blue',
  manager: 'ref-status-purple',
  other: 'ref-status-gray',
}

function pick(obj: any, key: string): string {
  if (!obj) return ''
  if (obj[key]) return obj[key]
  if (obj[key + '_text']) return obj[key + '_text']
  const card = (obj.cards || []).find((c: any) => c.type === key || c.key === key)
  return card?.content || card?.text || ''
}

function fmtDuration(sec?: number) {
  if (!sec && sec !== 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

function scoreColor(score?: number) {
  if (!score) return '#b8d8c6'
  if (score >= 80) return '#008448'
  if (score >= 60) return '#c88400'
  return '#d94b3d'
}

function fmtClock(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function MeetingDetail() {
  const router = useRouter()
  const id = router.params.id || ''
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [trans, setTrans] = useState<any[]>([])
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [editingId, setEditingId] = useState('')
  const [recoveryAction, setRecoveryAction] = useState('')

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    const [d, a, t, diag] = await Promise.all([
      meetingApi.detail(id),
      meetingApi.analysis(id),
      meetingApi.transcripts(id),
      meetingApi.diagnostics(id),
    ])
    if (d.ok) setDetail(d.data || null)
    if (a.ok) setAnalysis(a.data || null)
    if (t.ok && Array.isArray(t.data)) setTrans(t.data)
    if (diag.ok) setDiagnostics(diag.data || null)
    if (!d.ok && !a.ok) Taro.showToast({ title: d.error || '加载失败', icon: 'none' })
    setLoading(false)
  }

  async function retryTranscription() {
    setRecoveryAction('retry')
    const r = await meetingApi.retryTranscription(id)
    setRecoveryAction('')
    Taro.showToast({ title: r.ok ? '已重新提交转写' : r.error || '重新提交失败', icon: 'none' })
    if (r.ok) load()
  }

  async function reuploadAudio() {
    const res = await Taro.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['mp3', 'wav', 'm4a', 'aac', 'amr'],
    })
    if (!res.tempFiles?.length) return
    setRecoveryAction('upload')
    const r = await meetingApi.uploadAudio(id, res.tempFiles[0].path)
    setRecoveryAction('')
    Taro.showToast({ title: r.ok ? '上传成功，开始转写' : r.error || '上传失败', icon: 'none' })
    if (r.ok) load()
  }

  async function reanalyze() {
    const modal = await Taro.showModal({
      title: '重新分析会谈',
      content: '将基于当前修订后的逐句转写重新生成报告，不会自动覆盖已有任务。',
      confirmText: '重新分析',
      confirmColor: '#008448',
    })
    if (!modal.confirm) return
    setRecoveryAction('analyze')
    const r = await meetingApi.reanalyze(id)
    setRecoveryAction('')
    Taro.showToast({ title: r.ok ? '已重新开始分析' : r.error || '重新分析失败', icon: 'none' })
    if (r.ok) load()
  }

  // 修订此句（对齐 Web saveTranscript）
  async function reviseTranscript(t: any) {
    const modal = await showEditableModal({
      title: '修订此句',
      content: t.content || '',
      placeholderText: '输入修正后的内容',
      confirmColor: '#008448',
    })
    const corrected = modal.content?.trim()
    if (!modal.confirm || !corrected) return
    setEditingId(t.id)
    const r = await meetingApi.updateTranscript(id, t.id, corrected)
    setEditingId('')
    if (r.ok) {
      setTrans((cur) =>
        cur.map((x) => (x.id === t.id ? { ...x, content: corrected, edited_at: new Date().toISOString() } : x))
      )
      Taro.showToast({ title: '已保存修订', icon: 'none' })
    } else {
      Taro.showToast({ title: r.error || '保存修订失败', icon: 'none' })
    }
  }

  // 设置说话人身份（对齐 Web saveSpeakerRole）
  async function setSpeakerRole(speaker: string) {
    const res = await Taro.showActionSheet({
      itemList: ['员工', '客户', '店长', '其他'],
      itemColor: '#008448',
    })
    if (res.errMsg && !res.errMsg.includes('ok')) return
    const role = ['employee', 'customer', 'manager', 'other'][res.tapIndex]
    if (!role) return
    const r = await meetingApi.updateSpeaker(id, speaker, role)
    if (r.ok) {
      setTrans((cur) => cur.map((x) => (x.speaker === speaker ? { ...x, speaker_role: role } : x)))
      Taro.showToast({ title: '已保存说话人身份', icon: 'none' })
    } else {
      Taro.showToast({ title: r.error || '保存说话人身份失败', icon: 'none' })
    }
  }

  if (loading) {
    return (
      <View className="page detail-page">
        <View className="ref-skeleton detail-skeleton" />
        <View className="ref-skeleton detail-skeleton" />
      </View>
    )
  }

  const cards = CARD_FIELDS.map((f) => ({ ...f, content: pick(analysis, f.key) })).filter(
    (c) => c.content
  )
  const score = analysis?.score ?? analysis?.quality_score ?? analysis?.quality?.score
  const dimensions: any[] =
    analysis?.dimensions ||
    analysis?.dimension_scores ||
    analysis?.quality?.dimensions ||
    []
  const nextStep = analysis?.next_step || analysis?.next_action || analysis?.next_plan
  const nextScript = analysis?.next_script || analysis?.followup_script
  const time = detail?.ended_at || detail?.created_at
  const status = String(detail?.status || diagnostics?.status || '').toLowerCase()
  const audioStored = diagnostics?.audio_stored === true
  const needsRecovery = ['failed', 'error', 'recording'].includes(status) || diagnostics?.asr_retry_at

  // 说话人分组（对齐 Web speakerGroups）
  const speakerMap = new Map<string, { speaker: string; role: string }>()
  trans
    .filter((t) => t.speaker)
    .forEach((t) => {
      if (!speakerMap.has(t.speaker)) speakerMap.set(t.speaker, { speaker: t.speaker, role: t.speaker_role || '' })
    })
  const speakerGroups = Array.from(speakerMap.values())

  return (
    <View className="page detail-page">
      {/* 信息卡 */}
      <View className="info-grid">
        <View className="info-cell">
          <Text className="info-k">会谈时长</Text>
          <Text className="info-v">{fmtDuration(detail?.duration || detail?.duration_seconds)}</Text>
        </View>
        <View className="info-cell">
          <Text className="info-k">会谈时间</Text>
          <Text className="info-v">{time ? fmtDate(time) : '—'}</Text>
        </View>
        <View className="info-cell">
          <Text className="info-k">客户</Text>
          <Text className="info-v">{detail?.customerName || detail?.customer_name || '—'}</Text>
        </View>
        <View className="info-cell">
          <Text className="info-k">参与员工</Text>
          <Text className="info-v">{detail?.employeeName || detail?.employee_name || '我'}</Text>
        </View>
      </View>

      {needsRecovery ? (
        <View className="ref-card recovery-card">
          <Text className="recovery-title">会谈处理状态</Text>
          <Text className="recovery-detail">
            {diagnostics?.next_step || detail?.fail_reason || '正在确认录音与转写处理状态。'}
          </Text>
          {diagnostics?.asr_error_code ? <Text className="recovery-code">错误码：{diagnostics.asr_error_code}</Text> : null}
          <View className="recovery-actions">
            {!audioStored ? (
              <View className="ref-btn-sm ref-btn-sm-primary" onClick={reuploadAudio}>
                {recoveryAction === 'upload' ? '上传中…' : '重新上传录音'}
              </View>
            ) : status === 'failed' || status === 'error' ? (
              <View className="ref-btn-sm ref-btn-sm-primary" onClick={retryTranscription}>
                {recoveryAction === 'retry' ? '提交中…' : '重新提交转写'}
              </View>
            ) : null}
            {trans.length > 0 && ['failed', 'error'].includes(status) ? (
              <View className="ref-btn-sm ref-btn-sm-plain" onClick={reanalyze}>
                {recoveryAction === 'analyze' ? '分析中…' : '重新分析'}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* 质量评分 */}
      {score != null ? (
        <View className="ref-card score-card">
          <View className="score-left">
            <View className="score-ring" style={{ borderColor: scoreColor(score) }}>
              <Text className="score-num" style={{ color: scoreColor(score) }}>
                {score}
              </Text>
            </View>
            <Text className="score-label">质量评分</Text>
          </View>
          <View className="score-right">
            {(dimensions.length === 0
              ? [
                  ['需求挖掘', 25],
                  ['成交推进', 30],
                  ['合规表现', 20],
                  ['服务体验', 25],
                ]
              : dimensions.map((d: any) => [d.name || d.label, d.value ?? d.score ?? 0])
            ).map(([name, value], i) => (
              <View className="dim-row" key={i}>
                <Text className="dim-name">{name}</Text>
                <View className="dim-track">
                  <View className="dim-bar" style={{ width: `${value}%` }} />
                </View>
                <Text className="dim-val">{value}%</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* 6 分析卡 */}
      {cards.length > 0 ? (
        <View className="analysis-grid">
          {cards.map((c, i) => (
            <View className={`ref-card ana-card ana-${c.color}`} key={i}>
              <Text className="ana-label">{c.label}</Text>
              <Text className="ana-text">{c.content}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* 下一步跟进 */}
      {nextStep || nextScript ? (
        <View className="ref-card next-card">
          <Text className="next-title">下一步跟进</Text>
          {nextStep ? (
            <View className="next-step">
              <Icon svg={ICN.arrow('#008448')} size={26} />
              <Text>{nextStep}</Text>
            </View>
          ) : null}
          {nextScript ? <Text className="next-script">「{nextScript}」</Text> : null}
        </View>
      ) : null}

      {/* 对话记录 */}
      <View className="section-title">
        <Text>对话记录</Text>
        <Text className="section-sub">共 {trans.length} 句</Text>
      </View>

      {trans.length === 0 ? (
        <View className="ref-empty">暂无转写记录</View>
      ) : (
        <>
          {/* 说话人身份 */}
          {speakerGroups.length > 0 ? (
            <View className="speaker-row">
              {speakerGroups.map((g) => (
                <View
                  key={g.speaker}
                  className={`ref-status ${ROLE_TAG[g.role] || 'ref-status-gray'}`}
                  onClick={() => setSpeakerRole(g.speaker)}
                >
                  {ROLE_LABEL[g.role] || g.speaker} ▾
                </View>
              ))}
            </View>
          ) : null}

          {/* 逐句转写 */}
          {trans.map((t, i) => (
            <View className="ref-card trans-item" key={t.id || i}>
              <View className="trans-head">
                <Text className={`ref-status ${ROLE_TAG[t.speaker_role] || 'ref-status-gray'}`}>
                  {ROLE_LABEL[t.speaker_role] || t.speaker || '说话人'}
                </Text>
                <Text className="trans-time">{t.created_at ? fmtClock(t.created_at) : ''}</Text>
                {t.edited_at ? <Text className="trans-edited">已修订</Text> : null}
              </View>
              <Text className="trans-text">{t.content}</Text>
              <Text className="trans-revise" onClick={() => reviseTranscript(t)}>
                {editingId === t.id ? '保存中…' : '修订此句'}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}
