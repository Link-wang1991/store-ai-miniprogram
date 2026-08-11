import { useEffect, useRef, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { authApi, type LoginData } from '@/utils/api'
import { isLoggedIn, setToken, setUserInfo } from '@/utils/auth'
import './index.scss'

export default function Login() {
  const [mode, setMode] = useState<'password' | 'code'>('password')

  // 密码登录
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  // 验证码登录
  const [codePhone, setCodePhone] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [devCode, setDevCode] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 微信一键登录 / 绑定分支
  const [needBind, setNeedBind] = useState(false)
  const [wxCode, setWxCode] = useState('')
  const [bindPhone, setBindPhone] = useState('')
  const [bindCode, setBindCode] = useState('')
  const [bindCountdown, setBindCountdown] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const bindTimerRef = useRef<ReturnType<typeof setInterval>>()

  useDidShow(() => {
    // 登录态持久化在 Storage：已登录用户打开小程序直接进首页，无需重复登录
    if (isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/home/index' })
    }
  })

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (bindTimerRef.current) clearInterval(bindTimerRef.current)
    }
  }, [])

  function startCountdown(setter: typeof setCountdown, ref?: typeof timerRef) {
    setter(60)
    if (ref?.current) clearInterval(ref.current)
    const t = setInterval(() => {
      setter((c) => {
        if (c <= 1) {
          if (ref?.current) clearInterval(ref.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
    if (ref) ref.current = t
  }

  function finishLogin(data: LoginData) {
    setToken(data.token)
    setUserInfo({
      userId: data.userId,
      employeeId: data.employeeId,
      storeId: data.storeId,
      role: data.role,
      roleLabel: data.roleLabel,
      storeName: data.storeName,
      name: data.name,
    })
    Taro.reLaunch({ url: '/pages/home/index' })
  }

  async function onSendCode() {
    setError('')
    if (!/^1[3-9]\d{9}$/.test(codePhone.trim())) {
      setError('请输入正确的手机号')
      return
    }
    const r = await authApi.sendCode(codePhone.trim())
    if (!r.ok) {
      setError(r.error || '验证码发送失败')
      return
    }
    startCountdown(setCountdown, timerRef)
    setDevCode(r.data?.devCode || '')
  }

  async function onPasswordSubmit() {
    setError('')
    setLoading(true)
    try {
      const r = await authApi.loginByPassword(phone.trim(), password)
      if (!r.ok || !r.data) {
        setError(r.error || '登录失败')
        return
      }
      finishLogin(r.data)
    } finally {
      setLoading(false)
    }
  }

  async function onCodeSubmit() {
    setError('')
    setLoading(true)
    try {
      const r = await authApi.loginByPhone(codePhone.trim(), code.trim())
      if (!r.ok || !r.data) {
        setError(r.error || '验证码不正确')
        return
      }
      finishLogin(r.data)
    } finally {
      setLoading(false)
    }
  }

  // 微信一键登录
  async function onWxLogin() {
    setError('')
    setLoading(true)
    try {
      const login = await Taro.login()
      if (!login.code) {
        setError('微信登录失败，请重试')
        return
      }
      const r = await authApi.wxLogin(login.code)
      if (!r.ok || !r.data) {
        setError(r.error || '微信登录失败')
        return
      }
      if (r.data.needBind) {
        setWxCode(login.code)
        setNeedBind(true)
        return
      }
      finishLogin(r.data)
    } catch {
      setError('微信登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  async function onBindSendCode() {
    setError('')
    if (!/^1[3-9]\d{9}$/.test(bindPhone.trim())) {
      setError('请输入正确的手机号')
      return
    }
    const r = await authApi.sendCode(bindPhone.trim())
    if (!r.ok) {
      setError(r.error || '验证码发送失败')
      return
    }
    startCountdown(setBindCountdown, bindTimerRef)
    setDevCode(r.data?.devCode || '')
  }

  async function onBindSubmit() {
    setError('')
    setLoading(true)
    try {
      const r = await authApi.wxBindPhone(wxCode, bindPhone.trim(), bindCode.trim())
      if (!r.ok || !r.data) {
        setError(r.error || '绑定失败')
        return
      }
      finishLogin(r.data)
    } finally {
      setLoading(false)
    }
  }

  // ---- 微信绑定分支 UI ----
  if (needBind) {
    return (
      <View className="login-page">
        <View className="login-header">
          <Text className="login-title">绑定手机号</Text>
          <Text className="login-sub">首次使用，请绑定门店手机号以创建账号</Text>
        </View>
        <View className="login-form">
          <View className="field">
            <Text className="label">手机号</Text>
            <Input
              className="input"
              type="number"
              value={bindPhone}
              onInput={(e) => setBindPhone(e.detail.value)}
              placeholder="请输入手机号"
            />
          </View>
          <View className="field">
            <Text className="label">验证码</Text>
            <View className="input-row">
              <Input
                className="input flex1"
                type="number"
                value={bindCode}
                onInput={(e) => setBindCode(e.detail.value)}
                placeholder="请输入验证码"
              />
              <View
                className={`code-btn ${bindCountdown > 0 ? 'disabled' : ''}`}
                onClick={bindCountdown > 0 ? undefined : onBindSendCode}
              >
                <Text>{bindCountdown > 0 ? `${bindCountdown}s 后重发` : '获取验证码'}</Text>
              </View>
            </View>
          </View>
          {devCode && <Text className="dev-hint">开发模式验证码：{devCode}</Text>}
          {error && <Text className="error">{error}</Text>}
          <View className="btn-primary" onClick={loading ? undefined : onBindSubmit}>
            <Text>{loading ? '绑定中…' : '确认绑定并登录'}</Text>
          </View>
        </View>
      </View>
    )
  }

  // ---- 主登录 UI ----
  return (
    <View className="login-page">
      <View className="login-header">
        <Text className="login-title">欢迎回来</Text>
        <Text className="login-sub">员工工作指导 · 老板经营管理</Text>
      </View>

      <View className="tab-switch">
        <View
          className={`tab ${mode === 'password' ? 'active' : ''}`}
          onClick={() => {
            setMode('password')
            setError('')
          }}
        >
          <Text>密码登录</Text>
        </View>
        <View
          className={`tab ${mode === 'code' ? 'active' : ''}`}
          onClick={() => {
            setMode('code')
            setError('')
          }}
        >
          <Text>验证码登录</Text>
        </View>
      </View>

      <View className="login-form">
        {mode === 'password' ? (
          <View>
            <View className="field">
              <Text className="label">手机号</Text>
              <Input
                className="input"
                type="number"
                value={phone}
                onInput={(e) => setPhone(e.detail.value)}
                placeholder="请输入手机号"
              />
            </View>
            <View className="field">
              <Text className="label">密码</Text>
              <Input
                className="input"
                password
                value={password}
                onInput={(e) => setPassword(e.detail.value)}
                placeholder="请输入密码"
              />
            </View>
          </View>
        ) : (
          <View>
            <View className="field">
              <Text className="label">手机号</Text>
              <Input
                className="input"
                type="number"
                value={codePhone}
                onInput={(e) => setCodePhone(e.detail.value)}
                placeholder="请输入手机号"
              />
            </View>
            <View className="field">
              <Text className="label">验证码</Text>
              <View className="input-row">
                <Input
                  className="input flex1"
                  type="number"
                  value={code}
                  onInput={(e) => setCode(e.detail.value)}
                  placeholder="请输入验证码"
                />
                <View
                  className={`code-btn ${countdown > 0 ? 'disabled' : ''}`}
                  onClick={countdown > 0 ? undefined : onSendCode}
                >
                  <Text>{countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}</Text>
                </View>
              </View>
            </View>
            {devCode && <Text className="dev-hint">开发模式验证码：{devCode}</Text>}
          </View>
        )}

        {error && <Text className="error">{error}</Text>}

        <View
          className="btn-primary"
          onClick={loading ? undefined : mode === 'password' ? onPasswordSubmit : onCodeSubmit}
        >
          <Text>{loading ? '登录中…' : '登录'}</Text>
        </View>

        <View className="divider">
          <View className="divider-line" />
          <Text className="divider-text">其他方式</Text>
          <View className="divider-line" />
        </View>

        <View className="btn-wx" onClick={loading ? undefined : onWxLogin}>
          <Text className="btn-wx-text">微信一键登录</Text>
        </View>

        <Text className="tip">手机号须由超级管理员预录入，未开通请先联系门店</Text>
      </View>
    </View>
  )
}
