import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { adminApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import './index.scss'

type OperationsItem = {
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  count: number
  href: string
}

// 14 个管理入口：标题 + 图标颜色 + 跳转目标
const ENTRIES = [
  { key: 'customers', label: '客户管理', url: '/pages/admin/customers/index', icon: ICN.user, bg: '#e9f8f2', fg: '#008448' },
  { key: 'knowledge', label: '知识库', url: '/pages/admin/knowledge/index', icon: ICN.copy, bg: '#eaf5fd', fg: '#277db8' },
  { key: 'experience', label: '经验复板', url: '/pages/admin/experience/index', icon: ICN.trophy, bg: '#fff4dd', fg: '#a76400' },
  { key: 'bargain', label: '议价复盘', url: '/pages/admin/bargain/index', icon: ICN.psy, bg: '#f3eeff', fg: '#7a4aa5' },
  { key: 'score', label: '评分复盘', url: '/pages/admin/score/index', icon: ICN.check, bg: '#e9f8f2', fg: '#008448' },
  { key: 'inspect', label: '巡店监控', url: '/pages/admin/inspect/index', icon: ICN.home, bg: '#eaf5fd', fg: '#277db8' },
  { key: 'growth', label: '增长动作', url: '/pages/tasks/index', icon: ICN.arrow, bg: '#fff4dd', fg: '#a76400' },
  { key: 'staff', label: '员工管理', url: '/pages/admin/staff/index', icon: ICN.user, bg: '#f3eeff', fg: '#7a4aa5' },
  { key: 'growth_review', label: '增长复盘', url: '/pages/admin/report/index', icon: ICN.refresh, bg: '#e9f8f2', fg: '#008448' },
  { key: 'risk', label: '风险复盘', url: '/pages/admin/risk/index', icon: ICN.warn, bg: '#ffebe8', fg: '#c4392e' },
  { key: 'question', label: '提问复盘', url: '/pages/admin/question/index', icon: ICN.help, bg: '#eaf5fd', fg: '#277db8' },
  { key: 'notice', label: '通知管理', url: '/pages/admin/notice/index', icon: ICN.chat, bg: '#fff4dd', fg: '#a76400' },
  { key: 'permission', label: '权限管理', url: '/pages/admin/permission/index', icon: ICN.cog, bg: '#f3eeff', fg: '#7a4aa5' },
]

const SEVERITY_META: Record<string, [string, string]> = {
  critical: ['紧急', 'ref-status-red'],
  warning: ['警告', 'ref-status-yellow'],
  info: ['提示', 'ref-status-blue'],
}

export default function Admin() {
  const user = getUserInfo()
  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [ops, setOps] = useState<{ summary: any; items: OperationsItem[] } | null>(null)
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
    const [r1, r2] = await Promise.all([
      adminApi.operationsOverview(),
      adminApi.dashboard(),
    ])
    if (r1.ok) setOps(r1.data)
    else Taro.showToast({ title: r1.error || '异常总览加载失败', icon: 'none' })
    if (r2.ok) setDash(r2.data)
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  function goEntry(e: any) {
    Taro.navigateTo({ url: e.url })
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-page">
        <View className="ref-empty">无权限访问管理后台</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  const summary = ops?.summary || {}
  const items = ops?.items || []
  const rankList = dash?.employee_ranking || []
  const lowScore = dash?.low_score_meetings || []

  return (
    <View className="page admin-page">
      <View className="page-header">
        <Text>管理后台</Text>
      </View>

      {/* 待处理异常 */}
      <View className="section-title">
        <Text>待处理异常</Text>
        {ops ? <Text className="section-sub">共 {summary.total || 0} 项</Text> : null}
      </View>
      {loading ? (
        <View className="ref-skeleton ops-skeleton" />
      ) : items.length === 0 ? (
        <View className="ref-empty">运营一切正常，暂无异常</View>
      ) : (
        <View className="ref-card ops-card">
          <View className="ops-summary">
            <View className="ops-stat">
              <Text className="ops-num critical">{summary.critical || 0}</Text>
              <Text className="ops-k">紧急</Text>
            </View>
            <View className="ops-stat">
              <Text className="ops-num warning">{summary.warning || 0}</Text>
              <Text className="ops-k">警告</Text>
            </View>
            <View className="ops-stat">
              <Text className="ops-num total">{summary.total || 0}</Text>
              <Text className="ops-k">总计</Text>
            </View>
          </View>
          {items.map((it, i) => {
            const [label, tag] = SEVERITY_META[it.severity] || SEVERITY_META.info
            return (
              <View className="ops-item" key={i}>
                <View className="ops-item-head">
                  <Text className={`ref-status ${tag}`}>{label}</Text>
                  <Text className="ops-count">{it.count || 0} 条</Text>
                </View>
                <Text className="ops-title">{it.title}</Text>
                <Text className="ops-detail">{it.detail}</Text>
              </View>
            )
          })}
        </View>
      )}

      {/* 经营模块（店长驾驶舱） */}
      <View className="section-title">
        <Text>经营模块</Text>
      </View>
      {loading ? (
        <View className="ref-skeleton biz-skeleton" />
      ) : dash ? (
        <View className="biz-grid">
          <View className="biz-card">
            <View className="biz-ico ico-1"><Icon svg={ICN.mic('#008448')} size={30} /></View>
            <Text className="biz-num">{dash.today_meetings?.count || 0}</Text>
            <Text className="biz-k">今日会谈</Text>
            <Text className="biz-sub">均分 {Number(dash.today_meetings?.avg_quality_score || 0).toFixed(0)}</Text>
          </View>
          <View className="biz-card">
            <View className="biz-ico ico-2"><Icon svg={ICN.warn('#c4392e')} size={30} /></View>
            <Text className="biz-num">{(dash.weekly_compliance_hits?.L1 || 0) + (dash.weekly_compliance_hits?.L2 || 0) + (dash.weekly_compliance_hits?.L3 || 0) + (dash.weekly_compliance_hits?.L4 || 0)}</Text>
            <Text className="biz-k">本周合规命中</Text>
            <Text className="biz-sub">L1-L4 合计</Text>
          </View>
          <View className="biz-card">
            <View className="biz-ico ico-3"><Icon svg={ICN.check('#008448')} size={30} /></View>
            <Text className="biz-num">{dash.tasks?.pending || 0}</Text>
            <Text className="biz-k">待办任务</Text>
            <Text className="biz-sub">逾期 {dash.tasks?.overdue || 0}</Text>
          </View>
          <View className="biz-card">
            <View className="biz-ico ico-4"><Icon svg={ICN.help('#277db8')} size={30} /></View>
            <Text className="biz-num">{dash.pending_questions_count || 0}</Text>
            <Text className="biz-k">待处理问题</Text>
            <Text className="biz-sub">需确认/指派</Text>
          </View>
        </View>
      ) : (
        <View className="ref-empty">暂无经营数据</View>
      )}

      {/* 员工排行 & 低分会谈 */}
      {rankList.length > 0 ? (
        <>
          <View className="section-title">
            <Text>员工排行（近 7 天）</Text>
          </View>
          <View className="ref-card rank-card">
            {rankList.map((e, i) => (
              <View className="rank-row" key={i}>
                <Text className="rank-idx">{i + 1}</Text>
                <Text className="rank-name">{e.employee_name || '未命名'}</Text>
                <Text className="rank-count">{e.meeting_count} 场</Text>
                <Text className="rank-score">{Number(e.avg_score || 0).toFixed(1)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {lowScore.length > 0 ? (
        <>
          <View className="section-title">
            <Text>低分会谈（需复核）</Text>
          </View>
          <View className="ref-card rank-card">
            {lowScore.map((m, i) => (
              <View className="rank-row" key={i}>
                <Text className="rank-name">{m.customer_name || m.scene || '未命名客户'}</Text>
                <Text className="rank-count">{m.employee_name || '—'}</Text>
                <Text className="rank-score low">{Number(m.quality_score || 0).toFixed(0)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* 管理入口 */}
      <View className="section-title">
        <Text>管理入口</Text>
      </View>
      <View className="entry-grid">
        {ENTRIES.map((e) => (
          <View className="entry-card" key={e.key} onClick={() => goEntry(e)}>
            <View className="entry-ico" style={{ background: e.bg }}>
              <Icon svg={e.icon(e.fg)} size={26} />
            </View>
            <Text className="entry-label">{e.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
