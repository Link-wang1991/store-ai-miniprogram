import { useEffect, useState } from 'react'
import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { employeeAdminApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { showEditableModal } from '@/utils/ui'
import './index.scss'

const ROLE_OPTIONS = ['manager', 'consultant', 'beautician', 'receptionist', 'operator']
const ROLE_LABELS: Record<string, string> = {
  owner: '老板',
  admin: '管理员',
  manager: '店长',
  consultant: '咨询师',
  beautician: '美容师',
  receptionist: '前台',
  operator: '运营',
}

const STATUS_META: Record<string, [string, string]> = {
  active: ['在职', 'ref-status-green'],
  inactive: ['停用', 'ref-status-gray'],
}

export default function AdminStaff() {
  const user = getUserInfo()
  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'consultant' })

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
    const r = await employeeAdminApi.all()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      Taro.showToast({ title: '姓名、邮箱、初始密码必填', icon: 'none' })
      return
    }
    if (form.password.length < 6) {
      Taro.showToast({ title: '初始密码至少 6 位', icon: 'none' })
      return
    }
    if (busy) return
    setBusy(true)
    const r = await employeeAdminApi.create({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password.trim(),
      phone: form.phone.trim() || undefined,
      role: form.role,
    })
    setBusy(false)
    Taro.showToast({ title: r.ok ? '已新增员工' : r.error || '操作失败', icon: 'none' })
    if (r.ok) {
      setShowForm(false)
      setForm({ name: '', email: '', password: '', phone: '', role: 'consultant' })
      load()
    }
  }

  async function deactivate(e: any) {
    const modal = await Taro.showModal({
      title: '停用员工',
      content: `确定停用「${e.name}」？停用后该账号无法登录。`,
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    const r = await employeeAdminApi.deactivate(e.employee_id)
    Taro.showToast({ title: r.ok ? '已停用' : r.error || '操作失败', icon: 'none' })
    if (r.ok) load()
  }

  async function downloadTemplate() {
    const r = await employeeAdminApi.downloadTemplate()
    Taro.showToast({ title: r.ok ? '已打开员工导入模板' : r.error || '下载失败', icon: 'none' })
  }

  async function importEmployees() {
    const res = await Taro.chooseMessageFile({ count: 1, type: 'file' })
    if (!res.tempFiles || !res.tempFiles.length) return
    Taro.showLoading({ title: '导入中…' })
    const r = await employeeAdminApi.import(res.tempFiles[0].path)
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

  // 修改员工岗位/停用后的重启用（简化：仅展示，不改字段）
  async function changeRole(e: any) {
    const sel = await Taro.showActionSheet({
      itemList: ROLE_OPTIONS.map((r) => ROLE_LABELS[r]),
      itemColor: '#008448',
    })
    if (sel.errMsg && !sel.errMsg.includes('ok')) return
    const role = ROLE_OPTIONS[sel.tapIndex]
    if (!role) return
    const modal = await Taro.showModal({
      title: '调整岗位',
      content: `将「${e.name}」调整为「${ROLE_LABELS[role]}」？（当前后端未提供岗位变更接口，仅提示）`,
      showCancel: false,
      confirmText: '知道了',
    })
    if (modal.confirm) load()
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-staff">
        <View className="ref-empty">无权限访问员工管理</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  return (
    <View className="page admin-staff">
      <View className="page-header">
        <Text className="page-back" onClick={() => Taro.navigateBack()}>‹ 返回</Text>
        <Text className="page-title">员工管理</Text>
        <View className="page-add" onClick={() => setShowForm(true)}>+ 新增</View>
      </View>

      <View className="tool-row">
        <View className="ref-btn-sm ref-btn-sm-ghost" onClick={downloadTemplate}>下载模板</View>
        <View className="ref-btn-sm ref-btn-sm-ghost" onClick={importEmployees}>导入员工</View>
        <View className="ref-btn-sm ref-btn-sm-plain" onClick={load}>刷新</View>
      </View>

      {showForm ? (
        <View className="ref-card form-card">
          <Text className="form-title">新增员工</Text>
          <Input className="ref-field form-field" placeholder="姓名 *" placeholderClass="ref-field-placeholder" value={form.name} onInput={(e) => setForm({ ...form, name: e.detail.value })} />
          <Input className="ref-field form-field" placeholder="登录邮箱 *" placeholderClass="ref-field-placeholder" value={form.email} onInput={(e) => setForm({ ...form, email: e.detail.value })} />
          <Input className="ref-field form-field" placeholder="初始密码（≥6位）*" password placeholderClass="ref-field-placeholder" value={form.password} onInput={(e) => setForm({ ...form, password: e.detail.value })} />
          <Input className="ref-field form-field" type="number" maxlength={11} placeholder="手机号" placeholderClass="ref-field-placeholder" value={form.phone} onInput={(e) => setForm({ ...form, phone: e.detail.value })} />
          <Picker mode="selector" range={ROLE_OPTIONS.map((r) => ROLE_LABELS[r])} value={ROLE_OPTIONS.indexOf(form.role)} onChange={(e) => setForm({ ...form, role: ROLE_OPTIONS[Number(e.detail.value)] })}>
            <View className="ref-field form-field stage-picker">岗位：{ROLE_LABELS[form.role]} ▾</View>
          </Picker>
          <View className="form-actions">
            <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => setShowForm(false)}>取消</View>
            <View className={`ref-btn-sm ref-btn-sm-primary${busy ? ' disabled' : ''}`} onClick={save}>{busy ? '保存中…' : '保存'}</View>
          </View>
        </View>
      ) : null}

      <View className="section-title">
        <Text>门店员工</Text>
        <Text className="section-sub">共 {list.length} 人</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton staff-skeleton" />
      ) : list.length === 0 ? (
        <View className="ref-empty">暂无员工，请先新增或导入</View>
      ) : (
        list.map((e, i) => {
          const [label, tag] = STATUS_META[e.status] || ['—', 'ref-status-gray']
          const isSelf = e.employee_id === user.employeeId
          return (
            <View className="ref-card staff-card" key={e.employee_id || i}>
              <View className="staff-head">
                <View className="staff-avatar"><Text>{e.name?.[0] || '员'}</Text></View>
                <View className="staff-main">
                  <View className="staff-name-row">
                    <Text className="staff-name">{e.name}</Text>
                    {isSelf ? <Text className="staff-self">我</Text> : null}
                    <Text className="staff-role">{ROLE_LABELS[e.role] || e.role}</Text>
                  </View>
                  <Text className="staff-email">{e.email || '无登录账号'}</Text>
                </View>
                <Text className={`ref-status ${tag}`}>{label}</Text>
              </View>
              <View className="staff-actions">
                <View className="ref-btn-sm ref-btn-sm-ghost" onClick={() => changeRole(e)}>岗位</View>
                {e.status === 'active' && e.role !== 'owner' && !isSelf ? (
                  <View className="ref-btn-sm ref-btn-sm-danger" onClick={() => deactivate(e)}>停用</View>
                ) : null}
              </View>
            </View>
          )
        })
      )}
    </View>
  )
}
