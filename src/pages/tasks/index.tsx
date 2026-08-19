import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh, useRouter } from '@tarojs/taro'
import { taskApi } from '@/utils/api'
import { isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import { showEditableModal } from '@/utils/ui'
import './index.scss'

const FILTERS = [
  { key: '', label: '全部' },
  { key: 'due_today', label: '今日到期' },
  { key: 'pending', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'risk', label: '风险' },
]
const STATUS_MAP: Record<string, [string, string]> = {
  todo: ['待处理', 'ref-status-gray'],
  pending: ['待处理', 'ref-status-gray'],
  doing: ['执行中', 'ref-status-blue'],
  completed: ['已完成', 'ref-status-green'],
  done: ['已完成', 'ref-status-green'],
  canceled: ['已取消', 'ref-status-gray'],
}
function stOf(s?: string) {
  return STATUS_MAP[s || 'todo'] || ['待处理', 'ref-status-gray']
}

export default function Tasks() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [filter, setFilter] = useState(router.params.filter || '')
  // 证据附件
  const [activeAttach, setActiveAttach] = useState('') // 当前展开附件的任务 id
  const [attachList, setAttachList] = useState<any[]>([])
  const [attachBusy, setAttachBusy] = useState(false)

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

  // 前端筛选 key → 后端 status 映射（后端状态：todo/doing/done/canceled）
  const statusKey = (key: string) =>
    key === 'pending' ? 'todo' : key === 'completed' ? 'done' : key

  async function load() {
    setLoading(true)
    const apiStatus = ['pending', 'doing', 'completed'].includes(filter) ? statusKey(filter) : undefined
    const r = await taskApi.list(apiStatus)
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  // 任务完成结果反馈（对齐后端 outcome 枚举，驱动下一步业务闭环）
  const OUTCOMES: [string, string][] = [
    ['deal_closed', '已成交'],
    ['arrived', '已到店'],
    ['scheduled', '已预约'],
    ['accepted', '客户已接受'],
    ['concern', '仍有顾虑'],
    ['escalate', '需要升级店长'],
    ['wrong_info', '信息有误'],
    ['no_show', '未到店'],
    ['not_interested', '暂不考虑'],
    ['no_reply', '未回复'],
    ['risk_resolved', '风险已解决'],
  ]

  async function completeTask(t: any) {
    const sel = await Taro.showActionSheet({
      itemList: OUTCOMES.map(([, label]) => label),
      itemColor: '#008448',
    })
    if (sel.errMsg && !sel.errMsg.includes('ok')) return
    const outcome = OUTCOMES[sel.tapIndex]?.[0]
    if (!outcome) return
    // 填写备注（可选）
    let note = ''
    const noteRes = await showEditableModal({
      title: '执行结果反馈',
      placeholderText: '补充说明（可选）',
      confirmColor: '#008448',
    })
    if (noteRes.confirm) note = noteRes.content?.trim() || ''
    const r = await taskApi.complete(t.id, outcome, note)
    Taro.showToast({ title: r.ok ? '已提交执行结果' : r.error || '操作失败', icon: 'none' })
    if (r.ok) load()
  }

  // 关联客户跳转
  function goCustomer(t: any) {
    if (!t.customer_id) return
    Taro.navigateTo({ url: `/pages/customer-detail/index?id=${t.customer_id}` })
  }

  // 展开/收起任务附件
  async function toggleAttachments(t: any) {
    if (activeAttach === t.id) {
      setActiveAttach('')
      return
    }
    setActiveAttach(t.id)
    const r = await taskApi.listAttachments(t.id)
    setAttachList(r.ok ? (r.data || []) : [])
  }

  // 上传证据附件
  async function uploadAttachment(t: any) {
    if (attachBusy) return
    const res = await Taro.chooseMessageFile({
      count: 1,
      type: 'file',
    })
    if (!res.tempFiles || !res.tempFiles.length) return
    setAttachBusy(true)
    const r = await taskApi.uploadAttachment(t.id, res.tempFiles[0].path)
    setAttachBusy(false)
    Taro.showToast({ title: r.ok ? '已上传附件' : r.error || '上传失败', icon: 'none' })
    if (r.ok) {
      const l = await taskApi.listAttachments(t.id)
      setAttachList(l.ok ? (l.data || []) : [])
      load()
    }
  }

  // 删除附件
  async function removeAttachment(t: any, att: any) {
    const modal = await Taro.showModal({
      title: '删除附件',
      content: `确定删除「${att.original_name}」？`,
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    const r = await taskApi.deleteAttachment(t.id, att.id)
    Taro.showToast({ title: r.ok ? '已删除' : r.error || '删除失败', icon: 'none' })
    if (r.ok) {
      const l = await taskApi.listAttachments(t.id)
      setAttachList(l.ok ? (l.data || []) : [])
      load()
    }
  }

  function fmtSize(bytes?: number) {
    if (!bytes) return ''
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
    if (bytes > 1024) return `${Math.round(bytes / 1024)}KB`
    return `${bytes}B`
  }

  // 开始执行 / 取消任务（后端 updateStatus 支持 todo/doing/canceled）
  async function setStatus(t: any, status: 'doing' | 'canceled') {
    if (status === 'canceled') {
      const modal = await Taro.showModal({
        title: '取消任务',
        content: '确定取消该任务？',
        confirmColor: '#d94b3d',
      })
      if (!modal.confirm) return
    }
    const r = await taskApi.updateStatus(t.id, status)
    Taro.showToast({ title: r.ok ? (status === 'doing' ? '已开始执行' : '已取消') : r.error || '操作失败', icon: 'none' })
    if (r.ok) load()
  }

  // 任务延期：把截止时间改到新时间（默认当前截止 + 1 天）
  async function deferTask(t: any) {
    const parts = fmtDueParts(t.due_at)
    const res = await showEditableModal({
      title: '延期到（YYYY-MM-DD HH:mm）',
      content: parts,
      placeholderText: '如 2026-08-20 10:00',
      confirmColor: '#008448',
    })
    if (!res.confirm) return
    const raw = res.content?.trim()
    if (!raw) return
    let newDue = raw
    // 补全秒和时区，转成 ISO 供后端解析
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/)
    if (m) {
      const pad = (n: string) => n.padStart(2, '0')
      newDue = `${m[1]}T${pad(m[2])}:${m[3]}:00`
    }
    const r = await taskApi.defer(t.id, newDue)
    Taro.showToast({ title: r.ok ? '任务已延期' : r.error || '延期失败', icon: 'none' })
    if (r.ok) load()
  }

  // 任务转交：选择新负责人
  async function assignTask(t: any) {
    const a = await taskApi.assignees()
    const list = a.ok ? (a.data || []) : []
    if (list.length === 0) {
      Taro.showToast({ title: '暂无其他可指派员工', icon: 'none' })
      return
    }
    const sel = await Taro.showActionSheet({
      itemList: list.map((e: any) => `${e.name}${e.role ? `（${e.role}）` : ''}`),
      itemColor: '#008448',
    })
    if (sel.errMsg && !sel.errMsg.includes('ok')) return
    const target = list[sel.tapIndex]
    if (!target) return
    const modal = await Taro.showModal({
      title: '转交任务',
      content: `确定把任务转交给 ${target.name}？`,
      confirmColor: '#008448',
    })
    if (!modal.confirm) return
    const r = await taskApi.assign(t.id, target.id)
    Taro.showToast({ title: r.ok ? '任务已转交' : r.error || '转交失败', icon: 'none' })
    if (r.ok) load()
  }

  // 把 ISO 时间转成 YYYY-MM-DD HH:mm，供延期弹窗预填
  function fmtDueParts(iso?: string) {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  // "今日到期"口径：截止时间为今天（或已过期未完成）的任务，与首页"今日跟进"数字一致
  const todayDue = (t: any) => {
    if (!t.due_at) return false
    const d = new Date(t.due_at)
    return d.toDateString() === new Date().toDateString()
  }

  const visibleList =
    filter === 'risk'
      ? list.filter((t) => t.priority === 'urgent' || String(t.status || '').includes('risk'))
      : filter === 'due_today'
      ? list.filter((t) => todayDue(t))
      : list

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
      ) : visibleList.length === 0 ? (
        <View className="ref-empty">{filter === 'risk' ? '暂无风险任务' : '暂无任务'}</View>
      ) : (
        visibleList.map((t, i) => {
          const [label, tag] = stOf(t.status)
          return (
            <View className="ref-card task-row" key={t.id || i}>
              <View className="task-head">
                <Text className="task-title">{t.title || t.content}</Text>
                <Text className={`ref-status ${tag}`}>{label}</Text>
              </View>
              <View className="task-meta">
                {t.customer_id && t.customer_name ? (
                  <Text className="task-cust" onClick={() => goCustomer(t)}>{t.customer_name} ›</Text>
                ) : (
                  <Text>{t.customer_name || '门店'}</Text>
                )}
                <Text> · {t.source || 'AI 生成'} · 截止 {t.due_at ? fmtDate(t.due_at) : '—'}</Text>
              </View>
              {t.status === 'done' && t.business_outcome_status === 'pending_verification' ? (
                <Text className="task-verify">结果待验证</Text>
              ) : null}
              {/* 证据附件 */}
              <View className="attach-row" onClick={() => toggleAttachments(t)}>
                <Text className={`attach-link${activeAttach === t.id ? ' attach-open' : ''}`}>
                  {t.has_attachments ? '📎 证据附件（点击查看）' : '📎 添加证据附件'}
                </Text>
              </View>
              {activeAttach === t.id ? (
                <View className="attach-panel">
                  {attachList.length === 0 ? (
                    <Text className="attach-empty">暂无附件</Text>
                  ) : (
                    attachList.map((att) => (
                      <View className="attach-item" key={att.id}>
                        <Text className="attach-name">{att.original_name}</Text>
                        <Text className="attach-size">{fmtSize(att.size_bytes)}</Text>
                        <Text className="attach-del" onClick={() => removeAttachment(t, att)}>删除</Text>
                      </View>
                    ))
                  )}
                  <View className="attach-upload" onClick={() => uploadAttachment(t)}>
                    {attachBusy ? '上传中…' : '+ 上传附件'}
                  </View>
                </View>
              ) : null}
              {t.insight ? (
                <View className="insight-box">
                  <Text className="insight-text">{t.insight}</Text>
                </View>
              ) : null}
              {t.status === 'doing' ? (
                <>
                  <View className="task-actions">
                    <View className="ref-btn-sm ref-btn-sm-primary" onClick={() => completeTask(t)}>
                      提交结果
                    </View>
                    <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => deferTask(t)}>
                      延期
                    </View>
                    <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => assignTask(t)}>
                      转交
                    </View>
                    <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => setStatus(t, 'canceled')}>
                      取消
                    </View>
                  </View>
                </>
              ) : t.status === 'todo' || t.status === 'pending' ? (
                <>
                  <View className="task-actions">
                    <View className="ref-btn-sm ref-btn-sm-primary" onClick={() => setStatus(t, 'doing')}>
                      开始执行
                    </View>
                    <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => deferTask(t)}>
                      延期
                    </View>
                    <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => assignTask(t)}>
                      转交
                    </View>
                  </View>
                  <View className="task-actions">
                    <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => completeTask(t)}>
                      直接提交结果
                    </View>
                  </View>
                </>
              ) : t.status === 'canceled' ? (
                <Text className="task-feedback">已取消</Text>
              ) : t.feedback ? (
                <Text className="task-feedback">结果：{t.feedback}</Text>
              ) : null}
            </View>
          )
        })
      )}
    </View>
  )
}
