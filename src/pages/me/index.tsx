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
        <View
          className="ref-card mgmt-card"
          onClick={() =>
            Taro.showModal({
              title: '管理后台即将开放',
              content: '员工、知识库、权限、数据看板等管理能力建议先在 Web 管理端使用，小程序轻量管理入口正在建设中。',
              showCancel: false,
              confirmText: '知道了',
              confirmColor: '#008448',
            })
          }
        >
          <View className="mgmt-ico"><Icon svg={ICN.cog('#008448')} size={40} /></View>
          <View className="mgmt-main">
            <Text className="mgmt-title">管理后台</Text>
            <Text className="mgmt-sub">员工、知识库、权限、数据看板 · 即将开放</Text>
          </View>
          <Text className="mgmt-arrow">›</Text>
        </View>
      ) : null}

      <View className="btn-logout" onClick={onLogout}>
        <Text>退出登录</Text>
      </View>
    </View>
  )
}
