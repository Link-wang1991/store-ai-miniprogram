import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { View, Text, Textarea, Input, ScrollView, Picker } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import {
  chatApi,
  customerApi,
  type AiActionProposal,
  type ActionProposalAssignee,
} from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import './index.scss'

interface Msg {
  id: string
  role: 'user' | 'ai'
  text: string
  answerType?: string
  riskLevel?: string
  generationMode?: string
  messageId?: string
  retrieved?: any[]
  methodology?: any[]
  actionProposal?: AiActionProposal | null
  feedbackType?: string
  error?: boolean
}

const ANALYSIS_MARKER = '===ANALYSIS==='
const QUICK_QUESTIONS = [
  '如何提高新客到店转化率？',
  '客户说「太贵了」怎么回应？',
  '帮我分析今天的待跟进客户',
  '沉睡客户怎么激活？',
  '有什么开场白话术推荐？',
  '帮我复盘一下最近的会谈',
]
const ANSWER_TYPE_LABEL: Record<string, string> = {
  knowledge: '门店知识库',
  general: '通用建议',
  pending: '待确认',
  escalated: '高风险·已升级',
}
const RISK_TAG: Record<string, string> = {
  L1: 'ref-status-gray',
  L2: 'ref-status-blue',
  L3: 'ref-status-yellow',
  L4: 'ref-status-red',
}
const GENERATION_MODE_LABEL: Record<string, string> = {
  model: '模型生成',
  fallback: '资料·规则兜底',
  safety_rule: '安全规则',
  legacy: '历史记录',
}
const PRIORITY_OPTIONS = [
  { key: 'normal', label: '普通' },
  { key: 'high', label: '重要' },
  { key: 'urgent', label: '紧急' },
]
const FEEDBACK_OPTIONS = ['已接受', '已预约', '仍有顾虑', '信息有误', '需要升级']
const ROLE_LABEL: Record<string, string> = {
  employee: '员工',
  customer: '客户',
  manager: '店长',
  other: '其他',
}

let seq = 0
const nid = () => `m${Date.now()}_${seq++}`

function inlineBold(s: string): ReactNode[] {
  const parts = s.split(/\*\*(.+?)\*\*/g)
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <Text key={i} className="rich-bold">
        {p}
      </Text>
    ) : (
      <Text key={i}>{p}</Text>
    )
  )
}

function renderRich(text: string): ReactNode[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  return lines.map((line, i) => {
    const m = line.match(/^\s*([-•*]|\d+[.、)])\s+(.*)$/)
    if (m) {
      return (
        <View key={i} className="rich-li">
          <Text className="rich-dot">{/^\d/.test(m[1]) ? m[1] : '·'}</Text>
          <View className="rich-li-body">{inlineBold(m[2])}</View>
        </View>
      )
    }
    return (
      <View key={i} className="rich-line">
        {inlineBold(line)}
      </View>
    )
  })
}

function toLocalParts(iso?: string | null) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  }
}
function fmtDue(iso?: string | null) {
  if (!iso) return '待设置'
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---- 待办建议编辑面板（对齐 Web ActionProposalEditor） ----
function ProposalEditor({
  proposal,
  busy,
  onSave,
  onCancel,
}: {
  proposal: AiActionProposal
  busy: boolean
  onSave: (input: Pick<AiActionProposal, 'title' | 'content' | 'assignedTo' | 'priority' | 'dueAt'>) => Promise<boolean>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(proposal.title)
  const [content, setContent] = useState(proposal.content)
  const [assignees, setAssignees] = useState<ActionProposalAssignee[]>([])
  const [assignedTo, setAssignedTo] = useState(proposal.assignedTo || '')
  const [priority, setPriority] = useState(proposal.priority || 'normal')
  const parts = toLocalParts(proposal.dueAt)
  const [date, setDate] = useState(parts.date)
  const [time, setTime] = useState(parts.time)
  const [error, setError] = useState('')

  useDidShow(() => {
    try {
      ;(Taro.getCurrentInstance().page as any)?.getTabBar?.()?.setSelected?.(3)
    } catch {}
  })

  useEffect(() => {
    chatApi.actionProposalAssignees().then((r) => {
      if (!r.ok || !r.data) return
      setAssignees(r.data)
      if (!assignedTo && r.data[0]) setAssignedTo(r.data[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    if (!title.trim() || !content.trim() || !assignedTo || !date || !time) {
      setError('请补齐待办标题、动作、负责人和截止时间。')
      return
    }
    setError('')
    const dueAt = new Date(`${date}T${time}:00`).toISOString()
    const ok = await onSave({
      title: title.trim(),
      content: content.trim(),
      assignedTo,
      priority,
      dueAt,
    })
    if (ok) onCancel()
  }

  return (
    <View className="proposal-editor">
      <Text className="pe-title">确认前先完善待办</Text>
      <Input
        className="ref-field pe-field"
        value={title}
        onInput={(e) => setTitle(e.detail.value)}
        maxlength={200}
        placeholder="待办标题"
        placeholderClass="ref-field-placeholder"
      />
      <Textarea
        className="ref-field pe-field pe-textarea"
        value={content}
        onInput={(e) => setContent(e.detail.value)}
        maxlength={2000}
        autoHeight
        placeholder="具体动作"
        placeholderClass="ref-field-placeholder"
      />
      <Text className="pe-k">负责人</Text>
      <ScrollView scrollX className="pe-scroll" showScrollbar={false}>
        <View className="pe-row">
          {assignees.length === 0 ? (
            <Text className="pe-loading">加载负责人…</Text>
          ) : (
            assignees.map((a) => (
              <View
                key={a.id}
                className={`pe-chip${assignedTo === a.id ? ' active' : ''}`}
                onClick={() => setAssignedTo(a.id)}
              >
                {a.name} · {a.role}
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <Text className="pe-k">优先级</Text>
      <View className="pe-row">
        {PRIORITY_OPTIONS.map((p) => (
          <View
            key={p.key}
            className={`pe-chip${priority === p.key ? ' active' : ''}`}
            onClick={() => setPriority(p.key)}
          >
            {p.label}
          </View>
        ))}
      </View>
      <Text className="pe-k">截止时间</Text>
      <View className="pe-date-row">
        <Picker mode="date" value={date} onChange={(e) => setDate(e.detail.value)}>
          <View className="ref-field pe-date">{date || '选择日期'}</View>
        </Picker>
        <Picker mode="time" value={time} onChange={(e) => setTime(e.detail.value)}>
          <View className="ref-field pe-date">{time || '选择时间'}</View>
        </Picker>
      </View>
      {error ? <Text className="pe-error">{error}</Text> : null}
      <View className="pe-actions">
        <View className="ref-btn-sm ref-btn-sm-plain" onClick={onCancel}>
          取消
        </View>
        <View className={`ref-btn-sm ref-btn-sm-primary${busy ? ' disabled' : ''}`} onClick={() => save()}>
          {busy ? '保存中…' : '保存待办'}
        </View>
      </View>
    </View>
  )
}

// ---- AI 气泡（对齐 Web AiBubble） ----
function AiBubble({
  m,
  canCreateAction,
  onFeedback,
  onCreateAction,
  onResolveAction,
  onUpdateAction,
}: {
  m: Msg
  canCreateAction: boolean
  onFeedback: (label: string) => void
  onCreateAction: () => void
  onResolveAction: (decision: 'apply' | 'reject') => void
  onUpdateAction: (input: Pick<AiActionProposal, 'title' | 'content' | 'assignedTo' | 'priority' | 'dueAt'>) => Promise<boolean>
}) {
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const idx = m.text.indexOf(ANALYSIS_MARKER)
  const main = idx >= 0 ? m.text.slice(0, idx).trim() : m.text
  const analysis = idx >= 0 ? m.text.slice(idx + ANALYSIS_MARKER.length).trim() : ''
  const p = m.actionProposal

  return (
    <View className={`msg-bubble ai${m.error ? ' error' : ''}`}>
      {renderRich(main)}

      {analysis ? (
        <View className="fold-block">
          <View className="fold-head" onClick={() => setOpen(!open)}>
            <Text className="fold-title">分析思路与策略</Text>
            <Text className="fold-arrow">{open ? '▴' : '▾'}</Text>
          </View>
          {open ? <View className="fold-body">{renderRich(analysis)}</View> : null}
        </View>
      ) : null}

      {m.retrieved && m.retrieved.length > 0 ? (
        <View className="fold-block">
          <View className="fold-head" onClick={() => setOpen(!open)}>
            <Text className="fold-title">本次引用的门店资料快照（{m.retrieved.length}）</Text>
            <Text className="fold-arrow">{open ? '▴' : '▾'}</Text>
          </View>
          {open ? (
            <View className="fold-body">
              {m.retrieved.map((ref, i) => (
                <View key={`${ref.chunkId || i}`} className="ref-item">
                  <Text className="ref-item-title">
                    {i + 1}. {ref.documentTitle ? `《${ref.documentTitle}》` : '门店资料'}
                  </Text>
                  <Text className="ref-item-snippet">{ref.snippet}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {m.methodology && m.methodology.length > 0 ? (
        <View className="fold-block">
          <View className="fold-head" onClick={() => setOpen(!open)}>
            <Text className="fold-title">系统销售方法论（{m.methodology.length}）</Text>
            <Text className="fold-arrow">{open ? '▴' : '▾'}</Text>
          </View>
          {open ? (
            <View className="fold-body">
              {m.methodology.map((item, i) => (
                <Text key={`${item.id || item.scenarioKey || i}`} className="fold-sec-item">
                  {i + 1}. 《{item.title}》{item.module ? ` · ${item.module}` : ''}
                  {item.source ? `\n来源：${item.source}` : ''}
                </Text>
              ))}
              <Text className="fold-note">仅用于销售判断与沟通策略；门店资料、价格与服务规则优先。</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {m.answerType || m.riskLevel || m.generationMode ? (
        <View className="msg-badges">
          {m.answerType ? (
            <Text className="ref-status ref-status-green">{ANSWER_TYPE_LABEL[m.answerType] || m.answerType}</Text>
          ) : null}
          {m.riskLevel && m.riskLevel !== 'L1' ? (
            <Text className={`ref-status ${RISK_TAG[m.riskLevel] || 'ref-status-yellow'}`}>风险 {m.riskLevel}</Text>
          ) : null}
          {m.generationMode ? (
            <Text className="ref-status ref-status-gray">{GENERATION_MODE_LABEL[m.generationMode] || m.generationMode}</Text>
          ) : null}
        </View>
      ) : null}

      {/* 待办建议卡 */}
      {p ? (
        <View className="proposal-card">
          <Text className="pc-head">待确认跟进建议</Text>
          <Text className="pc-title">{p.title}</Text>
          <Text className="pc-meta">
            负责人：{p.assignedTo ? '已设置（可调整）' : '待设置'} ·{' '}
            {p.priority === 'urgent' ? '紧急' : p.priority === 'high' ? '重要' : '普通'} · 截止：
            {fmtDue(p.dueAt)}
          </Text>
          {p.status === 'pending' ? (
            <>
              {editing ? (
                <ProposalEditor
                  proposal={p}
                  busy={busy}
                  onSave={onUpdateAction}
                  onCancel={() => setEditing(false)}
                />
              ) : null}
              <View className="pc-actions">
                <View className="ref-btn-sm ref-btn-sm-ghost" onClick={() => setEditing(!editing)}>
                  调整待办
                </View>
                <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => onResolveAction('reject')}>
                  暂不创建
                </View>
                <View className="ref-btn-sm ref-btn-sm-primary" onClick={() => onResolveAction('apply')}>
                  确认创建待办
                </View>
              </View>
            </>
          ) : p.status === 'applied' ? (
            <View className="pc-applied">
              <Text className="pc-applied-title">
                {p.appliedTaskStatus === 'done'
                  ? '已闭环：正式待办已完成'
                  : p.appliedTaskStatus === 'doing'
                    ? '执行中：正式待办正在处理'
                    : '已创建：等待负责人执行'}
              </Text>
              {p.appliedTaskFeedback ? <Text className="pc-applied-fb">执行反馈：{p.appliedTaskFeedback}</Text> : null}
              <Text className="pc-applied-link" onClick={() => Taro.navigateTo({ url: '/pages/tasks/index' })}>
                查看正式待办与结果
              </Text>
            </View>
          ) : (
            <Text className="pc-rejected">已选择暂不创建，未写入正式任务。</Text>
          )}
        </View>
      ) : canCreateAction ? (
        <View className="pc-create" onClick={onCreateAction}>
          将建议转为待办
        </View>
      ) : null}

      {/* 反馈 chips */}
      <View className="feedback-row">
        {FEEDBACK_OPTIONS.map((label) => (
          <Text
            key={label}
            className={`fb-chip${m.feedbackType === label ? ' active' : ''}${m.feedbackType ? ' disabled' : ''}`}
            onClick={() => !m.feedbackType && onFeedback(label)}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  )
}

export default function Chat() {
  const router = useRouter()
  const [mode, setMode] = useState<'coach' | 'classic'>('coach')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showCustPicker, setShowCustPicker] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const user = getUserInfo()

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    loadSessions()
    const { q, customerId: cid } = router.params
    if (cid) setCustomerId(cid)
    if (q) send(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function send(text?: string) {
    const q = (text ?? input).trim()
    if (!q || sending) return
    setInput('')
    setMessages((prev) => [...prev, { id: nid(), role: 'user', text: q }])
    setSending(true)
    const reqId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const r = await chatApi.ask(q, sessionId, customerId || undefined, reqId)
    if (r.ok && r.data) {
      const d = r.data
      setSessionId(d.sessionId || null)
      if (d.sessionId) loadSessions()
      setMessages((prev) => [
        ...prev,
        {
          id: nid(),
          role: 'ai',
          text: d.answer,
          answerType: d.answerType,
          riskLevel: d.riskLevel,
          generationMode: d.generationMode,
          messageId: d.messageId,
          retrieved: d.retrieved,
          methodology: d.methodology,
        },
      ])
    } else {
      setMessages((prev) => [...prev, { id: nid(), role: 'ai', text: r.error || '回答失败，请重试', error: true }])
    }
    setSending(false)
  }

  // 切换客户
  function openCustomerPicker() {
    const next = !showCustPicker
    setShowCustPicker(next)
    if (next && customers.length === 0) {
      customerApi.list().then((res) => {
        if (res.ok) setCustomers(res.data || [])
      })
    }
  }
  function switchCustomer(c: any) {
    setCustomerId(c.id)
    setCustomerName(c.name)
    setShowCustPicker(false)
    setSessionId(null)
    setMessages([])
  }

  // 反馈
  async function handleFeedback(m: Msg, label: string) {
    if (m.feedbackType || !m.messageId) return
    let comment: string | undefined
    if (['仍有顾虑', '信息有误', '需要升级'].includes(label)) {
      const modal = await Taro.showModal({
        title: `补充「${label}」的原因`,
        editable: true,
        placeholderText: '可留空',
        confirmColor: '#008448',
      })
      if (!modal.confirm) return
      comment = modal.content || undefined
    }
    const r = await chatApi.feedback(m.messageId, label, comment)
    if (r.ok) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, feedbackType: label } : x)))
      Taro.showToast({ title: '已反馈', icon: 'none' })
    } else {
      Taro.showToast({ title: r.error || '反馈失败', icon: 'none' })
    }
  }

  // 待办建议
  async function createAction(m: Msg) {
    if (!m.messageId) return
    const r = await chatApi.createActionProposal(m.messageId)
    if (r.ok && r.data) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, actionProposal: r.data } : x)))
    } else {
      Taro.showToast({ title: r.error || '暂时无法生成待办建议', icon: 'none' })
    }
  }
  async function resolveAction(m: Msg, decision: 'apply' | 'reject') {
    const p = m.actionProposal
    if (!p) return
    const r = decision === 'apply' ? await chatApi.applyActionProposal(p.id) : await chatApi.rejectActionProposal(p.id)
    if (r.ok && r.data) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, actionProposal: r.data } : x)))
      Taro.showToast({ title: decision === 'apply' ? '已创建正式待办' : '已暂不创建', icon: 'none' })
    } else {
      Taro.showToast({ title: r.error || '处理待办建议失败', icon: 'none' })
    }
  }
  async function updateAction(
    m: Msg,
    input: Pick<AiActionProposal, 'title' | 'content' | 'assignedTo' | 'priority' | 'dueAt'>
  ) {
    const p = m.actionProposal
    if (!p) return false
    const r = await chatApi.updateActionProposal(p.id, input)
    if (r.ok && r.data) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, actionProposal: r.data } : x)))
      Taro.showToast({ title: '已保存待办', icon: 'none' })
      return true
    }
    Taro.showToast({ title: r.error || '保存待办建议失败', icon: 'none' })
    return false
  }

  // ---- 会话历史（对齐 Web ClassicChatClient） ----
  async function loadSessions() {
    const r = await chatApi.listSessions()
    if (r.ok) setSessions(r.data || [])
  }

  async function openSession(s: any) {
    if (s.id === sessionId) return
    setSessionId(s.id)
    setMessages([])
    setLoadingHistory(true)
    const r = await chatApi.listMessages(s.id)
    setLoadingHistory(false)
    if (r.ok && Array.isArray(r.data)) {
      setMessages(
        r.data.map((m: any) => ({
          id: m.id || nid(),
          role: m.role === 'user' ? ('user' as const) : ('ai' as const),
          text: m.text || m.content || '',
          answerType: m.answerType,
          riskLevel: m.riskLevel,
          generationMode: m.generationMode,
          messageId: m.id,
          retrieved: m.retrieved,
          methodology: m.methodology,
          actionProposal: m.actionProposal,
          feedbackType: m.feedbackType,
        }))
      )
    }
  }

  async function deleteSession(s: any) {
    const modal = await Taro.showModal({
      title: '删除对话',
      content: '确定删除这条对话记录吗？',
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    const r = await chatApi.deleteSession(s.id)
    if (r.ok) {
      setSessions((cur) => cur.filter((x) => x.id !== s.id))
      if (s.id === sessionId) {
        setSessionId(null)
        setMessages([])
      }
    } else {
      Taro.showToast({ title: r.error || '删除失败', icon: 'none' })
    }
  }

  function newSession() {
    setSessionId(null)
    setMessages([])
  }

  function pickQuick(q: string) {
    send(q)
  }

  const lastMsgId = messages.length ? `msg-${messages[messages.length - 1].id}` : ''

  return (
    <View className="page chat-page">
      {/* 模式切换 */}
      <View className="mode-tabs">
        <View className={`mode-tab${mode === 'coach' ? ' active' : ''}`} onClick={() => setMode('coach')}>
          教练工作台
        </View>
        <View className={`mode-tab${mode === 'classic' ? ' active' : ''}`} onClick={() => setMode('classic')}>
          经典对话
        </View>
      </View>

      {/* 会话历史（经典对话模式，对齐 Web） */}
      {mode === 'classic' ? (
        <ScrollView scrollX className="session-scroll" showScrollbar={false}>
          <View className="session-row">
            <View className={`session-chip${!sessionId ? ' active' : ''}`} onClick={newSession}>
              新对话
            </View>
            {sessions.map((s) => (
              <View
                key={s.id}
                className={`session-chip${sessionId === s.id ? ' active' : ''}`}
                onClick={() => openSession(s)}
              >
                <Text className="session-chip-text">{s.title || '历史对话'}</Text>
                <Text
                  className="session-del"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSession(s)
                  }}
                >
                  ×
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {/* 上下文卡（教练工作台）/ 客户条（经典对话）—— 对齐 Web 两套组件 */}
      {mode === 'coach' ? (
        <View className="ref-card ctx-card">
          <View className="ctx-top">
            <Text className="ctx-badge">{customerId ? '客户模式' : '自由对话'}</Text>
            <Text className="ctx-title">{customerName || '门店经营助手'}</Text>
            <Text className="ctx-switch" onClick={openCustomerPicker}>
              {customerId ? '切换客户' : '选择客户'}
            </Text>
          </View>
          <Text className="ctx-meta">
            {customerId ? '已关联画像与历史' : '可随时直接提问'} · {user.roleLabel || user.role || '员工'}
          </Text>
          {showCustPicker ? (
            <View className="cust-picker">
              <ScrollView scrollY className="cust-picker-scroll">
                {customers.length === 0 ? (
                  <Text className="picker-empty">暂无客户</Text>
                ) : (
                  customers.map((c) => (
                    <View key={c.id} className="picker-item" onClick={() => switchCustomer(c)}>
                      <Text>{c.name}</Text>
                      <Text className="picker-sub">尾号 {String(c.phone || '').slice(-4)}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : customerId && customerName ? (
        <View className="classic-cust-bar">
          <Text>正在针对客户</Text>
          <Text className="ccb-name">{customerName}</Text>
          <Text className="ccb-sub">· 已结合 TA 的画像与历史</Text>
        </View>
      ) : null}

      {/* 消息区 */}
      <ScrollView scrollY className="chat-scroll" scrollIntoView={lastMsgId} scrollWithAnimation>
        {messages.length === 0 ? (
          mode === 'coach' ? (
          <View className="empty-guide">
            <View className="guide-card">
              <Text className="guide-title">可以直接说</Text>
              <Text className="guide-sub">描述客户的顾虑、当前进展或你想达成的目标，我会给你可直接使用的话术和下一步动作。</Text>
            </View>
            <View className="guide-grid">
              <View className="guide-item guide-blue">
                <Text className="guide-k">接下来要问</Text>
                <Text className="guide-v">客户最在意什么？</Text>
                <Text className="guide-v">哪一步还没确认？</Text>
              </View>
              <View className="guide-item guide-green">
                <Text className="guide-k">下一步动作</Text>
                <Text className="guide-v">明确目标后发起跟进</Text>
                <Text className="guide-v">负责人：{user.roleLabel || user.role || '员工'} · 今日</Text>
              </View>
            </View>
            <View className="guide-risk">
              <View className="guide-risk-k">
                <Icon svg={ICN.warn('#d94b3d')} size={28} />
                <Text>风险提醒</Text>
              </View>
              <Text className="guide-risk-v">涉及价格、承诺或投诉时，先确认事实与客户感受，避免直接给出折扣承诺。</Text>
            </View>
          </View>
          ) : (
            <View className="classic-empty">
              <Text>这里是<Text className="ce-bold">自由对话</Text>，想问什么直接说。</Text>
              <Text className="ce-sub">
                想要「点一下出结构化结果」？回
                <Text className="ce-link" onClick={() => setMode('coach')}>AI 教练工作台</Text>
              </Text>
            </View>
          )
        ) : (
          messages.map((m) => (
            <View key={m.id} id={`msg-${m.id}`} className={`msg-row ${m.role}`}>
              {m.role === 'ai' ? <View className="ai-badge">AI</View> : null}
              {m.role === 'ai' ? (
                <AiBubble
                  m={m}
                  canCreateAction={!!customerId && !m.error}
                  onFeedback={(label) => handleFeedback(m, label)}
                  onCreateAction={() => createAction(m)}
                  onResolveAction={(decision) => resolveAction(m, decision)}
                  onUpdateAction={(input) => updateAction(m, input)}
                />
              ) : (
                <View className="msg-bubble user">{renderRich(m.text)}</View>
              )}
            </View>
          ))
        )}
        {sending ? (
          <View className="msg-row ai">
            <View className="ai-badge">AI</View>
            <View className="msg-bubble ai">
              <Text className="loading-tip">正在检索门店知识并组织建议…</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* 快捷问题 */}
      <ScrollView scrollX className="quick-scroll" showScrollbar={false}>
        <View className="quick-row">
          {QUICK_QUESTIONS.map((q) => (
            <View key={q} className="quick-chip" onClick={() => pickQuick(q)}>
              {q}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 输入区 */}
      <View className="chat-input-bar">
        <Textarea
          className="chat-input"
          value={input}
          onInput={(e) => setInput(e.detail.value)}
          placeholder="向 AI 教练提问"
          placeholderClass="ref-field-placeholder"
          autoHeight
          maxlength={2000}
        />
        <View className={`send-btn${sending ? ' disabled' : ''}`} onClick={() => send()}>
          <Icon svg={ICN.arrow('#fff')} size={36} />
        </View>
      </View>
    </View>
  )
}
