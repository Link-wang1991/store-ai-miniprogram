import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { adminApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
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
  const isMgmt = !!user && ['owner', 'admin', 'manager', 'operator'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [ops, setOps] = useState<{ summary: any; items: OpsItem[] } | null>(null)
  const [error, setError] = useState('')

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
    setError('')
    const r1 = await adminApi.operationsOverview()
    if (r1.ok) setOps(r1.data)
    else {
      setOps(null)
      setError(r1.error || '经营提醒加载失败')
    }
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
        <Text>经营提醒</Text>
      </View>

      <View className="section-title">
        <Text>需要关注的事项</Text>
        {ops ? <Text className="section-sub">高风险 {ops.summary?.critical || 0} · 待关注 {ops.summary?.warning || 0}</Text> : null}
      </View>

      {loading ? (
        <View className="ref-skeleton insp-skeleton" />
      ) : error ? (
        <View className="ref-empty">{error}</View>
      ) : items.filter((item) => Number(item.count || 0) > 0).length === 0 ? (
        <View className="ref-empty">运营状态正常</View>
      ) : (
        items.filter((item) => Number(item.count || 0) > 0).map((it, i) => {
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
