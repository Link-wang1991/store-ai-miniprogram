import { useEffect, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { superAdminApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import './index.scss'

export default function Platform() {
  const user = getUserInfo()
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', ownerName: '', ownerPhone: '', ownerPassword: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (user?.role === 'super_admin') load()
    else setLoading(false)
  }, [])

  async function load() {
    const r = await superAdminApi.stores()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
  }

  async function createStore() {
    if (!form.name || !form.ownerName || !form.ownerPhone || !form.ownerPassword) {
      Taro.showToast({ title: '请完整填写门店信息', icon: 'none' })
      return
    }
    if (form.ownerPassword.length < 6) {
      Taro.showToast({ title: '密码至少 6 位', icon: 'none' })
      return
    }
    setSubmitting(true)
    const r = await superAdminApi.createStore(form)
    setSubmitting(false)
    Taro.showToast({ title: r.ok ? '创建成功，已初始化场景与知识库' : r.error || '创建失败', icon: 'none' })
    if (r.ok) {
      setForm({ name: '', ownerName: '', ownerPhone: '', ownerPassword: '' })
      load()
    }
  }

  async function initStore(s: any) {
    const modal = await Taro.showModal({
      title: '初始化资料',
      content: `为「${s.name || '该门店'}」初始化场景与知识库？`,
      confirmColor: '#008448',
    })
    if (!modal.confirm) return
    const r = await superAdminApi.initStore(s.id)
    Taro.showToast({ title: r.ok ? '初始化成功' : r.error || '初始化失败', icon: 'none' })
    if (r.ok) load()
  }

  if (!user || user.role !== 'super_admin') {
    return (
      <View className="page platform-page">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary back-btn" onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>
          返回首页
        </View>
      </View>
    )
  }

  return (
    <View className="page platform-page">
      <View className="section-title">
        <Text>录入新门店</Text>
      </View>
      <View className="ref-card form-card">
        <Input
          className="ref-field form-field"
          placeholder="门店名称"
          placeholderClass="ref-field-placeholder"
          value={form.name}
          onInput={(e) => setForm({ ...form, name: e.detail.value })}
        />
        <Input
          className="ref-field form-field"
          placeholder="负责人姓名"
          placeholderClass="ref-field-placeholder"
          value={form.ownerName}
          onInput={(e) => setForm({ ...form, ownerName: e.detail.value })}
        />
        <Input
          className="ref-field form-field"
          type="number"
          maxlength={11}
          placeholder="负责人手机号"
          placeholderClass="ref-field-placeholder"
          value={form.ownerPhone}
          onInput={(e) => setForm({ ...form, ownerPhone: e.detail.value })}
        />
        <Input
          className="ref-field form-field"
          password
          placeholder="初始密码（≥6 位）"
          placeholderClass="ref-field-placeholder"
          value={form.ownerPassword}
          onInput={(e) => setForm({ ...form, ownerPassword: e.detail.value })}
        />
        <View
          className={`ref-primary submit-btn${submitting ? ' disabled' : ''}`}
          onClick={createStore}
        >
          {submitting ? '创建中…' : '创建门店并录入负责人'}
        </View>
      </View>

      <View className="section-title">
        <Text>门店列表</Text>
        <Text className="section-sub">共 {list.length} 家</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton plat-skeleton" />
      ) : list.length === 0 ? (
        <View className="ref-empty">暂无门店</View>
      ) : (
        list.map((s, i) => (
          <View className="ref-card store-card" key={s.id || i}>
            <View className="store-top">
              <Text className="store-name">{s.name || '未命名门店'}</Text>
              <Text className="store-date">创建于 {s.created_at || '—'}</Text>
            </View>
            <View className="store-stats">
              <View className="store-stat">
                <Text className="stat-num">{s.staff_count || s.employee_count || 0}</Text>
                <Text className="stat-k">员工</Text>
              </View>
              <View className="store-stat">
                <Text className="stat-num">{s.customer_count || 0}</Text>
                <Text className="stat-k">客户</Text>
              </View>
              <View className="store-stat">
                <Text className="stat-num">{s.meeting_count || 0}</Text>
                <Text className="stat-k">会谈</Text>
              </View>
            </View>
            <View className="ref-btn-sm ref-btn-sm-ghost init-btn" onClick={() => initStore(s)}>
              初始化资料
            </View>
          </View>
        ))
      )}
    </View>
  )
}
