import { useEffect, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { customerApi } from '@/utils/api'
import { isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import './index.scss'

export default function CustomerDetail() {
  const router = useRouter()
  const id = router.params.id || ''
  const [loading, setLoading] = useState(true)
  const [c, setC] = useState<any>(null)
  const [q, setQ] = useState('')

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
    Taro.navigateTo({ url: `/pages/chat/index?new=1&customerId=${id}&q=${encodeURIComponent(text)}` })
  }

  function call() {
    if (c?.phone) Taro.makePhoneCall({ phoneNumber: String(c.phone) })
    else Taro.showToast({ title: '暂无手机号', icon: 'none' })
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
        <View className="ref-card memory-empty">暂无已确认记忆</View>
      ) : (
        memories.map((m, i) => (
          <View className="ref-card memory-item" key={i}>
            <Text className="memory-text">{m.content || m}</Text>
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
