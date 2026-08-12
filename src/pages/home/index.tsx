import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { homeApi, type HomeOverview } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import './index.scss'

const AI_TABS = [
  { key: 'today', label: '今日优先' },
  { key: 'high', label: '高价值' },
  { key: 'risk', label: '风险' },
]
const PRIORITY_MAP: Record<string, { label: string; tag: string }> = {
  normal: { label: '普通', tag: 'ref-status-gray' },
  important: { label: '重要', tag: 'ref-status-green' },
  urgent: { label: '紧急', tag: 'ref-status-red' },
}

function fmtCnDate() {
  const dt = new Date()
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][dt.getDay()]
  return `${dt.getMonth() + 1}月 ${week}`
}

function avatarText(name?: string) {
  return (name || '客')[0]
}

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<HomeOverview | null>(null)
  const [tab, setTab] = useState('today')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState('')
  const user = getUserInfo()

  useDidShow(() => {
    try {
      Taro.getTabBar(Taro.getCurrentInstance().page)?.setSelected?.(2)
    } catch {}
  })

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    load()
  }, [])

  async function load() {
    setLoading(true)
    const r = await homeApi.overview()
    if (r.ok) setData(r.data || null)
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  const tasks: any[] = data?.tasks || []
  const customers: any[] = data?.customers || []

  const todayCustomers = customers.filter((c) => ['today', '今日到店'].includes(c.pool))
  const todayTasks = tasks.filter(
    (t) => t.due_at && new Date(t.due_at).toDateString() === new Date().toDateString()
  )
  const riskTasks = tasks.filter(
    (t) => String(t.priority) === 'urgent' || String(t.status).includes('risk')
  )

  const tabTasks = tasks.filter((t) => {
    if (tab === 'high') return ['important', 'urgent'].includes(t.priority)
    if (tab === 'risk') return String(t.priority) === 'urgent' || String(t.status).includes('risk')
    return true
  })

  function goChat(q?: string) {
    Taro.navigateTo({ url: `/pages/chat/index?new=1${q ? `&q=${encodeURIComponent(q)}` : ''}` })
  }

  function onMgmt() {
    if (user.role === 'super_admin') {
      Taro.navigateTo({ url: '/pages/platform/index' })
      return
    }
    Taro.showToast({ title: '管理后台开发中', icon: 'none' })
  }

  return (
    <View className="page home-page">
      {/* 欢迎区 */}
      <View className="home-hero">
        <View className="hero-top">
          <View className="hero-left">
            <Text className="hero-date">{fmtCnDate()}</Text>
            <View className="hero-title">
              <Text>早上好，{user.name || '伙伴'}。今天有</Text>
              <Text className="hl-num">{todayTasks.length}</Text>
              <Text>项跟进、</Text>
              <Text className="hl-num hl-risk">{riskTasks.length}</Text>
              <Text>项风险需要处理</Text>
            </View>
          </View>
          {user.role && ['owner', 'admin', 'manager', 'super_admin'].includes(user.role) ? (
            <View className="mgmt-pill" onClick={onMgmt}>
              {user.role === 'super_admin' ? '平台管理' : '管理'}
            </View>
          ) : null}
        </View>
        <View className="hero-mic" onClick={() => goChat()}>
          <Icon svg={ICN.mic('#fff')} size={44} />
        </View>
      </View>

      {/* 搜索 */}
      <View className="ref-search home-search" onClick={() => Taro.switchTab({ url: '/pages/customers/index' })}>
        <View className="ref-search-icon">
          <Icon svg={ICN.search('#9aa2ad')} size={32} />
        </View>
        <Text className="search-ph">搜索客户或待办任务</Text>
      </View>

      {/* 4 统计卡 */}
      <View className="summary-grid">
        <View className="sum-card" onClick={() => Taro.navigateTo({ url: '/pages/customers/index?mode=priority' })}>
          <View className="sum-ico ico-green"><Icon svg={ICN.trophy('#008448')} size={40} /></View>
          <Text className="sum-num">{todayCustomers.length} 位</Text>
          <Text className="sum-desc">需要优先处理</Text>
        </View>
        <View className="sum-card" onClick={() => Taro.showToast({ title: '任务页开发中', icon: 'none' })}>
          <View className="sum-ico ico-yellow"><Icon svg={ICN.clock('#c88400')} size={40} /></View>
          <Text className="sum-num">{todayTasks.length} 个</Text>
          <Text className="sum-desc">动作待完成</Text>
        </View>
        <View className="sum-card" onClick={() => Taro.navigateTo({ url: '/pages/customers/index?pool=today' })}>
          <View className="sum-ico ico-blue"><Icon svg={ICN.home('#335cff')} size={40} /></View>
          <Text className="sum-num">{todayCustomers.length} 位</Text>
          <Text className="sum-desc">需服务闭环</Text>
        </View>
        <View className="sum-card" onClick={() => Taro.showToast({ title: '经验审核开发中', icon: 'none' })}>
          <View className="sum-ico ico-purple"><Icon svg={ICN.chat('#7a4aa5')} size={40} /></View>
          <Text className="sum-num">{data?.pending_experience_reviews || 0} 条</Text>
          <Text className="sum-desc">待负责人审核</Text>
        </View>
      </View>

      {/* AI 工作项 */}
      <View className="section-title">
        <Text>AI 工作项</Text>
        <View className="tool-btn" onClick={load}>
          <Icon svg={ICN.refresh('#69707d')} size={24} />
          <Text>刷新</Text>
        </View>
      </View>
      <View className="ai-tabs">
        {AI_TABS.map((t) => (
          <View key={t.key} className={`ai-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </View>
        ))}
      </View>

      {loading ? (
        <View className="ref-skeleton home-skeleton" />
      ) : tabTasks.length === 0 ? (
        <View className="ref-empty">暂无工作项</View>
      ) : (
        tabTasks.map((t, i) => (
          <View className="ref-card task-card" key={t.id || i}>
            <View className="task-head">
              <View className="task-avatar">{avatarText(t.customer_name)}</View>
              <View className="task-main">
                <Text className="task-title">{t.title || t.content}</Text>
                <Text className="task-meta">
                  {t.customer_name || '门店'} · {t.source || 'AI 生成'} · {t.due_at ? fmtDate(t.due_at) : '今日'}
                </Text>
              </View>
              {t.priority ? (
                <Text className={`ref-status ${PRIORITY_MAP[t.priority]?.tag || 'ref-status-gray'}`}>
                  {PRIORITY_MAP[t.priority]?.label || '普通'}
                </Text>
              ) : null}
            </View>

            {t.insight ? (
              <View className="insight-box">
                <Text className="insight-text">{t.insight}</Text>
              </View>
            ) : null}

            {expanded[t.id] ? (
              <View className="detail-box">
                <Text className="detail-label">AI 研判详情</Text>
                {t.reason ? <Text className="detail-text">{t.reason}</Text> : null}
                {t.script ? (
                  <View className="script-block">
                    <Text className="script-text">「{t.script}」</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text className="expand-link" onClick={() => setExpanded((e) => ({ ...e, [t.id]: true }))}>
                查看 AI 研判详情 ▾
              </Text>
            )}

            {t.script && !expanded[t.id] ? (
              <View className="script-block">
                <Text className="script-text">「{t.script}」</Text>
              </View>
            ) : null}

            <View className="task-foot">
              <View className="foot-item">
                <Text className="foot-k">负责人</Text>
                <Text className="foot-v">{t.assignee || '我'}</Text>
              </View>
              <View className="foot-item">
                <Text className="foot-k">建议时间</Text>
                <Text className="foot-v">{t.suggested_time || '尽快'}</Text>
              </View>
            </View>

            <View className="task-actions">
              <View className="ref-btn-sm ref-btn-sm-primary action-do" onClick={() => goChat(t.title || t.content)}>
                开始执行
              </View>
              <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => showToast('已稍后提醒')}>
                稍后提醒
              </View>
            </View>
          </View>
        ))
      )}

      {/* 客户机会 */}
      {customers.length > 0 ? <View className="section-title"><Text>客户机会</Text></View> : null}
      {customers.slice(0, 3).map((c, i) => (
        <View
          className="ref-card opp-card"
          key={c.id || i}
          onClick={() => Taro.navigateTo({ url: `/pages/customer-detail/index?id=${c.id || ''}` })}
        >
          <View className="opp-head">
            <View className="task-avatar">{avatarText(c.name)}</View>
            <View className="opp-main">
              <Text className="opp-name">{c.name}</Text>
              {c.stage ? <Text className="ref-status ref-status-blue">{c.stage}</Text> : null}
            </View>
          </View>
          {c.ai_insight ? (
            <View className="insight-box">
              <Text className="insight-text">{c.ai_insight}</Text>
            </View>
          ) : null}
          <Text className="opp-link">查看客户并生成正式跟进 →</Text>
        </View>
      ))}

      {/* 右下 FAB */}
      <View className="fab" onClick={() => goChat()}>
        <Icon svg={ICN.plus('#fff')} size={44} />
      </View>

      {toast ? <View className="ref-toast">{toast}</View> : null}
    </View>
  )
}
