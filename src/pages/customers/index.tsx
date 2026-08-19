import { useEffect, useMemo, useState } from 'react'
import { View, Text, Input, ScrollView, Picker } from '@tarojs/components'
import Taro, { usePullDownRefresh, useDidShow } from '@tarojs/taro'
import { customerApi } from '@/utils/api'
import { isLoggedIn } from '@/utils/auth'
import { fmtDate, ageFromBirthday, birthdayFromAge } from '@/utils/format'
import { consumeCustomerPool, openCoach } from '@/utils/navigation'
import { setActiveTab } from '@/utils/ui'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import './index.scss'

const POOLS = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今日到店' },
  { key: 'new', label: '新客' },
  { key: 'new_deal', label: '新成交' },
  { key: 'returning', label: '老客' },
  { key: 'dormant', label: '沉睡' },
  { key: 'risk', label: '风险' },
]
const POOL_TAG: Record<string, string> = {
  today: 'ref-status-green',
  new_deal: 'ref-status-green',
  new: 'ref-status-blue',
  returning: 'ref-status-gray',
  dormant: 'ref-status-yellow',
  risk: 'ref-status-red',
}
const POOL_LABEL: Record<string, string> = {
  today: '今日到店',
  new_deal: '新成交',
  new: '新客',
  returning: '老客',
  regular: '老客',
  dormant: '沉睡',
  risk: '风险',
}
// 无中文映射的 pool 值一律不显示标签，避免出现 new/regular 等英文残渣
function poolLabel(pool?: string) {
  if (!pool) return ''
  return POOL_LABEL[pool] || ''
}
function poolTag(pool?: string) {
  return POOL_TAG[pool || ''] || 'ref-status-gray'
}

const STAGES = [
  { key: 'new', label: '新客' },
  { key: 'intent', label: '意向' },
  { key: 'deal', label: '已成交' },
  { key: 'regular', label: '老客' },
  { key: 'churn_risk', label: '流失风险' },
]
const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]))
const GENDERS = ['女', '男']

function avatarText(name?: string) {
  return (name || '客')[0]
}
function tail(phone?: string) {
  return phone && phone.length >= 4 ? phone.slice(-4) : '····'
}

export default function Customers() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [pool, setPool] = useState('all')
  const [q, setQ] = useState('')
  // 内联编辑面板：editingId 非空时展开对应客户卡片
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', gender: '', age: '', birthday: '', stage: '' })
  const [saving, setSaving] = useState(false)

  useDidShow(() => {
    setActiveTab(1)
    const nextPool = consumeCustomerPool()
    if (nextPool) setPool(nextPool)
    if (isLoggedIn()) load()
  })

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
  }, [])

  usePullDownRefresh(() => {
    load()
  })

  async function load() {
    const r = await customerApi.list()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: list.length }
    list.forEach((c: any) => {
      const k = c.pool || 'returning'
      m[k] = (m[k] || 0) + 1
    })
    return m
  }, [list])

  const filtered = useMemo(() => {
    let arr = list
    if (pool !== 'all') arr = arr.filter((c: any) => (c.pool || 'returning') === pool)
    if (q.trim()) {
      const k = q.trim().toLowerCase()
      arr = arr.filter((c: any) =>
        [c.name, c.phone, c.concerns, c.needs].some((v) => v && String(v).toLowerCase().includes(k))
      )
    }
    return arr
  }, [list, pool, q])

  // 临时客户：暂无有效手机号（录音临时创建的占位档案）。成为真实客户需补全有效手机号。
  function isPlaceholder(c: any) {
    return !c.phone || !/^1\d{10}$/.test(String(c.phone))
  }

  // 场景1：把当前客户（source）绑定合并到已有的正式客户（target）
  async function bindCustomer(c: any) {
    const r = await customerApi.list()
    if (!r.ok) {
      Taro.showToast({ title: r.error || '加载客户失败', icon: 'none' })
      return
    }
    const all = r.data || []
    // 排除当前客户自身，仅可选"完整"客户作为绑定目标
    const targets = all.filter((x: any) => x.id !== c.id && x.phone)
    if (targets.length === 0) {
      Taro.showToast({ title: '暂无可绑定的正式客户', icon: 'none' })
      return
    }
    const options = targets.map((x: any) => `${x.name}${x.phone ? `（尾号${String(x.phone).slice(-4)}）` : ''}`)
    const sel = await Taro.showActionSheet({ itemList: options.slice(0, 6), itemColor: '#008448' })
    if (sel.errMsg && !sel.errMsg.includes('ok')) return
    const target = targets[sel.tapIndex]
    if (!target) return
    Taro.showLoading({ title: '绑定中…' })
    const mr = await customerApi.merge(target.id, c.id)
    Taro.hideLoading()
    if (mr.ok) {
      Taro.showToast({ title: `已绑定到「${target.name}」`, icon: 'none' })
      load()
    } else {
      Taro.showToast({ title: mr.error || '绑定失败', icon: 'none' })
    }
  }

  // 场景2：编辑客户 —— 打开内联编辑面板
  function editCustomer(c: any) {
    if (editingId === c.id) {
      setEditingId('')
      return
    }
    setForm({
      name: c.name || '',
      phone: c.phone || '',
      gender: c.gender === 'female' ? '女' : c.gender === 'male' ? '男' : '',
      age: c.age ? String(c.age) : '',
      birthday: c.birthday ? String(c.birthday).slice(0, 10) : '',
      stage: c.stage || '',
    })
    setEditingId(c.id)
  }

  // 保存编辑
  async function saveEdit(c: any) {
    const name = form.name.trim()
    if (!name) {
      Taro.showToast({ title: '姓名不能为空', icon: 'none' })
      return
    }
    if (form.phone && !/^1\d{10}$/.test(form.phone)) {
      Taro.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    setSaving(true)
    const payload: any = {
      name,
      phone: form.phone || null,
      gender: form.gender === '男' ? 'male' : form.gender === '女' ? 'female' : null,
      age: form.age ? Number(form.age) : null,
      birthday: form.birthday || null,
      stage: form.stage || null,
    }
    const ur = await customerApi.update(c.id, payload)
    setSaving(false)
    if (ur.ok) {
      Taro.showToast({ title: '已保存', icon: 'none' })
      setEditingId('')
      load()
    } else {
      Taro.showToast({ title: ur.error || '保存失败', icon: 'none' })
    }
  }

  // 场景3：删除无意义的客户
  async function deleteCustomer(c: any) {
    const modal = await Taro.showModal({
      title: '删除客户',
      content: `确定删除「${c.name || '该客户'}」吗？该客户的会谈记录将一并清除，此操作不可恢复。`,
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    Taro.showLoading({ title: '删除中…' })
    const dr = await customerApi.delete(c.id)
    Taro.hideLoading()
    if (dr.ok) {
      Taro.showToast({ title: '已删除', icon: 'none' })
      load()
    } else {
      Taro.showToast({ title: dr.error || '删除失败', icon: 'none' })
    }
  }

  return (
    <View className="page customers-page">
      <View className="cust-header">
        <Text className="cust-title">{pool === 'all' ? '今天该跟谁' : POOLS.find((p) => p.key === pool)?.label || '客户'}</Text>
        <Text className="cust-sub">按客户价值与跟进节奏，AI 已为你排好优先级</Text>
      </View>

      <View className="ref-search cust-search">
        <View className="ref-search-icon">
          <Icon svg={ICN.search('#9aa2ad')} size={32} />
        </View>
        <Input
          className="ref-search-input"
          placeholder="姓名、电话或当前需求"
          placeholderClass="ref-field-placeholder"
          value={q}
          onInput={(e) => setQ(e.detail.value)}
        />
      </View>

      <ScrollView scrollX className="pool-scroll" showScrollbar={false}>
        <View className="pool-tabs">
          {POOLS.map((p) => (
            <View
              key={p.key}
              className={`pool-tab${pool === p.key ? ' active' : ''}`}
              onClick={() => setPool(p.key)}
            >
              {p.label}
              <Text className="pool-count">{counts[p.key] || 0}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <View className="ref-skeleton cust-skeleton" />
      ) : filtered.length === 0 ? (
        <View className="ref-empty">暂无客户</View>
      ) : (
        filtered.map((c, i) => (
          <View className="ref-card cust-card" key={c.id || i}>
            <View className="cust-top">
              <View className="cust-avatar">{avatarText(c.name)}</View>
              <View className="cust-main">
                <View className="cust-name-row">
                  <Text className="cust-name">{c.name || '客户'}</Text>
                  {poolLabel(c.pool) ? (
                    <Text className={`ref-status ${poolTag(c.pool)}`}>{poolLabel(c.pool)}</Text>
                  ) : null}
                </View>
                <Text className="cust-meta">
                  尾号 {tail(c.phone)} · {STAGE_LABEL[c.stage] || '跟进中'}
                </Text>
              </View>
              <Text
                className="ai-link"
                onClick={() => Taro.navigateTo({ url: `/pages/customer-detail/index?id=${c.id || ''}` })}
              >
                AI 画像
              </Text>
            </View>

            {c.ai_insight ? (
              <View className="insight-box">
                <Text className="insight-text">{c.ai_insight}</Text>
              </View>
            ) : null}

            {c.last_visit_at || c.next_follow_at ? (
              <View className="cust-foot">
                {c.next_follow_at ? (
                  <Text className="foot-k foot-k-follow">待跟进 {fmtDate(c.next_follow_at)}</Text>
                ) : (
                  <Text className="foot-k">暂无待跟进</Text>
                )}
                {c.last_visit_at ? <Text className="foot-k">最近到店 {fmtDate(c.last_visit_at)}</Text> : null}
              </View>
            ) : null}

            {/* 客户操作：问AI教练 + 管理（绑定/编辑/删除） */}
            <View className="cust-actions">
              <Text
                className={`ask-link${isPlaceholder(c) ? ' disabled' : ''}`}
                onClick={() => {
                  if (isPlaceholder(c)) {
                    Taro.showModal({
                      title: '请先完善客户信息',
                      content: '当前是临时客户，请先「编辑」补全姓名/手机号，或「绑定客户」关联到已有正式客户，之后才能向 AI 教练提问。',
                      showCancel: false,
                      confirmText: '知道了',
                      confirmColor: '#008448',
                    })
                    return
                  }
                  openCoach({
                    customerId: c.id || '',
                    customerName: c.name || '客户',
                  })
                }}
              >
                问 AI 教练 →
              </Text>
              <View className="cust-manage">
                {isPlaceholder(c) ? (
                  <Text className="cust-op" onClick={() => bindCustomer(c)}>
                    绑定客户
                  </Text>
                ) : null}
                <Text className="cust-op" onClick={() => editCustomer(c)}>
                  编辑
                </Text>
                <Text className="cust-op cust-op-danger" onClick={() => deleteCustomer(c)}>
                  删除
                </Text>
              </View>
            </View>

            {/* 内联编辑面板 */}
            {editingId === c.id ? (
              <View className="cust-edit">
                <Text className="ce-title">编辑客户资料</Text>
                <View className="ce-field">
                  <Text className="ce-k">姓名</Text>
                  <Input
                    className="ce-input"
                    value={form.name}
                    onInput={(e) => setForm({ ...form, name: e.detail.value })}
                    placeholder="客户姓名"
                    placeholderClass="ref-field-placeholder"
                    maxlength={20}
                  />
                </View>
                <View className="ce-field">
                  <Text className="ce-k">手机号</Text>
                  <Input
                    className="ce-input"
                    value={form.phone}
                    onInput={(e) => setForm({ ...form, phone: e.detail.value })}
                    placeholder="11 位手机号"
                    placeholderClass="ref-field-placeholder"
                    type="number"
                    maxlength={11}
                  />
                </View>
                <View className="ce-field">
                  <Text className="ce-k">性别</Text>
                  <Picker
                    mode="selector"
                    range={GENDERS}
                    value={GENDERS.indexOf(form.gender) < 0 ? -1 : GENDERS.indexOf(form.gender)}
                    onChange={(e) => setForm({ ...form, gender: GENDERS[Number(e.detail.value)] || '' })}
                  >
                    <View className="ce-input ce-picker">{form.gender || '选择性别'}</View>
                  </Picker>
                </View>
                <View className="ce-field">
                  <Text className="ce-k">生日</Text>
                  <Picker
                    mode="date"
                    start="1900-01-01"
                    end={new Date().toISOString().slice(0, 10)}
                    value={form.birthday || '2000-01-01'}
                    onChange={(e) => {
                      const bd = e.detail.value
                      setForm((f) => ({ ...f, birthday: bd, age: ageFromBirthday(bd) || f.age }))
                    }}
                  >
                    <View className="ce-input ce-picker">{form.birthday || '选择生日'}</View>
                  </Picker>
                </View>
                <View className="ce-field">
                  <Text className="ce-k">年龄</Text>
                  <Input
                    className="ce-input"
                    value={form.age}
                    onInput={(e) => setForm({ ...form, age: e.detail.value.replace(/\D/g, '') })}
                    onBlur={() => {
                      // 输入年龄后自动补生日（仅定年份，月日取 1 月 1 日，可再细化）
                      if (form.age && !form.birthday) {
                        setForm((f) => ({ ...f, birthday: birthdayFromAge(f.age) }))
                      }
                    }}
                    placeholder="如 35"
                    placeholderClass="ref-field-placeholder"
                    type="number"
                    maxlength={3}
                  />
                </View>
                <View className="ce-field">
                  <Text className="ce-k">客户阶段</Text>
                  <Picker
                    mode="selector"
                    range={STAGES.map((s) => s.label)}
                    value={STAGES.findIndex((s) => s.key === form.stage)}
                    onChange={(e) => setForm({ ...form, stage: STAGES[Number(e.detail.value)]?.key || '' })}
                  >
                    <View className="ce-input ce-picker">
                      {STAGE_LABEL[form.stage] || '选择客户阶段'}
                    </View>
                  </Picker>
                </View>
                <View className="ce-actions">
                  <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => setEditingId('')}>
                    取消
                  </View>
                  <View className={`ref-btn-sm ref-btn-sm-primary${saving ? ' disabled' : ''}`} onClick={() => saveEdit(c)}>
                    {saving ? '保存中…' : '保存'}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  )
}
