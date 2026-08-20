import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { qualityReviewApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import './index.scss'

export default function AdminScore() {
  const user = getUserInfo()
  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

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
    const r = await qualityReviewApi.calibration()
    if (r.ok) setData(r.data)
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-score">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  const reasons: [string, string][] = [
    ['need_discovery', '需求挖掘'],
    ['deal_progress', '成交推进'],
    ['service_experience', '服务体验'],
    ['compliance', '合规'],
    ['transcript_quality', '转写质量'],
    ['other', '其他'],
  ]

  return (
    <View className="page admin-score">
      <View className="page-header">
        <Text>评分复盘</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton score-skeleton" />
      ) : !data ? (
        <View className="ref-empty">暂无评分校准数据</View>
      ) : (
        <>
          <View className="ref-card calib-card">
            <Text className="calib-method">{data.method}</Text>
            <View className="calib-grid">
              <View className="calib-item">
                <Text className="calib-num">{data.sample_size ?? 0}</Text>
                <Text className="calib-k">复核样本</Text>
              </View>
              <View className="calib-item">
                <Text className="calib-num">{data.automatic_average ?? '—'}</Text>
                <Text className="calib-k">自动均分</Text>
              </View>
              <View className="calib-item">
                <Text className="calib-num">{data.manual_average ?? '—'}</Text>
                <Text className="calib-k">人工均分</Text>
              </View>
              <View className="calib-item">
                <Text className="calib-num">{data.same_band_rate ?? '—'}%</Text>
                <Text className="calib-k">分段一致率</Text>
              </View>
            </View>
            {data.interpretation ? <Text className="calib-int">{data.interpretation}</Text> : null}
          </View>

          {data.reason_counts && Object.keys(data.reason_counts).length > 0 ? (
            <>
              <View className="section-title"><Text>复核原因分布</Text></View>
              <View className="ref-card">
                {reasons.map(([code, label]) => {
                  const cnt = data.reason_counts[code] || 0
                  if (!cnt) return null
                  return (
                    <View className="reason-row" key={code}>
                      <Text className="reason-label">{label}</Text>
                      <Text className="reason-count">{cnt} 次</Text>
                    </View>
                  )
                })}
              </View>
            </>
          ) : null}

          {data.recent_reviews && data.recent_reviews.length > 0 ? (
            <>
              <View className="section-title"><Text>最近人工复核</Text></View>
              {data.recent_reviews.map((r: any, i: number) => (
                <View className="ref-card rev-card" key={i}>
                  <View className="rev-head">
                    <Text className="rev-name">{r.customer_name || '未命名客户'}</Text>
                    <Text className="rev-employee">{r.employee_name || '—'}</Text>
                  </View>
                  <View className="rev-scores">
                    <Text className="rev-auto">自动 {r.automatic_score}</Text>
                    <Text className="rev-gap">偏差 {r.gap}</Text>
                    <Text className="rev-manual">人工 {r.review_score}</Text>
                  </View>
                  {r.note ? <Text className="rev-note">{r.note}</Text> : null}
                  <Text className="rev-date">{fmtDate(r.reviewed_at)}</Text>
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
    </View>
  )
}
