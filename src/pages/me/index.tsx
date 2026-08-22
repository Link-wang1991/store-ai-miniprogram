import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getUserInfo, logout, isLoggedIn, type UserInfo } from '@/utils/auth'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import { adminApi, pendingQuestionApi, taskApi } from '@/utils/api'
import { setActiveTab } from '@/utils/ui'
import './index.scss'

const MANAGEMENT_ROLES = new Set(['owner', 'admin', 'manager', 'operator'])
const ESCALATION_ROLES = new Set(['admin', 'manager', 'operator'])
const CLOSED_QUESTION_STATUSES = new Set(['resolved', 'escalated', 'review_pending'])

export default function Me() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [openTaskCount, setOpenTaskCount] = useState<number | null>(null)
  const [openQuestionCount, setOpenQuestionCount] = useState<number | null>(null)
  const [operations, setOperations] = useState<{ critical: number; warning: number } | null>(null)

  useDidShow(() => {
    setActiveTab(4)
  })

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    const current = getUserInfo()
    setUser(current)
    if (!current || !MANAGEMENT_ROLES.has(current.role)) return

    void loadManagementSummary(current.role)
  }, [])

  async function loadManagementSummary(role: string) {
    const requests: Promise<any>[] = [adminApi.operationsOverview()]
    if (role === 'owner') requests.unshift(pendingQuestionApi.list())
    else requests.unshift(taskApi.list())
    const [workResult, operationsResult] = await Promise.allSettled(requests)

    if (workResult.status === 'fulfilled' && workResult.value.ok) {
      const list = Array.isArray(workResult.value.data) ? workResult.value.data : []
      if (role === 'owner') {
        setOpenQuestionCount(list.filter((item: any) => !CLOSED_QUESTION_STATUSES.has(String(item.status || 'pending'))).length)
      } else {
        setOpenTaskCount(list.filter((item: any) => !['done', 'completed', 'canceled'].includes(String(item.status || ''))).length)
      }
    }

    if (operationsResult.status === 'fulfilled' && operationsResult.value.ok) {
      const summary = operationsResult.value.data?.summary
      const critical = Number(summary?.critical)
      const warning = Number(summary?.warning)
      if (Number.isFinite(critical) && Number.isFinite(warning)) setOperations({ critical, warning })
    }
  }

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

  const isMgmt = !!user && MANAGEMENT_ROLES.has(user.role)
  const isOwner = user?.role === 'owner'
  const isEscalationRole = !!user && ESCALATION_ROLES.has(user.role)
  const actionRequiredOperations = operations ? operations.critical + operations.warning : null
  const operationsDescription = actionRequiredOperations === null
    ? '经营提醒暂不可用'
    : operations?.critical
      ? `${operations.critical} 项需优先处理`
      : operations?.warning
        ? `${operations.warning} 项待关注`
        : '运营状态正常'

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

      {!isOwner ? (
        <>
          <View className="section-title"><Text>我的工作</Text></View>
          <View className="quick-grid">
            <View className="quick-card" onClick={() => Taro.navigateTo({ url: '/pages/tasks/index' })}>
              <View className="quick-ico ico-1"><Icon svg={ICN.check('#008448')} size={36} /></View>
              <Text className="quick-label">我的任务</Text>
            </View>
            <View className="quick-card" onClick={() => Taro.navigateTo({ url: '/pages/submit/index' })}>
              <View className="quick-ico ico-2"><Icon svg={ICN.arrow('#008448')} size={36} /></View>
              <Text className="quick-label">{isEscalationRole ? '上报问题' : '提交问题'}</Text>
            </View>
          </View>
        </>
      ) : null}

      {isMgmt ? (
        <>
          <View className="section-title">
            <Text>{isOwner ? '经营决策' : '经营管理'}</Text>
          </View>
          <View className="mgmt-grid">
            <View className="mgmt-card" onClick={() => Taro.navigateTo({ url: isOwner ? '/pages/admin/question/index' : '/pages/tasks/index?from=me' })}>
              <View className="mgmt-ico"><Icon svg={ICN.check('#008448')} size={38} /></View>
              <View className="mgmt-main">
                <Text className="mgmt-title">待我处理</Text>
                <Text className="mgmt-sub">{isOwner ? '待确认、审批与风险升级' : '我的正式任务'}</Text>
              </View>
              <Text className="mgmt-count">{isOwner ? (openQuestionCount === null ? '—' : openQuestionCount) : (openTaskCount === null ? '—' : openTaskCount)}</Text>
            </View>
            <View className="mgmt-card" onClick={() => Taro.navigateTo({ url: '/pages/admin/inspect/index' })}>
              <View className="mgmt-ico"><Icon svg={ICN.warn('#008448')} size={38} /></View>
              <View className="mgmt-main">
                <Text className="mgmt-title">经营提醒</Text>
                <Text className="mgmt-sub">{operationsDescription}</Text>
              </View>
              <Text className="mgmt-count">{actionRequiredOperations === null ? '—' : actionRequiredOperations}</Text>
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
