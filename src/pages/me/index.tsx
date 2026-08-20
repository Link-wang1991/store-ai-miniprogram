import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getUserInfo, logout, isLoggedIn, type UserInfo } from '@/utils/auth'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import { openCoach } from '@/utils/navigation'
import { setActiveTab } from '@/utils/ui'
import './index.scss'

export default function Me() {
  const [user, setUser] = useState<UserInfo | null>(null)

  useDidShow(() => {
    setActiveTab(4)
  })

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    setUser(getUserInfo())
  }, [])

  function onLogout() {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmColor: '#d94b3d',
    }).then((r) => {
      if (r.confirm) {
        logout()
        Taro.reLaunch({ url: '/pages/login/index' })
      }
    })
  }

  const isMgmt = !!user && ['owner', 'admin', 'manager'].includes(user.role)

  return (
    <View className="page me-page">
      <View className="me-hero">
        <View className="avatar">
          <Text className="avatar-text">{user?.name?.[0] || '我'}</Text>
        </View>
        <View className="me-info">
          <Text className="me-name">{user?.name || '未登录'}</Text>
          <Text className="me-role">
            {user?.roleLabel || ''}
            {user?.storeName ? ` · ${user.storeName}` : ''}
          </Text>
        </View>
      </View>

      <View className="section-title">
        <Text>常用</Text>
      </View>
      <View className="quick-grid">
        <View className="quick-card" onClick={() => Taro.switchTab({ url: '/pages/chat/index' })}>
          <View className="quick-ico ico-1"><Icon svg={ICN.psy('#008448')} size={36} /></View>
          <Text className="quick-label">AI教练</Text>
        </View>
        <View className="quick-card" onClick={() => Taro.switchTab({ url: '/pages/meeting/index' })}>
          <View className="quick-ico ico-2"><Icon svg={ICN.mic('#008448')} size={36} /></View>
          <Text className="quick-label">会谈</Text>
        </View>
        <View className="quick-card" onClick={() => Taro.navigateTo({ url: '/pages/tasks/index' })}>
          <View className="quick-ico ico-3"><Icon svg={ICN.check('#008448')} size={36} /></View>
          <Text className="quick-label">我的任务</Text>
        </View>
        <View className="quick-card" onClick={() => openCoach()}>
          <View className="quick-ico ico-4"><Icon svg={ICN.chat('#008448')} size={36} /></View>
          <Text className="quick-label">提交问题</Text>
        </View>
      </View>

      {isMgmt ? (
        <>
          <View className="section-title">
            <Text>管理</Text>
          </View>
          <View className="mgmt-grid">
            <View className="mgmt-card" onClick={() => Taro.navigateTo({ url: '/pages/admin/index' })}>
              <View className="mgmt-ico"><Icon svg={ICN.cog('#008448')} size={38} /></View>
              <View className="mgmt-main">
                <Text className="mgmt-title">管理后台</Text>
                <Text className="mgmt-sub">经营看板 · 待处理异常 · 各管理入口</Text>
              </View>
              <Text className="mgmt-arrow">›</Text>
            </View>
            <View className="mgmt-card" onClick={() => Taro.navigateTo({ url: '/pages/admin/data-switch/index' })}>
              <View className="mgmt-ico"><Icon svg={ICN.refresh('#008448')} size={38} /></View>
              <View className="mgmt-main">
                <Text className="mgmt-title">数据切换</Text>
                <Text className="mgmt-sub">预览 · 备份 · 清空经营数据（仅老板）</Text>
              </View>
              <Text className="mgmt-arrow">›</Text>
            </View>
          </View>
        </>
      ) : null}

      <View className="btn-logout" onClick={onLogout}>
        <Text>退出登录</Text>
      </View>
    </View>
  )
}
