import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { bargainReviewApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import './index.scss'

export default function AdminBargain() {
  const user = getUserInfo()
  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (!isMgmt) {
      setLoading(false)
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePullDownRefresh(() => {
    load()
  })

  async function load() {
    setLoading(true)
    const [r1, r2] = await Promise.all([
      bargainReviewApi.list(),
      bargainReviewApi.summary(),
    ])
    if (r1.ok) setList(r1.data || [])
    else Taro.showToast({ title: r1.error || '加载失败', icon: 'none' })
    if (r2.ok) setSummary(r2.data)
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-bargain">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  const scoreColor = (s: any) => {
    if (s == null) return 'na'
    if (s >= 75) return 'high'
    if (s >= 50) return 'mid'
    return 'low'
  }

  return (
    <View className="page admin-bargain">
      <View className="page-header">
        <Text>议价复盘</Text>
      </View>

      {!loading && summary ? (
        <View className="ref-card sum-card">
          <View className="sum-grid">
            <View className="sum-item">
              <Text className="sum-num">{summary.total || 0}</Text>
              <Text className="sum-k">复盘会谈</Text>
            </View>
            <View className="sum-item">
              <Text className="sum-num red">{summary.low_score_count || 0}</Text>
              <Text className="sum-k">成交推进低分</Text>
            </View>
            <View className="sum-item">
              <Text className="sum-num yellow">{summary.has_barrier_count || 0}</Text>
              <Text className="sum-k">存在决策障碍</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View className="section-title">
        <Text>议价/成交推进复盘</Text>
        <Text className="section-sub">共 {list.length} 条</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton bg-skeleton" />
      ) : list.length === 0 ? (
        <View className="ref-empty">暂无议价复盘数据</View>
      ) : (
        list.map((b, i) => (
          <View className="ref-card bg-card" key={b.id || i}>
            <View className="bg-head">
              <Text className="bg-name">{b.customer_name || '未命名客户'}</Text>
              <Text className={`bg-score ${scoreColor(b.deal_advancing_score)}`}>
                {b.deal_advancing_score == null ? '未评分' : b.deal_advancing_score}
              </Text>
            </View>
            <View className="bg-meta">
              {b.employee_name ? <Text>{b.employee_name} · </Text> : null}
              <Text>{b.scene || '—'} · </Text>
              <Text>{fmtDate(b.reviewed_at)}</Text>
            </View>
            {b.decision_barriers ? (
              <View className="bg-block">
                <Text className="bg-label">决策障碍</Text>
                <Text className="bg-text">{b.decision_barriers}</Text>
              </View>
            ) : null}
            {b.missed_opportunities ? (
              <View className="bg-block">
                <Text className="bg-label">错失机会</Text>
                <Text className="bg-text">{b.missed_opportunities}</Text>
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  )
}
