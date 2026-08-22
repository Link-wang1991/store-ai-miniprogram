import { useEffect, useState } from 'react'
import { View, Text, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { pendingQuestionApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import './index.scss'

const ESCALATION_ROLES = new Set(['manager', 'admin', 'operator'])

export default function Submit() {
  const user = getUserInfo()
  const [question, setQuestion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isEscalationRole = !!user && ESCALATION_ROLES.has(user.role)
  const title = isEscalationRole ? '上报问题' : '提交问题'
  const description = isEscalationRole
    ? '需要老板或更高负责人决策的情况可在这里上报'
    : '需要负责人确认的情况可在这里提交'
  const guide = isEscalationRole
    ? '例如特殊价格、重大承诺、活动冲突或客户风险。上报后会进入待我处理，不会直接写入知识库。'
    : '例如 AI 无法确定的特殊价格、客户承诺或活动叠加。提交后会交由负责人确认，不会直接写入知识库。'

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (user?.role === 'owner') {
      Taro.switchTab({ url: '/pages/me/index' })
      return
    }
    Taro.setNavigationBarTitle({ title })
  }, [title, user?.role])

  async function submit() {
    const content = question.trim()
    if (content.length < 2) {
      Taro.showToast({ title: '请至少描述两个字的问题', icon: 'none' })
      return
    }
    if (submitting) return
    setSubmitting(true)
    const r = await pendingQuestionApi.create(content)
    setSubmitting(false)
    if (!r.ok) {
      Taro.showToast({ title: r.error || '提交失败，请稍后重试', icon: 'none' })
      return
    }
    Taro.showToast({ title: '已提交，等待负责人处理', icon: 'success' })
    setTimeout(() => {
      Taro.switchTab({ url: '/pages/me/index' })
    }, 650)
  }

  if (!user || user.role === 'owner') return null

  return (
    <View className="page submit-page">
      <View className="page-header"><Text>{title}</Text></View>
      <View className="submit-card ref-card">
        <Text className="submit-desc">{description}</Text>
        <Text className="submit-guide">{guide}</Text>
        <Textarea
          className="submit-textarea"
          value={question}
          maxlength={2000}
          placeholder="描述你遇到的问题…"
          placeholderClass="submit-placeholder"
          onInput={(event) => setQuestion(event.detail.value)}
        />
        <View className="submit-count"><Text>{question.length}/2000</Text></View>
        <View className={`ref-primary submit-button${submitting ? ' disabled' : ''}`} onClick={submit}>
          <Text>{submitting ? '提交中…' : '提交'}</Text>
        </View>
      </View>
    </View>
  )
}
