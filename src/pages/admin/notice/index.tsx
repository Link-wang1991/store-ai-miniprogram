import { useEffect, useState } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { announcementApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import './index.scss'

export default function AdminNotice() {
  const user = getUserInfo()
  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [form, setForm] = useState({ title: '', content: '' })
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
    const r = await announcementApi.list()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  async function create() {
    if (!form.title.trim() || !form.content.trim()) {
      Taro.showToast({ title: '标题和内容不能为空', icon: 'none' })
      return
    }
    if (busy) return
    setBusy(true)
    const r = await announcementApi.create({
      title: form.title.trim(),
      content: form.content.trim(),
      type: 'notice',
      priority: 'normal',
    })
    setBusy(false)
    Taro.showToast({ title: r.ok ? '已发布通知' : r.error || '发布失败', icon: 'none' })
    if (r.ok) {
      setForm({ title: '', content: '' })
      load()
    }
  }

  async function deactivate(a: any) {
    const modal = await Taro.showModal({
      title: '下架通知',
      content: `确定下架「${a.title}」？员工将不再看到。`,
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    const r = await announcementApi.deactivate(a.id)
    Taro.showToast({ title: r.ok ? '已下架' : r.error || '操作失败', icon: 'none' })
    if (r.ok) load()
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-notice">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  return (
    <View className="page admin-notice">
      <View className="page-header">
        <Text>通知管理</Text>
      </View>

      <View className="ref-card form-card">
        <Input
          className="ref-field form-field"
          placeholder="通知标题"
          placeholderClass="ref-field-placeholder"
          value={form.title}
          onInput={(e) => setForm({ ...form, title: e.detail.value })}
        />
        <Textarea
          className="ref-textarea"
          placeholder="通知内容"
          placeholderClass="ref-field-placeholder"
          value={form.content}
          onInput={(e) => setForm({ ...form, content: e.detail.value })}
        />
        <View className={`ref-primary submit-btn${busy ? ' disabled' : ''}`} onClick={create}>
          {busy ? '发布中…' : '发布通知'}
        </View>
      </View>

      <View className="section-title">
        <Text>已发布通知</Text>
        <Text className="section-sub">共 {list.length} 条</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton nt-skeleton" />
      ) : list.length === 0 ? (
        <View className="ref-empty">暂无通知</View>
      ) : (
        list.map((a, i) => (
          <View className="ref-card nt-card" key={a.id || i}>
            <View className="nt-head">
              <Text className="nt-title">{a.title}</Text>
              <Text className="nt-date">{fmtDate(a.created_at)}</Text>
            </View>
            <Text className="nt-content">{a.content}</Text>
            <View className="nt-actions">
              <View className="ref-btn-sm ref-btn-sm-danger" onClick={() => deactivate(a)}>下架</View>
            </View>
          </View>
        ))
      )}
    </View>
  )
}
