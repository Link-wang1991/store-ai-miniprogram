import Taro from '@tarojs/taro'
import { getToken, logout } from './auth'
import { API_BASE_URL } from './constants'

export interface ApiResult<T = any> {
  ok: boolean
  data?: T
  error?: string
  code?: number
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: any
  /** 微信 request 超时上限 60000ms；AI 长链路请控制在 60s 内。 */
  timeoutMs?: number
  idempotencyKey?: string
  /** 是否需要携带 token，默认 true；登录类接口传 false */
  auth?: boolean
  /** 401/403 时是否自动跳登录，默认 true */
  autoRedirectLogin?: boolean
}

export async function request<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResult<T>> {
  const {
    method = 'GET',
    body,
    timeoutMs = 20000,
    idempotencyKey,
    auth = true,
    autoRedirectLogin = true,
  } = options

  const token = auth ? getToken() : null
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) header['Authorization'] = `Bearer ${token}`
  if (idempotencyKey) header['X-Idempotency-Key'] = idempotencyKey

  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}${path}`,
      method: method as any,
      header,
      data: body,
      timeout: Math.min(timeoutMs, 60000),
    })

    const json = res.data as any

    if (res.statusCode === 401 || res.statusCode === 403) {
      // 立即清除失效 token，否则登录页守卫 isLoggedIn() 仍为 true 会跳回首页，
      // 首页再请求又 401/403 → 造成"页面不断刷新 + 反复弹未授权"死循环。
      logout()
      if (autoRedirectLogin) {
        Taro.showToast({ title: '登录已失效，请重新登录', icon: 'none' })
        Taro.reLaunch({ url: '/pages/login/index' })
      }
      return { ok: false, error: json?.message || '未授权', code: res.statusCode }
    }

    if (json && json.code === 200) {
      return { ok: true, data: json.data, code: json.code }
    }

    return {
      ok: false,
      error: (json && json.message) || `请求失败(${res.statusCode})`,
      code: json?.code ?? res.statusCode,
    }
  } catch (e: any) {
    const msg = e?.errMsg || '网络错误'
    if (msg.indexOf('timeout') >= 0) {
      return { ok: false, error: '请求超时，请稍后重试' }
    }
    return { ok: false, error: msg }
  }
}
