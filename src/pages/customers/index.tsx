import { useEffect, useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { usePullDownRefresh, useDidShow } from '@tarojs/taro'
import { customerApi } from '@/utils/api'
import { isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import './index.scss'

const POOLS = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今日到店' },
  { key: 'new', label: '新客' },
  { key: 'new_deal', label: '新成交' },
  { key: 'returning', label: '老客' },
  { key: 'dormant', label: '沉睡' },
  { key: 'risk', label: '风险' },
]
const POOL_TAG: Record<string, string> = {
  today: 'ref-status-green',
  new_deal: 'ref-status-green',
  new: 'ref-status-blue',
  returning: 'ref-status-gray',
  dormant: 'ref-status-yellow',
  risk: 'ref-status-red',
}
const POOL_LABEL: Record<string, string> = {
  today: '今日到店',
  new_deal: '新成交',
  new: '新客',
  returning: '老客',
  dormant: '沉睡',
  risk: '风险',
}

function avatarText(name?: string) {
  return (name || '客')[0]
}
function tail(phone?: string) {
  return phone && phone.length >= 4 ? phone.slice(-4) : '····'
}

export default function Customers() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [pool, setPool] = useState('all')
  const [q, setQ] = useState('')

  useDidShow(() => {
    try {
      ;(Taro.getCurrentInstance().page as any)?.getTabBar?.()?.setSelected?.(1)
    } catch {}
  })

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    load()
  }, [])

  usePullDownRefresh(() => {
    load()
  })

  async function load() {
    const r = await customerApi.list()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: list.length }
    list.forEach((c: any) => {
      const k = c.pool || 'returning'
      m[k] = (m[k] || 0) + 1
    })
    return m
  }, [list])

  const filtered = useMemo(() => {
    let arr = list
    if (pool !== 'all') arr = arr.filter((c: any) => (c.pool || 'returning') === pool)
    if (q.trim()) {
      const k = q.trim().toLowerCase()
      arr = arr.filter((c: any) =>
        [c.name, c.phone, c.concerns, c.needs].some((v) => v && String(v).toLowerCase().includes(k))
      )
    }
    return arr
  }, [list, pool, q])

  return (
    <View className="page customers-page">
      <View className="cust-header">
        <Text className="cust-title">{pool === 'all' ? '今天该跟谁' : POOLS.find((p) => p.key === pool)?.label || '客户'}</Text>
        <Text className="cust-sub">按客户价值与跟进节奏，AI 已为你排好优先级</Text>
      </View>

      <View className="ref-search cust-search">
        <View className="ref-search-icon">
          <Icon svg={ICN.search('#9aa2ad')} size={32} />
        </View>
        <Input
          className="ref-search-input"
          placeholder="姓名、电话或当前需求"
          placeholderClass="ref-field-placeholder"
          value={q}
          onInput={(e) => setQ(e.detail.value)}
        />
      </View>

      <ScrollView scrollX className="pool-scroll" showScrollbar={false}>
        <View className="pool-tabs">
          {POOLS.map((p) => (
            <View
              key={p.key}
              className={`pool-tab${pool === p.key ? ' active' : ''}`}
              onClick={() => setPool(p.key)}
            >
              {p.label}
              <Text className="pool-count">{counts[p.key] || 0}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <View className="ref-skeleton cust-skeleton" />
      ) : filtered.length === 0 ? (
        <View className="ref-empty">暂无客户</View>
      ) : (
        filtered.map((c, i) => (
          <View className="ref-card cust-card" key={c.id || i}>
            <View className="cust-top">
              <View className="cust-avatar">{avatarText(c.name)}</View>
              <View className="cust-main">
                <View className="cust-name-row">
                  <Text className="cust-name">{c.name || '客户'}</Text>
                  {c.pool ? (
                    <Text className={`ref-status ${POOL_TAG[c.pool] || 'ref-status-gray'}`}>
                      {POOL_LABEL[c.pool] || c.pool}
                    </Text>
                  ) : null}
                </View>
                <Text className="cust-meta">尾号 {tail(c.phone)} · {c.stage || '跟进中'}</Text>
              </View>
              <Text
                className="ai-link"
                onClick={() => Taro.navigateTo({ url: `/pages/customer-detail/index?id=${c.id || ''}` })}
              >
                AI 画像
              </Text>
            </View>

            {c.ai_insight ? (
              <View className="insight-box">
                <Text className="insight-text">{c.ai_insight}</Text>
              </View>
            ) : null}

            <View className="cust-foot">
              <Text className="foot-k">最近到店 {c.last_visit_at ? fmtDate(c.last_visit_at) : '—'}</Text>
              <Text className="foot-k">下次跟进 {c.next_follow_at ? fmtDate(c.next_follow_at) : '—'}</Text>
            </View>
            <Text
              className="ask-link"
              onClick={() =>
                Taro.navigateTo({
                  url: `/pages/chat/index?new=1&customerId=${c.id || ''}&q=${encodeURIComponent('关于这位客户，帮我分析一下')}`,
                })
              }
            >
              问 AI 教练 →
            </Text>
          </View>
        ))
      )}
    </View>
  )
}
