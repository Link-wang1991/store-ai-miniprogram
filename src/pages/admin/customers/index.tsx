import { useEffect, useState } from 'react'
import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { customerApi, customerAdminApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { showEditableModal } from '@/utils/ui'
import './index.scss'

const STAGES = ['new', 'intent', 'deal', 'regular', 'churn_risk']
const STAGE_LABELS: Record<string, string> = {
  new: '新客户', intent: '意向', deal: '成交', regular: '老客', churn_risk: '流失风险',
}

export default function AdminCustomers() {
  const user = getUserInfo()
  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', gender: '', age: '', stage: 'new', tags: '', concerns: '' })

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
    const r = await customerApi.list()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', phone: '', gender: '', age: '', stage: 'new', tags: '', concerns: '' })
    setShowForm(true)
  }

  function openEdit(c: any) {
    setEditing(c)
    setForm({
      name: c.name || '',
      phone: c.phone || '',
      gender: c.gender || '',
      age: c.age ? String(c.age) : '',
      stage: c.stage || 'new',
      tags: c.tags || '',
      concerns: c.concerns || '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.name.trim()) {
      Taro.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }
    if (busy) return
    setBusy(true)
    const data: any = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      gender: form.gender || undefined,
      age: form.age ? Number(form.age) : undefined,
      stage: form.stage,
      tags: form.tags.trim() || undefined,
      concerns: form.concerns.trim() || undefined,
    }
    const r = editing
      ? await customerApi.update(editing.id, data)
      : await customerApi.create(data)
    setBusy(false)
    Taro.showToast({ title: r.ok ? (editing ? '已保存' : '已新增') : r.error || '操作失败', icon: 'none' })
    if (r.ok) {
      setShowForm(false)
      load()
    }
  }

  async function remove(c: any) {
    const modal = await Taro.showModal({
      title: '删除客户',
      content: `确定删除「${c.name}」？相关会谈/任务会保留，但客户档案将移除。`,
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    const r = await customerApi.delete(c.id)
    Taro.showToast({ title: r.ok ? '已删除' : r.error || '删除失败', icon: 'none' })
    if (r.ok) load()
  }

  async function downloadTemplate() {
    const r = await customerAdminApi.downloadTemplate()
    Taro.showToast({ title: r.ok ? '已打开客户导入模板' : r.error || '下载失败', icon: 'none' })
  }

  async function importCustomers() {
    const res = await Taro.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['doc', 'docx', 'xls', 'xlsx', 'csv'],
    })
    if (!res.tempFiles || !res.tempFiles.length) return
    Taro.showLoading({ title: '导入中…' })
    const r = await customerAdminApi.import(res.tempFiles[0].path)
    Taro.hideLoading()
    if (r.ok && r.data) {
      const d = r.data
      Taro.showModal({
        title: '导入完成',
        content: `共 ${d.total || 0} 条，成功 ${d.success || 0} 条${d.failed && d.failed.length ? `，失败 ${d.failed.length} 条` : ''}`,
        showCancel: false,
        confirmText: '知道了',
      })
      load()
    } else {
      Taro.showToast({ title: r.error || '导入失败', icon: 'none' })
    }
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-customers">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  const filtered = keyword
    ? list.filter((c) => (c.name || '').includes(keyword) || (c.phone || '').includes(keyword))
    : list

  return (
    <View className="page admin-customers">
      <View className="page-header">
        <Text className="page-back" onClick={() => Taro.navigateBack()}>‹ 返回</Text>
        <Text className="page-title">客户管理</Text>
        <View className="page-add" onClick={openCreate}>+ 新增</View>
      </View>

      <View className="ref-search search-box">
        <Input
          className="ref-search-input"
          placeholder="搜索姓名/手机号"
          placeholderClass="ref-field-placeholder"
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
        />
      </View>

      <View className="tool-row">
        <View className="ref-btn-sm ref-btn-sm-ghost" onClick={downloadTemplate}>下载模板</View>
        <View className="ref-btn-sm ref-btn-sm-ghost" onClick={importCustomers}>导入客户</View>
        <View className="ref-btn-sm ref-btn-sm-plain" onClick={load}>刷新</View>
      </View>

      {showForm ? (
        <View className="ref-card form-card">
          <Text className="form-title">{editing ? '编辑客户' : '新增客户'}</Text>
          <Input className="ref-field form-field" placeholder="姓名 *" placeholderClass="ref-field-placeholder" value={form.name} onInput={(e) => setForm({ ...form, name: e.detail.value })} />
          <Input className="ref-field form-field" type="number" maxlength={11} placeholder="手机号" placeholderClass="ref-field-placeholder" value={form.phone} onInput={(e) => setForm({ ...form, phone: e.detail.value })} />
          <Input className="ref-field form-field" placeholder="性别（男/女）" placeholderClass="ref-field-placeholder" value={form.gender} onInput={(e) => setForm({ ...form, gender: e.detail.value })} />
          <Input className="ref-field form-field" type="number" placeholder="年龄" placeholderClass="ref-field-placeholder" value={form.age} onInput={(e) => setForm({ ...form, age: e.detail.value })} />
          <Picker mode="selector" range={STAGES.map((s) => STAGE_LABELS[s])} value={STAGES.indexOf(form.stage)} onChange={(e) => setForm({ ...form, stage: STAGES[Number(e.detail.value)] })}>
            <View className="ref-field form-field stage-picker">阶段：{STAGE_LABELS[form.stage] || form.stage} ▾</View>
          </Picker>
          <Input className="ref-field form-field" placeholder="标签（逗号分隔）" placeholderClass="ref-field-placeholder" value={form.tags} onInput={(e) => setForm({ ...form, tags: e.detail.value })} />
          <Input className="ref-field form-field" placeholder="备注/顾虑" placeholderClass="ref-field-placeholder" value={form.concerns} onInput={(e) => setForm({ ...form, concerns: e.detail.value })} />
          <View className="form-actions">
            <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => setShowForm(false)}>取消</View>
            <View className={`ref-btn-sm ref-btn-sm-primary${busy ? ' disabled' : ''}`} onClick={save}>{busy ? '保存中…' : '保存'}</View>
          </View>
        </View>
      ) : null}

      <View className="section-title">
        <Text>客户列表</Text>
        <Text className="section-sub">共 {filtered.length} 人</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton cu-skeleton" />
      ) : filtered.length === 0 ? (
        <View className="ref-empty">暂无客户</View>
      ) : (
        filtered.map((c, i) => (
          <View className="ref-card cu-card" key={c.id || i}>
            <View className="cu-head">
              <View className="cu-avatar"><Text>{c.name?.[0] || '客'}</Text></View>
              <View className="cu-main">
                <View className="cu-name-row">
                  <Text className="cu-name">{c.name}</Text>
                  <Text className={`ref-status ${c.stage === 'churn_risk' ? 'ref-status-red' : c.stage === 'deal' ? 'ref-status-green' : 'ref-status-blue'}`}>
                    {STAGE_LABELS[c.stage] || c.stage}
                  </Text>
                </View>
                <Text className="cu-meta">{c.phone || '无手机号'} · {c.gender || '—'}{c.age ? ` · ${c.age}岁` : ''}</Text>
                {c.tags ? <Text className="cu-tags">{c.tags}</Text> : null}
              </View>
            </View>
            <View className="cu-actions">
              <View className="ref-btn-sm ref-btn-sm-ghost" onClick={() => openEdit(c)}>编辑</View>
              <View className="ref-btn-sm ref-btn-sm-danger" onClick={() => remove(c)}>删除</View>
            </View>
          </View>
        ))
      )}
    </View>
  )
}
