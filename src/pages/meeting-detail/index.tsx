import { useEffect, useRef, useState } from 'react'
import { View, Text, Textarea } from '@tarojs/components'
import Taro, { useRouter, usePullDownRefresh } from '@tarojs/taro'
import { meetingApi, customerApi, experienceReviewApi } from '@/utils/api'
import { getToken, getUserInfo, isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import { sceneLabel } from '@/utils/scenes'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import { showEditableModal } from '@/utils/ui'
import './index.scss'

// 字段 key 对齐后端 meeting_analysis 表列名（V5 迁移后的真实列）
const CARD_FIELDS = [
  { key: 'summary', label: '会谈摘要', color: 'green' },
  { key: 'explicit_needs', label: '真实需求', color: 'blue', fallback: ['implicit_needs', 'emotional_needs'] },
  { key: 'concerns', label: '主要顾虑', color: 'yellow', fallback: ['decision_barriers'] },
  { key: 'employee_did_well', label: '员工亮点', color: 'green' },
  { key: 'missed_opportunities', label: '错失机会', color: 'yellow', fallback: ['employee_to_improve'] },
  { key: 'compliance_risks', label: '合规风险', color: 'red' },
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
// 深度复盘区块（字段来自 report JSON，经解析后并入 analysis）
const REVIEW_BLOCKS: { title: string; key: string; hint?: string }[] = [
  { title: '客户决策与深层需求', key: 'customer_decision_stage', hint: '客户当前所处决策阶段与深层动机' },
  { title: '本次判断依据', key: 'judgement_basis', hint: '按需求挖掘、价值呈现、异议处理、成交推进、合规与服务体验逐项回看' },
  { title: '做得对的地方', key: 'employee_did_well' },
  { title: '专业分析思路', key: 'professional_assessment', hint: '结合命中的门店资料与系统销售方法论' },
  { title: '本次使用的门店资料', key: 'knowledge_basis' },
  { title: '本次使用的系统销售方法论', key: 'methodology_basis' },
  { title: '下一步行动方案', key: 'next_step_plan' },
]
// 需要补强与错失机会（合并展示）
const IMPROVE_KEYS = ['employee_to_improve', 'missed_opportunities', 'decision_barriers']

function pick(obj: any, key: string, fallback: string[] = []): string {
  if (!obj) return ''
  const candidates = [key, ...fallback]
  for (const k of candidates) {
    const v = obj[k]
    if (v != null && String(v).trim() !== '') return String(v)
    if (obj[k + '_text'] != null && String(obj[k + '_text']).trim() !== '') return String(obj[k + '_text'])
  }
  const card = (obj.cards || []).find((c: any) => candidates.includes(c.type) || candidates.includes(c.key))
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

// 把秒数格式化为 mm:ss
function fmtSec(sec?: number | null) {
    if (sec == null || isNaN(sec)) return ''
    const s = Math.max(0, Math.floor(sec))
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// 把逐句转写起止时间格式化为 "mm:ss - mm:ss"，与设计图时间区间一致
function formatTranscriptTime(start?: number | null, end?: number | null) {
    const a = fmtSec(start)
    const b = fmtSec(end)
    if (!a && !b) return ''
    if (a && b) return `${a} - ${b}`
    return a || b
}

// 把字节数格式化为可读大小
function fmtSize(bytes?: number) {
    if (!bytes) return ''
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
    if (bytes > 1024) return `${Math.round(bytes / 1024)}KB`
    return `${bytes}B`
}

// 解析 report JSON（字符串或对象），展开合并进 analysis
function expandAnalysis(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw
  let report: any = raw.report
  if (typeof report === 'string') {
    try {
      report = JSON.parse(report)
    } catch {
      report = null
    }
  }
  if (report && typeof report === 'object') {
    return { ...raw, ...report }
  }
  return raw
}

export default function MeetingDetail() {
  const router = useRouter()
  const id = router.params.id || ''
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [trans, setTrans] = useState<any[]>([])
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [tab, setTab] = useState<'overview' | 'deep' | 'distill' | 'transcript'>('overview')
  const [editingId, setEditingId] = useState('')
  const [recoveryAction, setRecoveryAction] = useState('')
  const [distilling, setDistilling] = useState('')
  const [submittedKeys, setSubmittedKeys] = useState<Record<string, boolean>>({})
  const [reviewing, setReviewing] = useState(false)
  const [reconciling, setReconciling] = useState('')
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const [audioProgress, setAudioProgress] = useState(0) // 0-100
  const [audioProgressText, setAudioProgressText] = useState('0:00')
  const [deepNote, setDeepNote] = useState('') // 店长补充说明（本地暂存）
  const pollingRef = useRef<any>(null)
  const audioRef = useRef<any>(null)

  const user = getUserInfo()
  const isAdmin = !!user && ['owner', 'admin', 'manager'].includes(user.role)

  // 判断会谈是否处于"处理中"（上传/转写/分析中），用于决定是否持续轮询刷新
  function isInProgress(d: any) {
    const s = String(d?.status || '').toLowerCase()
    return ['queued', 'submitting', 'transcribing', 'analyzing', 'processing', 'uploaded', 'recording'].includes(s)
  }

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    load()
    // 处理中状态自动轮询刷新，避免员工无法判断系统是在处理中、失败还是已完成
    pollingRef.current = setInterval(() => {
      load((d) => {
        if (!isInProgress(d)) {
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      })
    }, 5000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (audioRef.current) audioRef.current.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePullDownRefresh(() => {
    load(() => Taro.stopPullDownRefresh())
  })

  async function load(onDone?: (detail: any) => void) {
    const [d, a, t, diag] = await Promise.all([
      meetingApi.detail(id),
      meetingApi.analysis(id),
      meetingApi.transcripts(id),
      meetingApi.diagnostics(id),
    ])
    if (d.ok) {
      setDetail(d.data || null)
      onDone?.(d.data || null)
    } else {
      onDone?.(null)
    }
    // 后端 /analysis 返回 List<Map>（数组包单条），这里取最新一条分析记录并展开 report JSON
    if (a.ok) {
      const arr = Array.isArray(a.data) ? a.data : [a.data]
      setAnalysis(expandAnalysis((arr[0] as any) || null))
    }
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

  // 录音内容无效时引导重新录音（回到会谈页）
  function goRecord() {
    Taro.switchTab({ url: '/pages/meeting/index' })
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

  // 行动确认：采用新计划 / 保留原计划
  async function handleReconcile(decision: 'apply' | 'keep') {
    const label = decision === 'apply' ? '采用新计划' : '保留原计划'
    const modal = await Taro.showModal({
      title: label,
      content:
        decision === 'apply'
          ? '将按修订后的跟进计划新建/更新跟进任务并更新客户下次跟进时间。'
          : '将保留原跟进计划，不改变已有任务。',
      confirmText: label,
      confirmColor: '#008448',
    })
    if (!modal.confirm) return
    setReconciling(decision)
    const r = await meetingApi.actionReconciliation(id, decision)
    setReconciling('')
    Taro.showToast({ title: r.ok ? (r.data?.message || '已确认') : r.error || '操作失败', icon: 'none' })
    if (r.ok) load()
  }

  // 质量复核（店长/老板）：对自动评分做人工校准
  async function handleQualityReview(score: number) {
    if (!isAdmin) return

    // 选复核原因（可多选，循环点选直到"完成"；reason_codes 白名单与后端一致）
    const reasonOptions: [string, string][] = [
      ['need_discovery', '需求挖掘'],
      ['deal_progress', '成交推进'],
      ['service_experience', '服务体验'],
      ['compliance', '合规表现'],
      ['transcript_quality', '转写质量'],
      ['other', '其他'],
    ]
    const selected: string[] = []
    let pickingReason = true
    while (pickingReason) {
      const pick = await Taro.showActionSheet({
        itemList: [...reasonOptions.map(([, label]) => label), '完成选择'],
        itemColor: '#008448',
      })
      if (pick.errMsg && !pick.errMsg.includes('ok')) break
      if (pick.tapIndex === reasonOptions.length) break
      const code = reasonOptions[pick.tapIndex][0]
      if (!selected.includes(code)) selected.push(code)
    }

    // 3. 填复核说明（可选）
    const noteModal = await showEditableModal({
      title: '人工复核说明',
      content: analysis?.quality_review_note || '',
      placeholderText: '填写复核说明（可选）',
      confirmColor: '#008448',
    })
    const note = noteModal.confirm ? noteModal.content?.trim() : ''
    setReviewing(true)
    const r = await meetingApi.qualityReview(id, { score, note, reason_codes: selected.length ? selected : undefined })
    setReviewing(false)
    if (r.ok) {
      Taro.showToast({ title: '已保存人工复核', icon: 'none' })
      setAnalysis((cur: any) => ({ ...(cur || {}), ...(r.data || {}) }))
    } else {
      Taro.showToast({ title: r.error || '保存复核失败', icon: 'none' })
    }
  }

  // 沉淀经验：提交优秀会谈为候选，交由店长/老板审核
  async function submitDistill(key: string, title: string, content: string) {
    if (submittedKeys[key]) {
      Taro.showToast({ title: '已提交过该经验', icon: 'none' })
      return
    }
    setDistilling(key)
    const r = await experienceReviewApi.submit({ meetingId: id, title, content })
    setDistilling('')
    if (r.ok) {
      setSubmittedKeys((s) => ({ ...s, [key]: true }))
      Taro.showToast({ title: r.data?.message || '已提交审核', icon: 'none' })
    } else {
      Taro.showToast({ title: r.error || '提交失败', icon: 'none' })
    }
  }

  // 编辑客户 / 绑定已有客户（对齐 Web 端能力）
  async function editCustomer() {
    const customerList = await customerApi.list()
    const customers = customerList.ok ? (customerList.data || []) : []
    const options = customers.map((c: any) => `${c.name}${c.phone ? `（尾号${String(c.phone).slice(-4)}）` : ''}`)
    // 新客户（无绑定）时才显示"绑定已有客户"；有客户时也可改名
    const isPlaceholder = String(detail?.customer_name || '').startsWith('新客户')
    const actions: string[] = []
    if (isPlaceholder && options.length > 0) actions.push('绑定已有客户')
    actions.push('修改客户姓名')
    if (actions.length === 0) {
      Taro.showToast({ title: '当前客户已绑定，无需编辑', icon: 'none' })
      return
    }
    const pick = await Taro.showActionSheet({ itemList: actions, itemColor: '#008448' })
    if (pick.errMsg && !pick.errMsg.includes('ok')) return
    const chosen = actions[pick.tapIndex]

    if (chosen === '绑定已有客户') {
      const sel = await Taro.showActionSheet({ itemList: options.slice(0, 6), itemColor: '#008448' })
      if (sel.errMsg && !sel.errMsg.includes('ok')) return
      const target = customers[sel.tapIndex]
      if (!target) return
      const r = await meetingApi.update(id, { customer_id: target.id })
      Taro.showToast({ title: r.ok ? '已绑定客户' : r.error || '绑定失败', icon: 'none' })
      if (r.ok) load()
    } else {
      const res = await showEditableModal({
        title: '修改客户姓名',
        content: detail?.customer_name || '',
        placeholderText: '输入客户姓名',
        confirmColor: '#008448',
      })
      if (!res.confirm) return
      const name = res.content?.trim()
      if (!name) return
      const r = await meetingApi.update(id, { customer_name: name })
      Taro.showToast({ title: r.ok ? '已更新客户' : r.error || '更新失败', icon: 'none' })
      if (r.ok) load()
    }
  }

  // 原音播放：带鉴权下载到本地临时文件后用 InnerAudioContext 播放
  async function playAudio() {
    if (audioState === 'loading') return
    if (audioState === 'playing' && audioRef.current) {
      audioRef.current.stop()
      audioRef.current.destroy()
      audioRef.current = null
      setAudioState('idle')
      setAudioProgress(0)
      setAudioProgressText('0:00')
      return
    }
    setAudioState('loading')
    try {
      const token = getToken()
      const audioUrl = meetingApi.audioUrl(id)
      console.warn('[录音播放] 开始下载: ', audioUrl)
      const dl = await Taro.downloadFile({
        url: audioUrl,
        header: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (dl.statusCode !== 200) {
        Taro.showToast({ title: '录音下载失败', icon: 'none' })
        setAudioState('idle')
        console.warn('[录音播放] 下载失败 status=', dl.statusCode)
        return
      }
      console.warn('[录音播放] 下载成功 tempFilePath=', dl.tempFilePath)
      // 诊断：从响应头确认实际返回的音频格式
      const ctype = (dl.header && (dl.header['content-type'] || dl.header['Content-Type'])) as string | undefined
      const ext = (dl.tempFilePath || '').split('.').pop()?.toLowerCase()
      console.warn('[录音播放] content-type=', ctype, '临时文件扩展名=', ext)
      // 微信 InnerAudioContext 不支持 webm/ogg：格式不对时直接提示，避免"能下载但无声"的假象
      if (ctype && (ctype.includes('webm') || ctype.includes('ogg')) || ext === 'webm' || ext === 'ogg') {
        setAudioState('idle')
        Taro.showToast({ title: '录音格式不支持播放，请重新录制后上传', icon: 'none', duration: 3000 })
        return
      }
      // 关键：downloadFile 的 tempFilePath 是真机的 http://tmp/...，部分基础库/机型作为
      // InnerAudioContext.src 不稳定（能下载但解码播放失败）。用文件系统转成 wxfile:// 本地路径更稳。
      let playSrc = dl.tempFilePath
      try {
        const fs = Taro.getFileSystemManager()
        const saved = await new Promise<{ ok: boolean; path?: string }>((resolve) => {
          fs.saveFile({
            tempFilePath: dl.tempFilePath,
            success: (r) => resolve({ ok: true, path: r.savedFilePath }),
            fail: () => resolve({ ok: false }),
          })
        })
        if (saved.ok && saved.path) {
          playSrc = saved.path
          console.warn('[录音播放] 已转本地路径 savedFilePath=', playSrc)
        } else {
          console.warn('[录音播放] saveFile 失败，沿用 tempFilePath')
        }
      } catch (e) {
        console.warn('[录音播放] saveFile 异常，沿用 tempFilePath', e)
      }
      const ctx = Taro.createInnerAudioContext()
      audioRef.current = ctx
      // 关键：部分基础库需要 autoplay 才会自动开始播放
      ctx.autoplay = true
      ctx.obeyMuteSwitch = false
      ctx.volume = 1
      ctx.src = playSrc
      ctx.onError((e) => {
        setAudioState('idle')
        const msg = e && e.errMsg ? e.errMsg : '录音播放失败'
        Taro.showToast({ title: '录音播放失败', icon: 'none' })
        console.warn('[录音播放] InnerAudioContext 错误:', msg, 'src=', playSrc)
      })
      ctx.onCanplay(() => {
        console.warn('[录音播放] onCanplay 触发, duration=', ctx.duration, 'paused=', ctx.paused)
        // 确保可播放后再开始
        ctx.play()
      })
      ctx.onEnded(() => {
        console.warn('[录音播放] onEnded')
        setAudioState('idle')
        setAudioProgress(100)
        setAudioProgressText(fmtSec(ctx.duration || 0))
      })
      ctx.onPlay(() => {
        console.warn('[录音播放] onPlay 触发, duration=', ctx.duration, 'paused=', ctx.paused, 'volume=', ctx.volume)
        setAudioState('playing')
      })
      ctx.onStop(() => {
        setAudioState('idle')
      })
      ctx.onTimeUpdate(() => {
        const dur = ctx.duration || 0
        if (dur > 0) {
          setAudioProgress(Math.min(100, Math.round((ctx.currentTime / dur) * 100)))
          setAudioProgressText(fmtSec(ctx.currentTime))
        }
      })
      // 兜底：onCanplay 不触发时也调用一次 play
      setTimeout(() => {
        if (audioRef.current) {
          try {
            console.warn('[录音播放] setTimeout 兜底 play()')
            audioRef.current.play()
          } catch (e) {
            console.warn('[录音播放] 兜底 play 异常', e)
          }
        }
      }, 300)
    } catch {
      setAudioState('idle')
      Taro.showToast({ title: '录音播放失败', icon: 'none' })
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

  const cards = CARD_FIELDS.map((f) => ({
    ...f,
    content: pick(analysis, f.key, (f as any).fallback || []),
  })).filter((c) => c.content)
  const score = analysis?.score ?? analysis?.quality_score ?? analysis?.quality?.score
  const reviewScore = analysis?.quality_review_score
  const dimensions: any[] =
    analysis?.dimensions ||
    analysis?.dimension_scores ||
    analysis?.quality?.dimensions ||
    // 后端扁平列：四维评分
    (analysis?.need_digging_score != null || analysis?.deal_advancing_score != null
      ? [
          ['需求挖掘', analysis.need_digging_score],
          ['成交推进', analysis.deal_advancing_score],
          ['合规表现', analysis.compliance_score],
          ['服务体验', analysis.service_score],
        ]
      : [])
  const nextStep = analysis?.next_step || analysis?.next_action || analysis?.next_plan || analysis?.next_step_plan
  const nextScript = analysis?.next_script || analysis?.followup_script || analysis?.suggested_script
  const followupGoal = analysis?.followup_goal
  const time = detail?.ended_at || detail?.created_at
  const status = String(detail?.status || diagnostics?.status || '').toLowerCase()
  const audioStored = diagnostics?.audio_stored === true || !!detail?.audio_url || !!detail?.audio_received_at
  const needsRecovery = ['failed', 'error', 'recording'].includes(status) || diagnostics?.asr_retry_at

  // 失败原因文本（来自诊断或详情，兜底取任意一个非空）
  const failText = String(diagnostics?.next_step || detail?.fail_reason || diagnostics?.fail_reason || '')

  // 判断是否为"录音/转写内容本身无效"类错误（录音太短/嘈杂/无人说话、有效内容过少等）。
  // 这类错误重新"提交转写"没用（同一份录音仍识别不出），应引导用户重新录音。
  const isInvalidRecording =
    failText.indexOf('未识别到有效语音') >= 0 ||
    failText.indexOf('未识别有效语音') >= 0 ||
    failText.indexOf('录音太短') >= 0 ||
    failText.indexOf('无人说话') >= 0 ||
    failText.indexOf('有效语音') >= 0 ||
    failText.indexOf('有效转写内容过少') >= 0 ||
    failText.indexOf('有效说话时长过短') >= 0 ||
    failText.indexOf('补录') >= 0 ||
    failText.indexOf('嘈杂') >= 0

  // 行动确认：转写修订后待确认
  const actionPending = String(detail?.action_review_status || '').toLowerCase() === 'pending'
  // 原音可用
  const audioAvailable = audioStored && !needsRecovery

  // 深度复盘区块内容
  const reviewBlocks = REVIEW_BLOCKS.map((b) => ({ ...b, content: pick(analysis, b.key) })).filter(
    (b) => b.content
  )
  const improveContent = IMPROVE_KEYS.map((k) => pick(analysis, k))
    .filter((s) => s)
    .join('\n\n')

  // 沉淀经验候选
  const sceneName = sceneLabel(detail?.scene || '')
  const distillCandidates = [
    analysis?.suggested_script ? { key: 'script', title: `${sceneName} · 有效回应话术`, content: analysis.suggested_script } : null,
    analysis?.employee_did_well ? { key: 'didwell', title: `${sceneName} · 值得复制的做法`, content: analysis.employee_did_well } : null,
    followupGoal ? { key: 'followup', title: `${sceneName} · 跟进流程`, content: followupGoal } : null,
  ].filter(Boolean) as { key: string; title: string; content: string }[]

  // 证据来源（report 内数组）
  const knowledgeSources = Array.isArray(analysis?.knowledge_sources)
    ? analysis.knowledge_sources
    : typeof analysis?.knowledge_sources === 'string'
    ? (() => {
        try {
          const p = JSON.parse(analysis.knowledge_sources)
          return Array.isArray(p) ? p : []
        } catch {
          return []
        }
      })()
    : []
  const methodologySources = Array.isArray(analysis?.methodology_sources)
    ? analysis.methodology_sources
    : typeof analysis?.methodology_sources === 'string'
    ? (() => {
        try {
          const p = JSON.parse(analysis.methodology_sources)
          return Array.isArray(p) ? p : []
        } catch {
          return []
        }
      })()
    : []

  // 说话人分组（对齐 Web speakerGroups）
  const speakerMap = new Map<string, { speaker: string; role: string }>()
  trans
    .filter((t) => t.speaker)
    .forEach((t) => {
      if (!speakerMap.has(t.speaker)) speakerMap.set(t.speaker, { speaker: t.speaker, role: t.speaker_role || '' })
    })
  const speakerGroups = Array.from(speakerMap.values())

  const TABS = [
    { key: 'overview', label: '分析概览' },
    { key: 'deep', label: '深度复盘' },
    { key: 'distill', label: '沉淀经验' },
    { key: 'transcript', label: '对话记录' },
  ]

  return (
    <View className="page detail-page">
      {/* Tab 栏 */}
      <View className="detail-tabs">
        {TABS.map((t) => (
          <View
            key={t.key}
            className={`detail-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key as typeof tab)}
          >
            {t.label}
          </View>
        ))}
      </View>

      {/* ===== 分析概览 ===== */}
      {tab === 'overview' ? (
        <View className="tab-body">
          {/* 信息卡 */}
          <View className="info-grid">
            <View className="info-cell">
              <Text className="info-k">会谈时长</Text>
              <Text className="info-v">{fmtDuration(detail?.duration || detail?.duration_seconds || detail?.audio_duration)}</Text>
            </View>
            <View className="info-cell">
              <Text className="info-k">会谈时间</Text>
              <Text className="info-v">{time ? fmtDate(time) : '—'}</Text>
            </View>
            <View className="info-cell">
              <Text className="info-k">客户</Text>
              <View className="info-v info-customer">
                <Text>{detail?.customerName || detail?.customer_name || '—'}</Text>
                <Text className="info-edit" onClick={editCustomer}>编辑</Text>
              </View>
            </View>
            <View className="info-cell">
              <Text className="info-k">参与员工</Text>
              <Text className="info-v">{detail?.employeeName || detail?.employee_name || '我'}</Text>
            </View>
          </View>

          {/* 录音与处理诊断（设计图） */}
          <View className="ref-card diag-card">
            <View className="diag-head">
              <View className="diag-title-row">
                <Icon svg={ICN.mic('#008448')} size={22} />
                <Text className="diag-title">录音与处理诊断</Text>
              </View>
              {audioStored ? (
                <Text className="diag-status">✓ 已落盘</Text>
              ) : (
                <Text className="diag-status pending">待上传</Text>
              )}
            </View>
            <View className="diag-meta">
              <Text className="diag-meta-item">时长：{fmtDuration(detail?.duration || detail?.duration_seconds || detail?.audio_duration)}</Text>
              {detail?.audio_bytes ? (
                <Text className="diag-meta-item">大小：{fmtSize(detail.audio_bytes)}</Text>
              ) : null}
            </View>
          </View>

          {/* 原音播放（核验用） */}
          {audioAvailable ? (
            <View className="ref-card audio-card" onClick={playAudio}>
              <Icon svg={ICN.mic(audioState === 'playing' ? '#c88400' : '#008448')} size={28} />
              <Text className="audio-text">{audioState === 'loading' ? '加载录音中…' : audioState === 'playing' ? '点击停止播放' : '播放原始录音核验'}</Text>
              {audioState === 'playing' ? <View className="audio-eq"><View /><View /><View /></View> : null}
            </View>
          ) : null}

          {needsRecovery ? (
            <View className="ref-card recovery-card">
              <Text className="recovery-title">会谈处理状态</Text>
              <Text className="recovery-detail">
                {diagnostics?.next_step || detail?.fail_reason || '正在确认录音与转写处理状态。'}
              </Text>
              {(diagnostics?.asr_error_code || diagnostics?.analysis_error_code) ? (
                <Text className="recovery-code">
                  错误码：{diagnostics?.asr_error_code || diagnostics?.analysis_error_code}
                </Text>
              ) : null}
              <View className="recovery-actions">
                {!audioStored ? (
                  <View className="ref-btn-sm ref-btn-sm-primary" onClick={reuploadAudio}>
                    {recoveryAction === 'upload' ? '上传中…' : '重新上传录音'}
                  </View>
                ) : null}
                {/* 录音/转写内容无效（太短/嘈杂/无人说话）：重新提交转写无意义，引导重新录音 */}
                {isInvalidRecording ? (
                  <View className="ref-btn-sm ref-btn-sm-primary" onClick={goRecord}>
                    重新录音
                  </View>
                ) : ['failed', 'error'].includes(status) && !diagnostics?.analysis_error_code ? (
                  <View className="ref-btn-sm ref-btn-sm-primary" onClick={retryTranscription}>
                    {recoveryAction === 'retry' ? '提交中…' : '重新提交转写'}
                  </View>
                ) : null}
                {/* 语音本身问题（录音无效）时不提供重试：重新分析/重新提交转写都无意义，仅引导重新录音 */}
                {!isInvalidRecording && trans.length > 0 && ['failed', 'error'].includes(status) ? (
                  <View className="ref-btn-sm ref-btn-sm-plain" onClick={reanalyze}>
                    {recoveryAction === 'analyze' ? '分析中…' : '重新分析'}
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* 行动确认 */}
          {actionPending ? (
            <View className="ref-card action-card">
              <View className="action-title">
                <Icon svg={ICN.warn('#a76400')} size={20} />
                <Text>转写修订后跟进计划已变化</Text>
              </View>
              <Text className="action-desc">请确认采用修订后的新计划，还是保留原有跟进计划。</Text>
              <View className="action-btns">
                <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => handleReconcile('keep')}>
                  {reconciling === 'keep' ? '处理中…' : '保留原计划'}
                </View>
                <View className="ref-btn-sm ref-btn-sm-primary" onClick={() => handleReconcile('apply')}>
                  {reconciling === 'apply' ? '处理中…' : '采用新计划'}
                </View>
              </View>
            </View>
          ) : null}

          {/* 质量评分 + 复核 */}
          {score != null ? (
            <View className="ref-card score-card">
              <View className="score-left">
                <View className="score-ring" style={{ borderColor: scoreColor(reviewScore ?? score) }}>
                  <Text className="score-num" style={{ color: scoreColor(reviewScore ?? score) }}>
                    {reviewScore ?? score}
                  </Text>
                </View>
                <Text className="score-label">{reviewScore != null ? '人工复核分' : '质量评分'}</Text>
                {reviewScore != null ? <Text className="score-auto">自动 {score}</Text> : null}
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
                {isAdmin ? (
                  <View className="review-block">
                    <Text className="review-label">店长人工复核</Text>
                    <View className="review-score-row">
                      {[0, 25, 50, 75, 100].map((s) => (
                        <View
                          key={s}
                          className={`review-score-btn${reviewScore === s ? ' active' : ''}`}
                          onClick={() => !reviewing && handleQualityReview(s)}
                        >
                          {s} 分
                        </View>
                      ))}
                    </View>
                    <Text className="review-hint">{reviewing ? '保存中…' : '点击评分完成人工复核'}</Text>
                  </View>
                ) : null}
                {analysis?.quality_review_note ? (
                  <Text className="review-note">复核说明：{analysis.quality_review_note}</Text>
                ) : null}
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
        </View>
      ) : null}

      {/* ===== 深度复盘 ===== */}
      {tab === 'deep' ? (
        <View className="tab-body">
          {status !== 'done' || !analysis ? (
            <View className="ref-empty">会谈分析完成后可查看深度复盘</View>
          ) : (
            <>
              {/* 深度复盘说明（设计图顶部说明） */}
              <View className="ref-card deep-tip">
                <Text className="deep-tip-title">深度复盘</Text>
                <Text className="deep-tip-desc">
                  基于该场会谈逐字稿与门店知识库比对生成，采用 QMS 标准报告结构，供老板/店长阅读复盘。
                </Text>
              </View>
              {reviewBlocks.map((b, i) => (
                <View className="ref-card review-block" key={i}>
                  <Text className="review-block-title">{b.title}</Text>
                  {b.hint ? <Text className="review-block-hint">{b.hint}</Text> : null}
                  <Text className="review-block-text">{b.content}</Text>
                </View>
              ))}
              {improveContent ? (
                <View className="ref-card review-block">
                  <Text className="review-block-title">需要补强与错失机会</Text>
                  <Text className="review-block-text">{improveContent}</Text>
                </View>
              ) : null}

              {/* 证据来源 */}
              <View className="ref-card evidence-card">
                <View className="evidence-head">
                  <Text className="evidence-title">复盘依据与引用可信度</Text>
                  <Text className="evidence-link" onClick={() => Taro.showToast({ title: '门店反馈功能建设中', icon: 'none' })}>
                    门店反馈链接 ›
                  </Text>
                </View>
                {analysis?.evidence_policy ? (
                  <Text className="evidence-policy">{analysis.evidence_policy}</Text>
                ) : null}
                <Text className="evidence-sub">逐句转写（事实依据）</Text>
                <Text className="evidence-text">本次客户事实、需求与决策判断以逐句转写为准，可到"对话记录"核对原文与录音。</Text>

                <Text className="evidence-sub">门店知识库引用</Text>
                {knowledgeSources.length === 0 ? (
                  <Text className="evidence-empty">本次未命中门店资料</Text>
                ) : (
                  knowledgeSources.map((s: any, i: number) => (
                    <View className="evidence-item" key={i}>
                      <Text className="evidence-name">{s.title || s.document_id || `资料 ${i + 1}`}</Text>
                      {s.excerpt || s.snippet ? <Text className="evidence-excerpt">{s.excerpt || s.snippet}</Text> : null}
                    </View>
                  ))
                )}

                <Text className="evidence-sub">系统销售方法论</Text>
                {methodologySources.length === 0 ? (
                  <Text className="evidence-empty">本次未命中系统方法论</Text>
                ) : (
                  methodologySources.map((s: any, i: number) => (
                    <View className="evidence-item" key={i}>
                      <Text className="evidence-name">{s.title || `方法 ${i + 1}`}</Text>
                      {s.excerpt ? <Text className="evidence-excerpt">{s.excerpt}</Text> : null}
                    </View>
                  ))
                )}
              </View>

              {/* 店长补充说明（设计图：老板/店长阅读后补充） */}
              <View className="ref-card deep-note-card">
                <Text className="deep-note-title">店长补充说明</Text>
                <Text className="deep-note-desc">对本次会谈复盘的关键判断、待办或员工反馈，可在此补充（当前仅本地保存）。</Text>
                <Textarea
                  className="deep-note-input"
                  value={deepNote}
                  onInput={(e) => setDeepNote(e.detail.value)}
                  maxlength={500}
                  autoHeight
                  placeholder="补充说明…"
                  placeholderClass="ref-field-placeholder"
                />
              </View>
            </>
          )}
        </View>
      ) : null}

      {/* ===== 沉淀经验 ===== */}
      {tab === 'distill' ? (
        <View className="tab-body">
          {distillCandidates.length === 0 ? (
            <View className="ref-empty">会谈分析完成后可将优秀话术沉淀为门店经验</View>
          ) : (
            <>
              {/* 顶部说明卡（参照设计图：可提交审核的门店经验） */}
              <View className="ref-card distill-tip">
                <Text className="distill-tip-title">可提交审核的门店经验</Text>
                <Text className="distill-tip-desc">
                  提交后由店长/老板按对原会谈、编辑脱敏内容；审核通过才会进入正式知识库。
                </Text>
              </View>
              {distillCandidates.map((c) => (
                <View className="ref-card distill-card" key={c.key}>
                  <Text className="distill-title">{c.title}</Text>
                  <Text className="distill-content">{c.content}</Text>
                  <View
                    className={`ref-btn-sm ${submittedKeys[c.key] ? 'ref-btn-sm-plain' : 'ref-btn-sm-primary'}`}
                    onClick={() => submitDistill(c.key, c.title, c.content)}
                  >
                    {distilling === c.key ? '提交中…' : submittedKeys[c.key] ? '已提交审核' : '提交审核'}
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      ) : null}

      {/* ===== 对话记录 ===== */}
      {tab === 'transcript' ? (
        <View className="tab-body">
          {trans.length === 0 ? (
            <View className="ref-empty">暂无转写记录</View>
          ) : (
            <>
              {/* 逐句转写与修订说明 */}
              <View className="ref-card transcript-tip">
                <Text className="transcript-tip-title">逐句转写与修订</Text>
                <Text className="transcript-tip-desc">
                  这里保留语音识别返回的逐句原文，修订后会以修订版重新生成报告，原始识别内容仍可展开查看。
                </Text>
              </View>

              {/* 说话人身份确认 */}
              {speakerGroups.length > 0 ? (
                <View className="ref-card speaker-identity">
                  <Text className="speaker-identity-title">
                    {speakerGroups.every((g) => g.role) ? '已确认说话人身份' : '请确认说话人身份'}
                  </Text>
                  <Text className="speaker-identity-desc">
                    系统会优先判断：如有误，请改正后重新分析；报告合成优先使用您的标注。
                  </Text>
                  <View className="speaker-identity-row">
                    {speakerGroups.map((g) => (
                      <View
                        key={g.speaker}
                        className={`speaker-identity-pill ${g.role ? '' : 'pending'}`}
                        onClick={() => setSpeakerRole(g.speaker)}
                      >
                        <Text>{ROLE_LABEL[g.role] || g.speaker} 自动判断 ▾</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* 原始录音 */}
              {audioAvailable ? (
                <View className="ref-card transcript-player">
                  <Text className="transcript-player-title">原始录音</Text>
                  <View className="transcript-player-row">
                    <View className="transcript-player-icon" onClick={playAudio}>
                      <Text>{audioState === 'playing' ? '■' : '▶'}</Text>
                    </View>
                    <View className="transcript-player-bar">
                      <View className="transcript-player-progress" style={{ width: audioProgress + '%' }} />
                    </View>
                    <Text className="transcript-player-time">{audioProgressText}</Text>
                    <View className="transcript-player-vol">
                      <Text>🔊</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* 逐句转写 */}
              {trans.map((t, i) => {
                const speakerNum = (t.speaker || '').replace(/^speaker_/, '')
                const speakerLabel = ROLE_LABEL[t.speaker_role] || (speakerNum ? `说话人 ${speakerNum}` : '说话人')
                const startEnd = formatTranscriptTime(t.start_time, t.end_time)
                return (
                  <View className="ref-card trans-item" key={t.id || i}>
                    <View className="trans-head">
                      <Text className={`ref-status ${ROLE_TAG[t.speaker_role] || 'ref-status-gray'}`}>
                        {speakerLabel}
                      </Text>
                      <Text className="trans-time">{startEnd}</Text>
                      {t.edited_at ? <Text className="trans-edited">已修订</Text> : null}
                    </View>
                    <Text className="trans-text">{t.content}</Text>
                    {t.original_content && t.original_content !== t.content ? (
                      <Text className="trans-original">原音识别：{t.original_content}</Text>
                    ) : null}
                    <Text className="trans-revise" onClick={() => reviseTranscript(t)}>
                      {editingId === t.id ? '保存中…' : '修订此句'}
                    </Text>
                  </View>
                )
              })}
            </>
          )}
        </View>
      ) : null}
    </View>
  )
}
