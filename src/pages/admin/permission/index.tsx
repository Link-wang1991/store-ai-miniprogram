import { useEffect, useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { storeConfigApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import './index.scss'

const CATEGORY_LABELS: Record<string, string> = {
  role: '岗位角色',
  duty: '岗位职责',
  workbench: '工作台',
  knowledge: '知识分类',
  pool: '客户池',
  stage: '客户阶段',
  alert: '告警提醒',
  followup: '跟进策略',
  scene: '咨询场景',
  tag: '客户标签',
  project_cat: '项目分类',
  sop_cat: 'SOP 分类',
  script_cat: '话术分类',
}

export default function AdminPermission() {
  const user = getUserInfo()
  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [editing, setEditing] = useState('')

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
    const r = await storeConfigApi.list()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  // 按分类分组
  const groups = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const item of list) {
      const c = item.category || '其他'
      if (!map[c]) map[c] = []
      map[c].push(item)
    }
    return Object.entries(map).map(([category, items]) => ({ category, items }))
  }, [list])

  async function toggle(item: any) {
    const category = item.category
    const items = (groups.find((g) => g.category === category)?.items || []).map((x) => ({
      code: x.code,
      displayName: x.display_name,
      enabled: x.id === item.id ? !x.enabled : !!x.enabled,
      visibleToStaff: !!x.visible_to_staff,
    }))
    const r = await storeConfigApi.replaceCategory(category, items)
    if (r.ok) {
      Taro.showToast({ title: '已更新', icon: 'success' })
      load()
    } else {
      Taro.showToast({ title: r.error || '更新失败', icon: 'none' })
    }
  }

  if (!user || !isMgmt) {
    return (
      <View className="page admin-perm">
        <View className="ref-empty">无权限访问</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  return (
    <View className="page admin-perm">
      <View className="page-header">
        <Text>权限管理</Text>
      </View>
      <Text className="perm-tip">管理门店业务字典（岗位、知识分类、客户池、场景等）的启用状态。修改后全店即时生效。</Text>

      {loading ? (
        <View className="ref-skeleton perm-skeleton" />
      ) : groups.length === 0 ? (
        <View className="ref-empty">暂无配置项</View>
      ) : (
        groups.map((g) => (
          <View className="ref-card perm-group" key={g.category}>
            <View className="perm-group-head" onClick={() => setEditing(editing === g.category ? '' : g.category)}>
              <Text className="perm-group-name">{CATEGORY_LABELS[g.category] || g.category}</Text>
              <Text className="perm-group-count">{g.items.length} 项 {editing === g.category ? '▴' : '▾'}</Text>
            </View>
            {editing === g.category ? (
              <View className="perm-items">
                {g.items.map((item) => (
                  <View className="perm-item" key={item.id}>
                    <View className="perm-item-main">
                      <Text className="perm-code">{item.code}</Text>
                      <Text className="perm-name">{item.display_name}</Text>
                    </View>
                    <View
                      className={`perm-switch${item.enabled ? ' on' : ''}`}
                      onClick={() => toggle(item)}
                    >
                      <View className="perm-switch-dot" />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  )
}
