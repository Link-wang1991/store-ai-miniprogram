import { useEffect, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { customerApi } from '@/utils/api'
import { isLoggedIn, getUserInfo } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import { openCoach } from '@/utils/navigation'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import { showEditableModal } from '@/utils/ui'
import './index.scss'

export default function CustomerDetail() {
  const router = useRouter()
  const id = router.params.id || ''
  const [loading, setLoading] = useState(true)
  const [c, setC] = useState<any>(null)
  const [q, setQ] = useState('')

  const user = getUserInfo()
  const isAdmin = !!user && ['owner', 'admin', 'manager'].includes(user.role)

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    const r = await customerApi.detail(id)
    if (r.ok) setC(r.data || null)
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
  }

  function ask() {
    const text = q.trim() || '关于这位客户，帮我分析一下'
    openCoach({ customerId: id, customerName: c?.name || '客户', question: text })
  }

  function call() {
    if (c?.phone) Taro.makePhoneCall({ phoneNumber: String(c.phone) })
    else Taro.showToast({ title: '暂无手机号', icon: 'none' })
  }

  // 客户合并：把其他客户（如"新客户 xx"占位档案）合并进当前客户
  async function mergeCustomer() {
    const res = await showEditableModal({
      title: '合并进来的客户',
      placeholderText: '输入要合并的客户手机号/姓名',
      confirmColor: '#008448',
    })
    if (!res.confirm) return
    const kw = res.content?.trim()
    if (!kw) return
    const r = await customerApi.identify(kw)
    const list = r.ok ? (r.data || []) : []
    // 排除当前客户自己
    const candidates = list.filter((c: any) => c.id !== id)
    if (candidates.length === 0) {
      Taro.showToast({ title: '未找到可合并的客户', icon: 'none' })
      return
    }
    const sel = await Taro.showActionSheet({
      itemList: candidates.map((c: any) => `${c.name}（尾号${String(c.phone || '').slice(-4)}）`),
      itemColor: '#008448',
    })
    if (sel.errMsg && !sel.errMsg.includes('ok')) return
    const source = candidates[sel.tapIndex]
    if (!source) return
    const confirm = await Taro.showModal({
      title: '确认合并',
      content: `将把 ${source.name} 的会谈、任务、记忆和时间线并入「${c?.name || '当前客户'}」，并删除 ${source.name} 档案。此操作不可撤销。`,
      confirmText: '确认合并',
      confirmColor: '#d94b3d',
    })
    if (!confirm.confirm) return
    const m = await customerApi.merge(id, source.id)
    if (m.ok) {
      Taro.showToast({ title: '已合并客户', icon: 'success' })
      load()
    } else {
      Taro.showToast({ title: m.error || '合并失败', icon: 'none' })
    }
  }

  // 记忆确认/修正/拒绝（客户档案直连）
  async function handleMemory(m: any) {
    const keyLabel = m.key || '记忆'
    const sel = await Taro.showActionSheet({
      itemList: ['确认准确', '修正内容', '拒绝此记忆'],
      itemColor: '#008448',
    })
    if (sel.errMsg && !sel.errMsg.includes('ok')) return
    const action = sel.tapIndex
    if (action === 0) {
      const r = await customerApi.confirmMemory(id, m.id, { confirmed: true })
      Taro.showToast({ title: r.ok ? '已确认记忆' : r.error || '操作失败', icon: 'none' })
      if (r.ok) load()
    } else if (action === 1) {
      const res = await showEditableModal({
        title: `修正${keyLabel}`,
        content: m.value || '',
        placeholderText: '输入修正后的内容',
        confirmColor: '#008448',
      })
      if (!res.confirm) return
      const val = res.content?.trim()
      if (!val) return
      const r = await customerApi.confirmMemory(id, m.id, { confirmed: true, correctedValue: val })
      Taro.showToast({ title: r.ok ? '已修正记忆' : r.error || '操作失败', icon: 'none' })
      if (r.ok) load()
    } else {
      const r = await customerApi.confirmMemory(id, m.id, { confirmed: false })
      Taro.showToast({ title: r.ok ? '已拒绝此记忆' : r.error || '操作失败', icon: 'none' })
      if (r.ok) load()
    }
  }

  // 记忆类型中文标签
  function memoryKeyLabel(key?: string) {
    const map: Record<string, string> = {
      needs: '需求',
      concerns: '顾虑',
      emotional_needs: '情感需求',
      decision_barriers: '决策障碍',
    }
    return map[key || ''] || key || '记忆'
  }

  // 到店签到
  async function checkin() {
    Taro.showLoading({ title: '签到中…', mask: true })
    const r = await customerApi.checkin(id)
    Taro.hideLoading()
    if (r.ok) {
      Taro.showToast({ title: '已到店签到', icon: 'success' })
      load()
    } else {
      Taro.showToast({ title: r.error || '签到失败', icon: 'none' })
    }
  }

  // 编辑客户：姓名 + 手机号
  async function editCustomer() {
    const nameRes = await showEditableModal({
      title: '客户姓名',
      content: c?.name || '',
      placeholderText: '输入客户姓名',
      confirmColor: '#008448',
    })
    if (!nameRes.confirm) return
    const name = nameRes.content?.trim()
    const phoneRes = await showEditableModal({
      title: '客户手机号',
      content: c?.phone || '',
      placeholderText: '输入手机号（可选）',
      confirmColor: '#008448',
    })
    if (!phoneRes.confirm) return
    const phone = phoneRes.content?.trim()
    if (!name && !phone) return
    const data: any = {}
    if (name) data.name = name
    if (phone) data.phone = phone
    const r = await customerApi.update(id, data)
    if (r.ok) {
      Taro.showToast({ title: '已保存客户资料', icon: 'none' })
      load()
    } else {
      Taro.showToast({ title: r.error || '保存失败', icon: 'none' })
    }
  }

  if (loading) {
    return (
      <View className="page cd-page">
        <View className="ref-skeleton cd-skeleton" />
        <View className="ref-skeleton cd-skeleton" />
      </View>
    )
  }
  if (!c) {
    return (
      <View className="page cd-page">
        <View className="ref-empty">客户不存在</View>
      </View>
    )
  }

  const questions: string[] = Array.isArray(c.questions)
    ? c.questions
    : c.key_questions
      ? (c.key_questions.questions || c.key_questions)
      : []
  const memories: any[] = c.memories || c.confirmed_memories || []
  const timeline: any[] = c.timeline || c.history || c.interactions || []
  const personas: string[] = c.personas || c.persona_tags || []

  return (
    <View className="page cd-page">
      {/* Hero */}
      <View className="cd-hero">
        <View className="cd-avatar">{c.name?.[0] || '客'}</View>
        <View className="cd-name">{c.name || '客户'}</View>
        <View className="cd-sub">
          <Text className="ref-status ref-status-green">尾号 {String(c.phone || '').slice(-4)}</Text>
          {c.level || c.member_level ? (
            <Text className="ref-status ref-status-purple">{c.level || c.member_level}</Text>
          ) : null}
        </View>
        <Text className="cd-last">上次服务：{c.last_service_at ? fmtDate(c.last_service_at) : '—'}</Text>
        <View className="cd-actions">
          <View className="ref-primary cd-primary" onClick={ask}>
            开始咨询
          </View>
          <View className="ref-secondary cd-secondary" onClick={call}>
            致电
          </View>
        </View>
        <View className="cd-toolbar">
          <View className="cd-tool" onClick={checkin}>
            <Icon svg={ICN.home('#008448')} size={24} />
            <Text>到店签到</Text>
          </View>
          <View className="cd-tool" onClick={editCustomer}>
            <Icon svg={ICN.cog('#008448')} size={24} />
            <Text>编辑资料</Text>
          </View>
          {isAdmin ? (
            <View className="cd-tool cd-tool-merge" onClick={mergeCustomer}>
              <Icon svg={ICN.plus('#d94b3d')} size={24} />
              <Text>合并客户</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* 今日简报 */}
      {c.ai_insight || c.core_need || c.risk || c.opening_script ? (
        <View className="section-title">
          <Text>今日简报</Text>
        </View>
      ) : null}
      {c.core_need || c.commitments ? (
        <View className="ref-card brief-card">
          <Text className="brief-k brief-ok">✓ 核心需求&待办承诺</Text>
          <Text className="brief-v">{c.core_need || c.commitments}</Text>
        </View>
      ) : null}
      {c.risk ? (
        <View className="ref-card brief-card brief-risk">
          <View className="brief-k brief-red">
            <Icon svg={ICN.warn('#d94b3d')} size={26} />
            <Text>风险提示</Text>
          </View>
          <Text className="brief-v">{c.risk}</Text>
        </View>
      ) : null}
      {questions.length > 0 ? (
        <View className="ref-card brief-card">
          <Text className="brief-k">关键提问（{questions.length}）</Text>
          {questions.map((qs, i) => (
            <Text className="brief-q" key={i}>
              {i + 1}. {qs}
            </Text>
          ))}
        </View>
      ) : null}
      {c.opening_script ? (
        <View className="brief-script">
          <Text className="brief-script-text">「{c.opening_script}」</Text>
        </View>
      ) : null}

      {/* 客户画像 */}
      {c.loyalty_score != null || personas.length > 0 ? (
        <View className="section-title">
          <Text>客户画像</Text>
        </View>
      ) : null}
      {c.loyalty_score != null ? (
        <View className="ref-card loyalty-card">
          <Text className="loyalty-k">会员粘性</Text>
          <View className="loyalty-track">
            <View className="loyalty-bar" style={{ width: `${c.loyalty_score}%` }} />
          </View>
          <Text className="loyalty-v">{c.loyalty_score}%</Text>
        </View>
      ) : null}
      {personas.length > 0 ? (
        <View className="persona-row">
          {personas.map((p, i) => (
            <Text className="ref-status ref-status-blue" key={i}>
              {p}
            </Text>
          ))}
        </View>
      ) : null}
      {c.persona_desc ? <Text className="persona-desc">{c.persona_desc}</Text> : null}

      {/* AI 记忆 */}
      <View className="section-title">
        <Text>AI 记忆</Text>
      </View>
      {memories.length === 0 ? (
        <View className="ref-card memory-empty">暂无记忆，可通过会谈分析沉淀</View>
      ) : (
        memories.map((m, i) => (
          <View className="ref-card memory-item" key={m.id || i}>
            <View className="memory-head">
              <Text className="memory-key">{memoryKeyLabel(m.key)}</Text>
              {m.status === 'pending_review' ? (
                <Text className="ref-status ref-status-yellow">待确认</Text>
              ) : m.status === 'confirmed' ? (
                <Text className="ref-status ref-status-green">已确认</Text>
              ) : m.status === 'rejected' ? (
                <Text className="ref-status ref-status-gray">已拒绝</Text>
              ) : null}
            </View>
            <Text className="memory-text">{m.value || m.content || m}</Text>
            <Text className="memory-op" onClick={() => handleMemory(m)}>
              {m.status === 'rejected' ? '重新确认' : '确认 / 修正 / 拒绝'}
            </Text>
          </View>
        ))
      )}

      {/* 会谈记录入口 */}
      <View className="ref-card cd-meeting" onClick={() => Taro.switchTab({ url: '/pages/meeting/index' })}>
        <Text className="cd-meeting-text">
          <Icon svg={ICN.mic('#006d37')} size={28} />
          发起一次会谈记录 →
        </Text>
      </View>

      {/* 互动时间线 */}
      {timeline.length > 0 ? (
        <View className="section-title">
          <Text>互动时间线</Text>
        </View>
      ) : null}
      {timeline.length > 0 ? (
        <View className="timeline">
          {timeline.map((t, i) => (
            <View className="tl-item" key={i}>
              <View className="tl-dot" />
              <View className="tl-body">
                <Text className="tl-time">{t.time || t.created_at || ''}</Text>
                <Text className="tl-text">{t.content || t.text || t.type || ''}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* 底部询问条 */}
      <View className="ask-bar">
        <View className="ask-avatar">{c.name?.[0] || '客'}</View>
        <Input
          className="ask-input"
          value={q}
          onInput={(e) => setQ(e.detail.value)}
          placeholder={`向 AI 询问关于 ${c.name || '客户'} 的问题`}
          placeholderClass="ref-field-placeholder"
          confirmType="send"
          onConfirm={ask}
        />
        <View className="ask-send" onClick={ask}>
          <Icon svg={ICN.arrow('#fff')} size={32} />
        </View>
      </View>
    </View>
  )
}
