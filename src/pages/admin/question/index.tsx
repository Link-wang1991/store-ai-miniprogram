import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { pendingQuestionApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import { showEditableModal } from '@/utils/ui'
import './index.scss'

const STATUS_META: Record<string, [string, string]> = {
  pending: ['待确认', 'ref-status-yellow'],
  assigned: ['已指派', 'ref-status-blue'],
  handling: ['处理中', 'ref-status-blue'],
  resolved: ['已解决', 'ref-status-green'],
  escalated: ['已升级', 'ref-status-red'],
  review_pending: ['待知识审核', 'ref-status-blue'],
}

const MANAGEMENT_ROLES = new Set(['owner', 'admin', 'manager', 'operator'])
const FULL_MANAGEMENT_ROLES = new Set(['owner', 'admin', 'manager'])

export default function AdminQuestion() {
  const user = getUserInfo()
  const canAccess = !!user && MANAGEMENT_ROLES.has(user.role)
  const canManageAll = !!user && FULL_MANAGEMENT_ROLES.has(user.role)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (canAccess) load()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePullDownRefresh(() => {
    load()
  })

  async function load() {
    if (!canAccess) {
      setLoading(false)
      Taro.stopPullDownRefresh()
      return
    }
    setLoading(true)
    const r = await pendingQuestionApi.list()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  // 指派给某员工
  async function assign(q: any) {
    const a = await pendingQuestionApi.assignees()
    const staff = a.ok ? (a.data || []) : []
    if (staff.length === 0) {
      Taro.showToast({ title: '暂无其他可指派员工', icon: 'none' })
      return
    }
    const sel = await Taro.showActionSheet({
      itemList: staff.map((e: any) => `${e.name}${e.role ? `（${e.role}）` : ''}`),
      itemColor: '#008448',
    })
    if (sel.errMsg && !sel.errMsg.includes('ok')) return
    const target = staff[sel.tapIndex]
    if (!target) return
    const r = await pendingQuestionApi.assign(q.id, target.id)
    Taro.showToast({ title: r.ok ? '已指派' : r.error || '指派失败', icon: 'none' })
    if (r.ok) load()
  }

  // 确认接收
  async function ack(q: any) {
    const r = await pendingQuestionApi.ack(q.id)
    Taro.showToast({ title: r.ok ? '已确认接收' : r.error || '操作失败', icon: 'none' })
    if (r.ok) load()
  }

  // 解决
  async function resolve(q: any) {
    const res = await showEditableModal({
      title: '填写处理结果',
      placeholderText: '说明如何处理该问题',
      confirmColor: '#008448',
    })
    if (!res.confirm) return
    const r = await pendingQuestionApi.resolve(q.id, res.content?.trim() || '')
    Taro.showToast({ title: r.ok ? '已标记解决' : r.error || '操作失败', icon: 'none' })
    if (r.ok) load()
  }

  // 升级
  async function escalate(q: any) {
    const modal = await Taro.showModal({
      title: '升级问题',
      content: '将风险级别提升一级并重新进入待处理？',
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    const r = await pendingQuestionApi.escalate(q.id, '由管理端手动升级')
    Taro.showToast({ title: r.ok ? '已升级' : r.error || '升级失败', icon: 'none' })
    if (r.ok) load()
  }

  const st = (s?: string) => STATUS_META[s || 'pending'] || STATUS_META.pending

  if (!user || !canAccess) {
    return (
      <View className="page admin-question">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary q-back" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  return (
    <View className="page admin-question">
      <View className="page-header">
        <Text>提问复盘</Text>
      </View>
      <View className="section-title">
        <Text>待处理问题</Text>
        <Text className="section-sub">共 {list.length} 条</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton q-skeleton" />
      ) : list.length === 0 ? (
        <View className="ref-empty">暂无待处理问题</View>
      ) : (
        list.map((q, i) => {
          const [label, tag] = st(q.status)
          const canHandle = canManageAll || q.assigned_to === user.employeeId
          return (
            <View className="ref-card q-card" key={q.id || i}>
              <View className="q-head">
                <Text className={`ref-status ${tag}`}>{label}</Text>
                <Text className="q-level">{q.risk_level || 'L2'}</Text>
              </View>
              <Text className="q-question">{q.question}</Text>
              {q.ai_suggestion ? (
                <View className="q-suggestion">
                  <Text className="q-sug-label">AI 建议</Text>
                  <Text className="q-sug-text">{q.ai_suggestion}</Text>
                </View>
              ) : null}
              {q.reply ? <Text className="q-reply">处理：{q.reply}</Text> : null}
              <Text className="q-date">{fmtDate(q.created_at)}</Text>
              {!['resolved', 'escalated', 'review_pending'].includes(q.status) ? (
                <View className="q-actions">
                  {canManageAll ? (
                    <View className="ref-btn-sm ref-btn-sm-ghost" onClick={() => assign(q)}>指派</View>
                  ) : null}
                  {canHandle ? (
                    <>
                      <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => ack(q)}>确认</View>
                      <View className="ref-btn-sm ref-btn-sm-primary" onClick={() => resolve(q)}>解决</View>
                      <View className="ref-btn-sm ref-btn-sm-danger" onClick={() => escalate(q)}>升级</View>
                    </>
                  ) : <Text className="q-readonly">待负责人接收后处理</Text>}
                </View>
              ) : null}
            </View>
          )
        })
      )}
    </View>
  )
}
