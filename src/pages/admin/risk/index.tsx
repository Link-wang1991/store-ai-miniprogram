import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { riskAdminApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import { showEditableModal } from '@/utils/ui'
import './index.scss'

const FILTERS = [
  { key: '', label: '全部' },
  { key: 'open', label: '待处理' },
  { key: 'handled', label: '已处理' },
]

export default function AdminRisk() {
  const user = getUserInfo()
  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  usePullDownRefresh(() => {
    load()
  })

  async function load() {
    setLoading(true)
    const [r1, r2] = await Promise.all([
      riskAdminApi.list(filter || undefined),
      riskAdminApi.summary(),
    ])
    if (r1.ok) setList(r1.data || [])
    else Taro.showToast({ title: r1.error || '加载失败', icon: 'none' })
    if (r2.ok) setSummary(r2.data)
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  // 处理风险
  async function handle(r: any) {
    const res = await showEditableModal({
      title: '处理结果',
      placeholderText: '说明处理措施与结论',
      confirmColor: '#008448',
    })
    if (!res.confirm) return
    const rr = await riskAdminApi.handle(r.id, res.content?.trim() || '')
    Taro.showToast({ title: rr.ok ? '已处理' : rr.error || '操作失败', icon: 'none' })
    if (rr.ok) load()
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-risk">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  const levelColor = (lv?: string) => {
    switch (lv) {
      case 'L1': return 'lv-1'
      case 'L2': return 'lv-2'
      case 'L3': return 'lv-3'
      default: return 'lv-4'
    }
  }

  return (
    <View className="page admin-risk">
      <View className="page-header">
        <Text>风险复盘</Text>
      </View>

      {!loading && summary ? (
        <View className="ref-card sum-card">
          <View className="sum-grid">
            <View className="sum-item">
              <Text className="sum-num red">{summary.open || 0}</Text>
              <Text className="sum-k">待处理</Text>
            </View>
            <View className="sum-item">
              <Text className="sum-num">{summary.handled || 0}</Text>
              <Text className="sum-k">已处理</Text>
            </View>
            <View className="sum-item">
              <Text className="sum-num red">{(summary.l1 || 0) + (summary.l2 || 0)}</Text>
              <Text className="sum-k">高危 L1+L2</Text>
            </View>
            <View className="sum-item">
              <Text className="sum-num">{(summary.l3 || 0) + (summary.l4 || 0)}</Text>
              <Text className="sum-k">低危 L3+L4</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View className="filter-tabs">
        {FILTERS.map((f) => (
          <View
            key={f.key}
            className={`filter-tab${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </View>
        ))}
      </View>

      {loading ? (
        <View className="ref-skeleton risk-skeleton" />
      ) : list.length === 0 ? (
        <View className="ref-empty">暂无风险记录</View>
      ) : (
        list.map((r, i) => (
          <View className="ref-card risk-card" key={r.id || i}>
            <View className="risk-head">
              <Text className={`risk-level ${levelColor(r.level)}`}>{r.level || 'L4'}</Text>
              <Text className={`ref-status ${r.status === 'open' ? 'ref-status-red' : 'ref-status-green'}`}>
                {r.status === 'open' ? '待处理' : '已处理'}
              </Text>
            </View>
            <Text className="risk-type">{r.type || '风险'}</Text>
            <Text className="risk-desc">{r.description}</Text>
            {r.resolution ? <Text className="risk-res">处理：{r.resolution}</Text> : null}
            <Text className="risk-date">{fmtDate(r.created_at)}</Text>
            {r.status === 'open' ? (
              <View className="risk-actions">
                <View className="ref-btn-sm ref-btn-sm-primary" onClick={() => handle(r)}>标记处理</View>
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  )
}
