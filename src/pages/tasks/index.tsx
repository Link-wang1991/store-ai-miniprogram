import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { taskApi } from '@/utils/api'
import { isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import './index.scss'

const FILTERS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'completed', label: '已完成' },
]
const STATUS_MAP: Record<string, [string, string]> = {
  pending: ['待办', 'ref-status-gray'],
  doing: ['进行中', 'ref-status-blue'],
  completed: ['已完成', 'ref-status-green'],
  done: ['已完成', 'ref-status-green'],
}
function stOf(s?: string) {
  return STATUS_MAP[s || 'pending'] || ['待办', 'ref-status-gray']
}

export default function Tasks() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
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
    const r = await taskApi.list(filter || undefined)
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  async function completeTask(t: any) {
    const modal = await Taro.showModal({ title: '完成任务', content: '确认已完成该任务？' })
    if (!modal.confirm) return
    const r = await taskApi.complete(t.id, 'completed')
    Taro.showToast({ title: r.ok ? '已标记完成' : r.error || '操作失败', icon: 'none' })
    if (r.ok) load()
  }

  return (
    <View className="page tasks-page">
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
        <View className="ref-skeleton tasks-skeleton" />
      ) : list.length === 0 ? (
        <View className="ref-empty">暂无任务</View>
      ) : (
        list.map((t, i) => {
          const [label, tag] = stOf(t.status)
          return (
            <View className="ref-card task-row" key={t.id || i}>
              <View className="task-head">
                <Text className="task-title">{t.title || t.content}</Text>
                <Text className={`ref-status ${tag}`}>{label}</Text>
              </View>
              <Text className="task-meta">
                {t.customer_name || '门店'} · {t.source || 'AI 生成'} · 截止 {t.due_at ? fmtDate(t.due_at) : '—'}
              </Text>
              {t.insight ? (
                <View className="insight-box">
                  <Text className="insight-text">{t.insight}</Text>
                </View>
              ) : null}
              {t.status !== 'completed' && t.status !== 'done' ? (
                <View className="task-actions">
                  <View className="ref-btn-sm ref-btn-sm-primary" onClick={() => completeTask(t)}>
                    标记完成
                  </View>
                </View>
              ) : null}
            </View>
          )
        })
      )}
    </View>
  )
}
