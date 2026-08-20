import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { experienceAdminApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import { showEditableModal } from '@/utils/ui'
import './index.scss'

export default function AdminExperience() {
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
    const r = await experienceAdminApi.listPending()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  // 审核通过：编辑标题/分类/内容后发布为正式知识
  async function approve(item: any) {
    if (busy) return
    const title = await showEditableModal({ title: '发布标题', content: item.title || '', confirmColor: '#008448' })
    if (!title.confirm) return
    const category = await showEditableModal({ title: '分类', content: '会谈沉淀', confirmColor: '#008448' })
    if (!category.confirm) return
    setBusy(true)
    const r = await experienceAdminApi.approve(item.id, {
      title: title.content?.trim() || item.title,
      category: category.content?.trim() || '会谈沉淀',
      content: item.content,
    })
    setBusy(false)
    Taro.showToast({ title: r.ok ? '已发布为正式知识' : r.error || '操作失败', icon: 'none' })
    if (r.ok) load()
  }

  // 审核驳回
  async function reject(item: any) {
    if (busy) return
    const modal = await Taro.showModal({
      title: '驳回经验',
      content: '确定驳回该经验候选？不会写入知识库。',
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    setBusy(true)
    const r = await experienceAdminApi.reject(item.id, '审核驳回')
    setBusy(false)
    Taro.showToast({ title: r.ok ? '已驳回' : r.error || '操作失败', icon: 'none' })
    if (r.ok) load()
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-exp">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  return (
    <View className="page admin-exp">
      <View className="page-header">
        <Text>经验复板</Text>
      </View>
      <View className="section-title">
        <Text>待审核经验</Text>
        <Text className="section-sub">共 {list.length} 条</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton exp-skeleton" />
      ) : list.length === 0 ? (
        <View className="ref-empty">暂无待审核经验</View>
      ) : (
        list.map((item, i) => (
          <View className="ref-card exp-card" key={item.id || i}>
            <Text className="exp-title">{item.title}</Text>
            <View className="exp-meta">
              {item.submitted_by_name ? <Text>{item.submitted_by_name} · </Text> : null}
              <Text>{fmtDate(item.created_at)}</Text>
            </View>
            <Text className="exp-content">{item.content}</Text>
            <View className="exp-actions">
              <View className="ref-btn-sm ref-btn-sm-primary" onClick={() => approve(item)}>通过发布</View>
              <View className="ref-btn-sm ref-btn-sm-danger" onClick={() => reject(item)}>驳回</View>
            </View>
          </View>
        ))
      )}
    </View>
  )
}
