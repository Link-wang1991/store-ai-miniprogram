import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { reportApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import './index.scss'

export default function AdminReport() {
  const user = getUserInfo()
  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

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
    const r = await reportApi.list()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  async function generate() {
    if (busy) return
    setBusy(true)
    const r = await reportApi.generate('weekly')
    setBusy(false)
    Taro.showToast({ title: r.ok ? '已生成经营报告' : r.error || '生成失败', icon: 'none' })
    if (r.ok) load()
  }

  function parseContent(c: any): any {
    if (!c) return null
    if (typeof c === 'string') {
      try { return JSON.parse(c) } catch { return null }
    }
    return c
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-report">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  return (
    <View className="page admin-report">
      <View className="page-header">
        <Text>增长复盘</Text>
      </View>

      <View className="ref-primary gen-btn" onClick={generate}>
        {busy ? '生成中…' : '生成本周经营报告'}
      </View>

      <View className="section-title">
        <Text>经营报告</Text>
        <Text className="section-sub">共 {list.length} 份</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton rp-skeleton" />
      ) : list.length === 0 ? (
        <View className="ref-empty">暂无经营报告，点击上方生成</View>
      ) : (
        list.map((rp, i) => {
          const c = parseContent(rp.content)
          return (
            <View className="ref-card rp-card" key={rp.id || i}>
              <View className="rp-head">
                <Text className="rp-type">{rp.type === 'weekly' ? '周报' : rp.type}</Text>
                <Text className="rp-date">{rp.report_date || fmtDate(rp.created_at)}</Text>
              </View>
              {c ? (
                <View className="rp-stats">
                  <View className="rp-stat">
                    <Text className="rp-num">{c.today_meetings?.count ?? 0}</Text>
                    <Text className="rp-k">今日会谈</Text>
                  </View>
                  <View className="rp-stat">
                    <Text className="rp-num">{c.week_meetings ?? 0}</Text>
                    <Text className="rp-k">本周会谈</Text>
                  </View>
                  <View className="rp-stat">
                    <Text className="rp-num">{c.customers ?? 0}</Text>
                    <Text className="rp-k">客户数</Text>
                  </View>
                  <View className="rp-stat">
                    <Text className="rp-num">{c.tasks?.pending ?? 0}</Text>
                    <Text className="rp-k">待办任务</Text>
                  </View>
                </View>
              ) : null}
              {c ? (
                <View className="rp-detail">
                  {c.risk_open != null ? <Text className="rp-line">未处理风险：{c.risk_open}</Text> : null}
                  {c.knowledge_active != null ? <Text className="rp-line">启用知识：{c.knowledge_active}</Text> : null}
                  {c.tasks?.done_7d != null ? <Text className="rp-line">近7天完成动作：{c.tasks.done_7d}</Text> : null}
                </View>
              ) : null}
            </View>
          )
        })
      )}
    </View>
  )
}
