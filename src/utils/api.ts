import Taro from '@tarojs/taro'
import { request } from './request'
import { getToken } from './auth'
import { API_BASE_URL } from './constants'
import type { UserInfo } from './auth'

export type LoginData = UserInfo & { token: string }

export const authApi = {
  sendCode: (phone: string, type = 'login') =>
    request<{ devCode?: string }>('/api/auth/send-code', {
      method: 'POST',
      body: { phone, type },
      auth: false,
    }),

  loginByPassword: (phone: string, password: string) =>
    request<LoginData>('/api/auth/login', {
      method: 'POST',
      body: { phone, password },
      auth: false,
    }),

  loginByPhone: (phone: string, code: string) =>
    request<LoginData>('/api/auth/login-by-phone', {
      method: 'POST',
      body: { phone, code },
      auth: false,
    }),

  // 微信一键登录：wx.login 的 code → 后端 code2session
  wxLogin: (code: string) =>
    request<LoginData & { needBind?: boolean }>('/api/auth/wx-login', {
      method: 'POST',
      body: { code },
      auth: false,
    }),

  // 微信登录后绑定手机号（首次使用）
  wxBindPhone: (code: string, phone: string, smsCode: string) =>
    request<LoginData>('/api/auth/wx-bind', {
      method: 'POST',
      body: { code, phone, smsCode },
      auth: false,
    }),

  me: () => request<UserInfo>('/api/auth/me'),
}

// -- 首页工作台 --
export type HomeOverview = {
  customers: any[]
  tasks: any[]
  pending_experience_reviews: number
}

export const homeApi = {
  overview: () => request<HomeOverview>('/api/home/overview'),
}

// -- 客户 --
export const customerApi = {
  list: () => request<any[]>('/api/customers'),
  detail: (id: string) => request<any>(`/api/customers/${id}`),
  update: (id: string, data: any) =>
    request<any>(`/api/customers/${id}/update`, { method: 'POST', body: data }),
}

// -- 任务 --
export const taskApi = {
  list: (status?: string) =>
    request<any[]>(`/api/tasks${status ? `?status=${status}` : ''}`),
  complete: (id: string, outcome: string, note?: string) =>
    request(`/api/tasks/${id}/complete`, { method: 'POST', body: { outcome, note } }),
}

// -- 会谈 --
export const meetingApi = {
  list: () => request<any[]>('/api/meetings'),
  // 后端返回 [{code, display_name, sort_order}]；页面层负责映射为 {code,label}
  scenes: () => request<{ code: string; display_name: string; sort_order: number }[]>('/api/meetings/scenes'),
  create: (data: { customerId?: string; customerName?: string; scene?: string; consent?: boolean }) =>
    request('/api/meetings', { method: 'POST', body: data }),
  delete: (id: string) => request(`/api/meetings/${id}/delete`, { method: 'POST' }),
  detail: (id: string) => request<any>(`/api/meetings/${id}`),
  analysis: (id: string) => request<any>(`/api/meetings/${id}/analysis`),
  transcripts: (id: string) => request<any[]>(`/api/meetings/${id}/transcripts`),
  // 修订转写句子 / 设置说话人身份（与 Web 端 app/meeting/[id] 逻辑一致）
  updateTranscript: (id: string, tid: string, content: string) =>
    request(`/api/meetings/${id}/transcripts/${tid}`, { method: 'PATCH', body: { content } }),
  updateSpeaker: (id: string, speaker: string, role: string) =>
    request(`/api/meetings/${id}/speakers/${encodeURIComponent(speaker)}`, {
      method: 'PATCH',
      body: { role },
    }),
  diagnostics: (id: string) => request<any>(`/api/meetings/${id}/diagnostics`),
  retryTranscription: (id: string) => request(`/api/meetings/${id}/retry-transcription`, { method: 'POST' }),
  reanalyze: (id: string) => request(`/api/meetings/${id}/reanalyze`, { method: 'POST' }),
  // 上传录音（multipart）
  uploadAudio: (id: string, filePath: string) =>
    new Promise<{ ok: boolean; data?: any; error?: string }>((resolve) => {
      const token = getToken()
      Taro.uploadFile({
        url: `${API_BASE_URL}/api/meetings/${id}/audio`,
        filePath,
        name: 'file',
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success: (res) => {
          try {
            const j = JSON.parse(res.data)
            resolve(
              j.code === 200
                ? { ok: true, data: j.data }
                : { ok: false, error: j.message || '上传失败' }
            )
          } catch {
            resolve({ ok: res.statusCode === 200, data: res.data })
          }
        },
        fail: () => resolve({ ok: false, error: '上传网络错误' }),
      })
    }),
}

// -- AI 教练对话 --
export type AiActionProposal = {
  id: string
  customerId?: string | null
  actionType: string
  title: string
  content: string
  assignedTo?: string | null
  priority?: string
  dueAt?: string | null
  status: string
  appliedTaskId?: string | null
  appliedTaskStatus?: string | null
  appliedTaskFeedback?: string | null
}
export type ActionProposalAssignee = { id: string; name: string; role: string }

export const chatApi = {
  ask: (question: string, sessionId?: string | null, customerId?: string, requestId?: string) =>
    request<{
      sessionId: string
      answer: string
      answerType: string
      riskLevel: string
      messageId: string
      generationMode: string
      retrieved: any[]
      methodology: any[]
    }>('/api/chat', {
      method: 'POST',
      body: { question, sessionId, customerId },
      timeoutMs: 60000,
      idempotencyKey: requestId,
    }),

  listSessions: () => request<any[]>('/api/chat/sessions'),
  listMessages: (sessionId: string) =>
    request<any[]>(`/api/chat/sessions/${sessionId}/messages`),
  deleteSession: (sessionId: string) =>
    request(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' }),

  feedback: (messageId: string, feedbackType: string, comment?: string) =>
    request(`/api/chat/messages/${messageId}/feedback`, {
      method: 'POST',
      body: { feedbackType, comment },
    }),

  createActionProposal: (messageId: string) =>
    request<AiActionProposal>(`/api/chat/messages/${messageId}/action-proposals`, {
      method: 'POST',
    }),

  updateActionProposal: (
    proposalId: string,
    input: Pick<AiActionProposal, 'title' | 'content' | 'assignedTo' | 'priority' | 'dueAt'>
  ) =>
    request<AiActionProposal>(`/api/chat/action-proposals/${proposalId}`, {
      method: 'PATCH',
      body: input,
    }),

  actionProposalAssignees: () =>
    request<ActionProposalAssignee[]>('/api/chat/action-proposals/assignees'),

  applyActionProposal: (proposalId: string) =>
    request<AiActionProposal>(`/api/chat/action-proposals/${proposalId}/apply`, {
      method: 'POST',
    }),

  rejectActionProposal: (proposalId: string) =>
    request<AiActionProposal>(`/api/chat/action-proposals/${proposalId}/reject`, {
      method: 'POST',
    }),
}

// -- 知识库 --
export const knowledgeApi = {
  list: (category?: string) =>
    request<any[]>(`/api/knowledge${category ? `?category=${category}` : ''}`),
  search: (q: string, topN = 5) =>
    request<any[]>(`/api/knowledge/search?q=${encodeURIComponent(q)}&topN=${topN}`),
}

// -- 平台管理（超管） --
export const superAdminApi = {
  stores: () => request<any[]>('/api/super-admin/stores'),
  createStore: (data: {
    name: string
    ownerName: string
    ownerPhone: string
    ownerPassword: string
  }) => request('/api/super-admin/stores', { method: 'POST', body: data }),
  initStore: (id: string) =>
    request(`/api/super-admin/stores/${id}/init`, { method: 'POST' }),
}
