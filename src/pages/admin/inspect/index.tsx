import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { adminApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import './index.scss'

type OpsItem = {
  severity: string
  title: string
  detail: string
  count: number
  href: string
}

const SEVERITY_META: Record<string, [string, string]> = {
  critical: ['紧急', 'ref-status-red'],
  warning: ['警告', 'ref-status-yellow'],
  info: ['提示', 'ref-status-blue'],
}

export default function AdminInspect() {
  const user = getUserInfo()
  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [ops, setOps] = useState<{ summary: any; items: OpsItem[] } | null>(null)
  const [dash, setDash] = useState<any>(null)

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
    const [r1, r2] = await Promise.all([adminApi.operationsOverview(), adminApi.dashboard()])
    if (r1.ok) setOps(r1.data)
    else Taro.showToast({ title: r1.error || '加载失败', icon: 'none' })
    if (r2.ok) setDash(r2.data)
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-inspect">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  const items = ops?.items || []

  return (
    <View className="page admin-inspect">
      <View className="page-header">
        <Text>巡店监控</Text>
      </View>

      {!loading && dash ? (
        <View className="ref-card inspect-summary">
          <Text className="insp-title">经营健康概览</Text>
          <View className="insp-grid">
            <View className="insp-item">
              <Text className="insp-num">{dash.today_meetings?.count || 0}</Text>
              <Text className="insp-k">今日会谈</Text>
            </View>
            <View className="insp-item">
              <Text className="insp-num red">{(dash.weekly_compliance_hits?.L1 || 0) + (dash.weekly_compliance_hits?.L2 || 0)}</Text>
              <Text className="insp-k">高危合规</Text>
            </View>
            <View className="insp-item">
              <Text className="insp-num">{dash.tasks?.pending || 0}</Text>
              <Text className="insp-k">待办任务</Text>
            </View>
            <View className="insp-item">
              <Text className="insp-num red">{dash.tasks?.overdue || 0}</Text>
              <Text className="insp-k">逾期任务</Text>
            </View>
          </View>
          {dash.generated_at ? <Text className="insp-time">数据时间：{dash.generated_at}</Text> : null}
        </View>
      ) : null}

      <View className="section-title">
        <Text>运营异常</Text>
        <Text className="section-sub">共 {ops?.summary?.total || 0} 项</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton insp-skeleton" />
      ) : items.length === 0 ? (
        <View className="ref-empty">运营一切正常</View>
      ) : (
        items.map((it, i) => {
          const [label, tag] = SEVERITY_META[it.severity] || SEVERITY_META.info
          return (
            <View className="ref-card insp-card" key={i}>
              <View className="insp-card-head">
                <Text className={`ref-status ${tag}`}>{label}</Text>
                <Text className="insp-count">{it.count || 0} 条</Text>
              </View>
              <Text className="insp-title-text">{it.title}</Text>
              <Text className="insp-detail">{it.detail}</Text>
            </View>
          )
        })
      )}
    </View>
  )
}
