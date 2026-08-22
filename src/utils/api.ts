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
  create: (data: any) => request<any>('/api/customers', { method: 'POST', body: data }),
  update: (id: string, data: any) =>
    request<any>(`/api/customers/${id}/update`, { method: 'POST', body: data }),
  // 到店签到
  checkin: (id: string, note?: string) =>
    request<any>(`/api/customers/${id}/checkin`, { method: 'POST', body: note ? { note } : undefined }),
  // 到店识别：按手机号/姓名查找客户
  identify: (keyword: string) =>
    request<any[]>(`/api/customers/identify?keyword=${encodeURIComponent(keyword)}`),
  // 客户合并：把 sourceId 合并进 targetId（清理占位客户）
  merge: (targetId: string, sourceId: string) =>
    request<any>('/api/customers/merge', { method: 'POST', body: { targetId, sourceId } }),
  // 删除客户（临时/无意义客户）
  delete: (id: string) => request<any>(`/api/customers/${id}`, { method: 'DELETE' }),
  // 记忆项确认/修正/拒绝（客户档案直连）
  confirmMemory: (customerId: string, memoryId: string, data: { confirmed: boolean; correctedValue?: string }) =>
    request<any>(`/api/memory-confirmations/customers/${customerId}/memories/${memoryId}/confirm`, {
      method: 'POST',
      body: data,
    }),
}

// -- 管理后台 · 客户（Word/Excel/CSV 模板与导入） --
export const customerAdminApi = {
  /** 下载客户导入 Word 模板 */
  downloadTemplate: () =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const token = getToken()
      const header = token ? { Authorization: `Bearer ${token}` } : {}
      Taro.downloadFile({
        url: `${API_BASE_URL}/api/admin/customers/template`,
        header,
        success: (res) => {
          if (res.statusCode !== 200 || !res.tempFilePath) {
            resolve({ ok: false, error: `下载失败(${res.statusCode})` })
            return
          }
          Taro.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
            fileType: 'docx' as any,
            success: () => resolve({ ok: true }),
            fail: () => resolve({ ok: true }),
          })
        },
        fail: () => resolve({ ok: false, error: '下载网络错误' }),
      })
    }),
  /** 批量导入客户（Word、Excel 或 CSV） */
  import: (filePath: string) =>
    new Promise<{ ok: boolean; data?: any; error?: string }>((resolve) => {
      const token = getToken()
      Taro.uploadFile({
        url: `${API_BASE_URL}/api/admin/customers/import`,
        filePath,
        name: 'file',
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success: (res) => {
          try {
            const j = JSON.parse(res.data)
            resolve(j.code === 200 ? { ok: true, data: j.data } : { ok: false, error: j.message || '导入失败' })
          } catch {
            resolve({ ok: res.statusCode === 200, error: '导入结果解析失败' })
          }
        },
        fail: () => resolve({ ok: false, error: '上传网络错误' }),
      })
    }),
}

// -- 任务 --
export const taskApi = {
  list: (status?: string) =>
    request<any[]>(`/api/tasks${status ? `?status=${status}` : ''}`),
  complete: (id: string, outcome: string, note?: string) =>
    request(`/api/tasks/${id}/complete`, { method: 'POST', body: { outcome, note } }),
  // 更新状态：todo(待处理) / doing(执行中) / canceled(取消)
  updateStatus: (id: string, status: string) =>
    request(`/api/tasks/${id}/status?status=${encodeURIComponent(status)}`, { method: 'POST' }),
  // 任务延期：把截止时间改到新时间
  defer: (id: string, newDueAt: string) =>
    request(`/api/tasks/${id}/defer`, { method: 'POST', body: { newDueAt } }),
  // 任务指派/转交
  assign: (id: string, assignedTo: string) =>
    request(`/api/tasks/${id}/assign`, { method: 'POST', body: { assignedTo } }),
  // 可指派的员工候选
  assignees: () => request<any[]>('/api/tasks/assignees'),
  // 证据附件
  listAttachments: (id: string) => request<any[]>(`/api/tasks/${id}/attachments`),
  uploadAttachment: (id: string, filePath: string) =>
    new Promise<{ ok: boolean; data?: any; error?: string }>((resolve) => {
      const token = getToken()
      Taro.uploadFile({
        url: `${API_BASE_URL}/api/tasks/${id}/attachments`,
        filePath,
        name: 'file',
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success: (res) => {
          try {
            const j = JSON.parse(res.data)
            resolve(j.code === 200 ? { ok: true, data: j.data } : { ok: false, error: j.message || '上传失败' })
          } catch {
            resolve({ ok: res.statusCode === 200, data: res.data })
          }
        },
        fail: () => resolve({ ok: false, error: '上传网络错误' }),
      })
    }),
  deleteAttachment: (id: string, attachmentId: string) =>
    request(`/api/tasks/${id}/attachments/${attachmentId}`, { method: 'DELETE' }),
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
  // 编辑会谈：绑定已有客户 / 改客户名等
  update: (id: string, data: any) => request<any>(`/api/meetings/${id}`, { method: 'PATCH', body: data }),
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
  // 行动确认：转写修订后选择"采用新计划"或"保留原计划"
  actionReconciliation: (id: string, decision: 'apply' | 'keep') =>
    request<any>(`/api/meetings/${id}/action-reconciliation`, {
      method: 'POST',
      body: { decision },
    }),
  // 质量复核（店长/老板）：对自动评分做人工校准
  qualityReview: (id: string, data: { score: number; note?: string; reason_codes?: string[] }) =>
    request<any>(`/api/meetings/${id}/quality-review`, {
      method: 'POST',
      body: { score: data.score, note: data.note, reason_codes: data.reason_codes },
    }),
  // 原始录音播放地址（流式，走受控接口）
  audioUrl: (id: string) => `${API_BASE_URL}/api/meetings/${id}/audio`,
  // 上传录音（multipart）。duration 单位为秒，用于会谈详情/统计口径。
  uploadAudio: (id: string, filePath: string, duration = 0) =>
    new Promise<{ ok: boolean; data?: any; error?: string }>((resolve) => {
      const token = getToken()
      Taro.uploadFile({
        url: `${API_BASE_URL}/api/meetings/${id}/audio`,
        filePath,
        name: 'file',
        formData: duration > 0 ? { duration: String(duration) } : undefined,
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

// -- 经验沉淀（优秀会谈提交审核） --
export const experienceReviewApi = {
  submit: (data: { meetingId: string; title: string; content: string; category?: string }) =>
    request<any>('/api/experience-reviews/submit', {
      method: 'POST',
      body: { meetingId: data.meetingId, title: data.title, content: data.content, category: data.category || '会谈沉淀' },
    }),
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

// -- 店长驾驶舱 / 运营监控（管理后台） --
export const adminApi = {
  /** 店长驾驶舱：今日会谈、合规风险、任务、员工排行、低分会谈等 */
  dashboard: () => request<any>('/api/dashboard/manager'),
  /** 异常运营总览：会谈失败/停滞、知识到期、逾期任务、AI 兜底等 */
  operationsOverview: () => request<any>('/api/admin/operations/overview'),
}

// -- 数据切换（备份/清空经营数据） --
export const dataResetApi = {
  /** 预览各业务表数据量 */
  preview: () => request<any>('/api/admin/data-reset/preview'),
  /** 生成本地 JSON 备份 */
  backup: () => request<any>('/api/admin/data-reset/backup', { method: 'POST' }),
  /** 本店已生成的备份文件列表 */
  backups: () => request<any[]>('/api/admin/data-reset/backups'),
  /** 下载备份文件：先下载到临时文件，再调用 openDocument 预览/另存 */
  download: (fileName: string) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const token = getToken()
      const header = token ? { Authorization: `Bearer ${token}` } : {}
      Taro.downloadFile({
        url: `${API_BASE_URL}/api/admin/data-reset/backup/${encodeURIComponent(fileName)}`,
        header,
        success: (res) => {
          if (res.statusCode !== 200 || !res.tempFilePath) {
            resolve({ ok: false, error: `下载失败(${res.statusCode})` })
            return
          }
          Taro.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
            fileType: 'docx' as any,
            success: () => resolve({ ok: true }),
            fail: () => resolve({ ok: true, error: '已下载，请在临时文件中选择保存位置' }),
          })
        },
        fail: () => resolve({ ok: false, error: '下载网络错误' }),
      })
    }),
  /** 备份后清空经营数据（仅老板，需输入确认词） */
  clear: (confirmation: string) =>
    request<any>('/api/admin/data-reset/clear', {
      method: 'POST',
      body: { confirmation },
    }),
}

// -- 管理后台 · 员工账号 --
export const employeeAdminApi = {
  /** 同店可切换的账号列表（管理员） */
  switchable: () => request<any[]>('/api/admin/employees/switchable'),
  /** 老板体验员工身份 */
  previewLogin: (employeeId: string) =>
    request<any>(`/api/admin/employees/${employeeId}/preview-login`, { method: 'POST' }),
  /** 全店员工列表 */
  all: () => request<any[]>('/api/admin/employees/all'),
  /** 新增员工账号 */
  create: (data: { name: string; email: string; password: string; phone?: string; role: string }) =>
    request<any>('/api/admin/employees', { method: 'POST', body: data }),
  /** 停用员工 */
  deactivate: (employeeId: string) =>
    request<any>(`/api/admin/employees/${employeeId}/deactivate`, { method: 'POST' }),
  /** 下载员工导入模板（CSV） */
  downloadTemplate: () =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const token = getToken()
      const header = token ? { Authorization: `Bearer ${token}` } : {}
      Taro.downloadFile({
        url: `${API_BASE_URL}/api/admin/employees/template`,
        header,
        success: (res) => {
          if (res.statusCode !== 200 || !res.tempFilePath) {
            resolve({ ok: false, error: `下载失败(${res.statusCode})` })
            return
          }
          Taro.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
            fileType: 'docx' as any,
            success: () => resolve({ ok: true }),
            fail: () => resolve({ ok: true }),
          })
        },
        fail: () => resolve({ ok: false, error: '下载网络错误' }),
      })
    }),
  /** 批量导入员工（multipart CSV） */
  import: (filePath: string) =>
    new Promise<{ ok: boolean; data?: any; error?: string }>((resolve) => {
      const token = getToken()
      Taro.uploadFile({
        url: `${API_BASE_URL}/api/admin/employees/import`,
        filePath,
        name: 'file',
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success: (res) => {
          try {
            const j = JSON.parse(res.data)
            resolve(j.code === 200 ? { ok: true, data: j.data } : { ok: false, error: j.message || '导入失败' })
          } catch {
            resolve({ ok: res.statusCode === 200, error: '导入结果解析失败' })
          }
        },
        fail: () => resolve({ ok: false, error: '上传网络错误' }),
      })
    }),
}

// -- 管理后台 · 风险复盘 --
export const riskAdminApi = {
  list: (status?: string) =>
    request<any[]>(`/api/admin/risk-logs${status ? `?status=${status}` : ''}`),
  summary: () => request<any>('/api/admin/risk-logs/summary'),
  handle: (id: string, resolution?: string) =>
    request<any>(`/api/admin/risk-logs/${id}/handle`, { method: 'POST', body: { resolution } }),
}

// -- 管理后台 · 议价复盘 --
export const bargainReviewApi = {
  list: () => request<any[]>('/api/admin/bargain-reviews'),
  summary: () => request<any>('/api/admin/bargain-reviews/summary'),
}

// -- 管理后台 · 经营报告（增长复盘） --
export const reportApi = {
  list: () => request<any[]>('/api/admin/reports'),
  generate: (type?: string) =>
    request<any>(`/api/admin/reports/generate${type ? `?type=${type}` : ''}`, { method: 'POST' }),
}

// -- 管理后台 · 通知公告 --
export const announcementApi = {
  list: () => request<any[]>('/api/admin/announcements'),
  create: (data: { title: string; content: string; type?: string; priority?: string; visibleRoles?: string[] }) =>
    request<any>('/api/admin/announcements', { method: 'POST', body: data }),
  deactivate: (id: string) =>
    request<any>(`/api/admin/announcements/${id}/deactivate`, { method: 'POST' }),
}

// -- 管理后台 · 评分复盘 --
export const qualityReviewApi = {
  calibration: () => request<any>('/api/meetings/quality-calibration'),
}

// -- 管理后台 · 提问复盘 --
export const pendingQuestionApi = {
  list: () => request<any[]>('/api/pending-questions'),
  assignees: () => request<any[]>('/api/pending-questions/assignees'),
  create: (question: string) =>
    request<any>('/api/pending-questions', { method: 'POST', body: { question } }),
  assign: (id: string, assigneeId: string) =>
    request<any>(`/api/pending-questions/${id}/assign?assigneeId=${encodeURIComponent(assigneeId)}`, { method: 'POST' }),
  ack: (id: string) => request<any>(`/api/pending-questions/${id}/ack`, { method: 'POST' }),
  resolve: (id: string, reply: string) =>
    request<any>(`/api/pending-questions/${id}/resolve`, { method: 'POST', body: { reply } }),
  escalate: (id: string, reason: string) =>
    request<any>(`/api/pending-questions/${id}/escalate`, { method: 'POST', body: { reason } }),
}

// -- 管理后台 · 经验复板（审核） --
export const experienceAdminApi = {
  listPending: () => request<any[]>('/api/experience-reviews'),
  approve: (id: string, data: { title: string; category: string; content: string; visibleRoles?: string[] }) =>
    request<any>(`/api/experience-reviews/${id}/approve`, { method: 'POST', body: data }),
  reject: (id: string, reason: string) =>
    request<any>(`/api/experience-reviews/${id}/reject`, { method: 'POST', body: { reason } }),
}

// -- 管理后台 · 权限管理（门店自定义配置） --
export const storeConfigApi = {
  list: () => request<any[]>('/api/store-config'),
  replaceCategory: (category: string, items: any[]) =>
    request<any>(`/api/store-config/${category}`, { method: 'PUT', body: { items } }),
}

// -- 管理后台 · 知识库（门店资料管理） --
export const knowledgeAdminApi = {
  list: (category?: string) =>
    request<any[]>(`/api/knowledge${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  /** 上传文件资料（multipart，AI 自动切分分类） */
  upload: (filePath: string, data: { title: string; category: string; tags?: string; remark?: string; status?: string }) =>
    new Promise<{ ok: boolean; data?: any; error?: string }>((resolve) => {
      const token = getToken()
      Taro.uploadFile({
        url: `${API_BASE_URL}/api/knowledge/upload`,
        filePath,
        name: 'file',
        formData: {
          title: data.title,
          category: data.category,
          tags: data.tags || '',
          remark: data.remark || '',
          status: data.status || 'active',
        },
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success: (res) => {
          try {
            const j = JSON.parse(res.data)
            resolve(j.code === 200 ? { ok: true, data: j.data } : { ok: false, error: j.message || '上传失败' })
          } catch {
            resolve({ ok: res.statusCode === 200, data: res.data })
          }
        },
        fail: () => resolve({ ok: false, error: '上传网络错误' }),
      })
    }),
  /** 手动输入知识（纯文本） */
  createManual: (data: { title: string; category: string; content: string; tags?: string; remark?: string }) =>
    request<any>('/api/knowledge/manual', { method: 'POST', body: data }),
  /** 停用/启用 */
  toggle: (id: string) =>
    request<any>(`/api/knowledge/${id}/toggle`, { method: 'POST' }),
  /** 删除 */
  delete: (id: string) =>
    request<any>(`/api/knowledge/${id}/delete`, { method: 'POST' }),
}
