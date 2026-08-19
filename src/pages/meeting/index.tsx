import { useEffect, useRef, useState } from 'react'
import { View, Text, Input, ScrollView, Picker } from '@tarojs/components'
import Taro, { usePullDownRefresh, useDidShow } from '@tarojs/taro'
import { meetingApi, customerApi } from '@/utils/api'
import { isLoggedIn } from '@/utils/auth'
import { fmtDate, ageFromBirthday, birthdayFromAge } from '@/utils/format'
import { sceneLabel, MEETING_SCENES } from '@/utils/scenes'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import { setActiveTab } from '@/utils/ui'
import './index.scss'

// 场景兜底：{code, label}，后端 /api/meetings/scenes 返回的是对象数组（含 code/display_name/sort_order）
const SCENE_FALLBACK = MEETING_SCENES.map(([code, label]) => ({ code, label }))

// 场景归属：new=新客户场景，existing=老客户场景，both=通用（新老客户都显示）
const SCENE_TYPE: Record<string, 'new' | 'existing' | 'both'> = {
  new_consult: 'new',
  effect_doubt: 'new',
  project_intro: 'both',
  deal_consult: 'both',
  pre_service: 'both',
  price_objection: 'both',
  complaint: 'both',
  post_service: 'existing',
  repurchase: 'existing',
  campaign_invite: 'existing',
}

function statusOf(m: any): { label: string; tag: string; color: string } {
  const s = String(m.status || '').toLowerCase()
  if (['done', 'analyzed', 'completed'].includes(s)) return { label: '已完成', tag: 'ref-status-green', color: '#008448' }
  if (['analyzing', 'transcribing', 'processing', 'submitting'].includes(s)) return { label: '分析中', tag: 'ref-status-purple', color: '#7a4aa5' }
  if (['failed', 'error'].includes(s)) return { label: '失败', tag: 'ref-status-red', color: '#d94b3d' }
  if (['recording', 'uploaded', 'queued'].includes(s)) return { label: '处理中', tag: 'ref-status-yellow', color: '#c88400' }
  return { label: m.status || '待处理', tag: 'ref-status-gray', color: '#9aa2ad' }
}

function fmtNow() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function pad(n: number) {
  return String(n).padStart(2, '0')
}

// 把会谈时长（秒）格式化为可读文本，避免显示裸数字
function fmtDuration(sec?: number) {
  if (!sec && sec !== 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

const CUST_GENDERS = ['女', '男']
const CUST_STAGES = [
  { key: 'new', label: '新客' },
  { key: 'intent', label: '意向' },
  { key: 'deal', label: '已成交' },
  { key: 'regular', label: '老客' },
  { key: 'churn_risk', label: '流失风险' },
]
const CUST_STAGE_LABEL: Record<string, string> = Object.fromEntries(CUST_STAGES.map((s) => [s.key, s.label]))

// 占位客户：无有效手机号（与客户页 isPlaceholder 一致）。列表侧用"新客户"前缀快速判断，
// 与后端 MeetingController 判定占位客户（name.startsWith("新客户")）一致。
function isPlaceholderName(name?: string) {
  return !name || String(name).startsWith('新客户')
}

export default function Meeting() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [scenes, setScenes] = useState<{ code: string; label: string }[]>(SCENE_FALLBACK)

  // 快速会谈设置
  const [custType, setCustType] = useState<'new' | 'existing'>('new')
  const [custName, setCustName] = useState('')
  const [custId, setCustId] = useState('')
  const [scene, setScene] = useState('')
  const [consent, setConsent] = useState(false)
  const [showCustPicker, setShowCustPicker] = useState(false)
  // 会谈卡片内联编辑客户资料（参照客户页）：editingId 非空时展开对应会谈卡片的编辑面板
  const [editingId, setEditingId] = useState('')
  const [custForm, setCustForm] = useState({ name: '', phone: '', gender: '', age: '', birthday: '', stage: '' })
  const [custSaving, setCustSaving] = useState(false)
  // 同名客户识别（到店客户消歧）
  const [identifyKw, setIdentifyKw] = useState('')
  const [identifyList, setIdentifyList] = useState<any[]>([])
  const [identifyLoading, setIdentifyLoading] = useState(false)

  // 录音状态
  const recorderRef = useRef<any>(null)
  const timerRef = useRef<any>(null)
  const durationRef = useRef(0) // 记录累计录制秒数，上传时传给后端
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [seconds, setSeconds] = useState(0)

  useDidShow(() => {
    setActiveTab(0)
    if (isLoggedIn()) loadAll()
  })

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  usePullDownRefresh(() => {
    loadAll()
  })

  async function loadAll() {
    load()
    const [c, s] = await Promise.all([customerApi.list(), meetingApi.scenes()])
    if (c.ok) setCustomers(c.data || [])
    if (s.ok && Array.isArray(s.data) && s.data.length > 0) {
      // 后端返回 [{code, display_name, sort_order}]，统一映射为 {code, label}
      setScenes(
        s.data.map((item: any) => ({
          code: String(item.code || ''),
          label: String(item.display_name || item.code || ''),
        }))
      )
    }
    setScene((prev) => prev || scenes[0].code)
  }

  async function load() {
    setLoading(true)
    const r = await meetingApi.list()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  // ---- 录音 ----
  function startRec() {
    if (recording) {
      Taro.showToast({ title: '正在录音中…', icon: 'none' })
      return
    }
    if (!consent) {
      Taro.showToast({ title: '请先勾选已获客户同意', icon: 'none' })
      return
    }
    if (custType === 'existing' && !custId) {
      Taro.showToast({ title: '请选择客户', icon: 'none' })
      return
    }
    Taro.showLoading({ title: '准备录音…', mask: false })

    // 开发者工具模拟器 authorize 弹窗可能不出现导致 promise 卡死，用超时兜底
    const authorize = () =>
      Promise.race([
        Taro.authorize({ scope: 'scope.record' }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('authorize_timeout')), 4000)
        ),
      ])

    Taro.getSetting()
      .then((s: any) => {
        const granted = s?.authSetting?.['scope.record']
        if (granted === false) {
          // 已被用户拒绝过：引导去设置开启
          Taro.hideLoading()
          Taro.showModal({
            title: '需要麦克风权限',
            content: '录音需要麦克风权限，用于记录会谈内容并交给 AI 分析。请在设置中允许使用麦克风。',
            confirmText: '去设置',
            cancelText: '暂不',
            success: (r) => {
              if (r.confirm) Taro.openSetting()
            },
          })
          return null
        }
        if (granted === true) {
          // 已授权过：直接开始
          return authorize()
        }
        // 首次使用（从未询问）：先说明用途，用户确认后再触发系统授权弹窗
        return new Promise<void>((resolve, reject) => {
          Taro.showModal({
            title: '使用麦克风',
            content: '录音用于记录与客户的会谈内容，并经语音识别生成逐字稿和 AI 分析。是否允许使用麦克风？',
            confirmText: '允许',
            cancelText: '暂不',
            confirmColor: '#008448',
            success: (r) => {
              if (r.confirm) resolve()
              else reject(new Error('auth_canceled'))
            },
            fail: () => reject(new Error('auth_canceled')),
          })
        }).then(() => authorize())
      })
      .then(() => {
        Taro.hideLoading()
        const rm = Taro.getRecorderManager()
        recorderRef.current = rm
        const startTimer = () => {
          if (timerRef.current) clearInterval(timerRef.current)
          durationRef.current = 0
          setSeconds(0)
          timerRef.current = setInterval(() => {
            durationRef.current += 1
            setSeconds(durationRef.current)
          }, 1000)
        }
        rm.onStart(() => {
          setRecording(true)
          setPaused(false)
          startTimer()
        })
        rm.onStop((res) => {
          setRecording(false)
          setPaused(false)
          if (timerRef.current) clearInterval(timerRef.current)
          if (res.tempFilePath) submitAudio(res.tempFilePath, durationRef.current)
        })
        rm.onError((err) => {
          setRecording(false)
          setPaused(false)
          if (timerRef.current) clearInterval(timerRef.current)
          const msg =
            err?.errMsg && err.errMsg.indexOf('deny') >= 0
              ? '麦克风权限被拒绝'
              : '录音出错，请重试'
          Taro.showToast({ title: msg, icon: 'none' })
        })
        try {
          rm.start({ duration: 600000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'mp3' })
          // 立即进入录音态（不依赖 onStart 回调——真机调试模式下 onStart 可能不触发，
          // 只等回调会导致点击后 UI 无任何变化，看起来"没反应"）
          setRecording(true)
          setPaused(false)
          if (timerRef.current) clearInterval(timerRef.current)
          durationRef.current = 0
          setSeconds(0)
          timerRef.current = setInterval(() => {
            durationRef.current += 1
            setSeconds(durationRef.current)
          }, 1000)
          Taro.showToast({ title: '录音中…', icon: 'none' })
        } catch (e) {
          setRecording(false)
          Taro.showToast({ title: '录音启动失败，请检查麦克风', icon: 'none' })
        }
      })
      .catch((err) => {
        Taro.hideLoading()
        const msg = err?.message
        if (msg === 'auth_canceled') {
          Taro.showToast({ title: '已取消录音', icon: 'none' })
        } else if (msg === 'authorize_timeout') {
          Taro.showToast({ title: '未获得麦克风授权', icon: 'none' })
        } else if (msg && msg.indexOf('deny') >= 0) {
          // 用户在系统弹窗里拒绝了授权：引导去设置开启
          Taro.showModal({
            title: '需要麦克风权限',
            content: '录音需要麦克风权限。请在设置中允许使用麦克风后再试。',
            confirmText: '去设置',
            cancelText: '暂不',
            success: (r) => {
              if (r.confirm) Taro.openSetting()
            },
          })
        } else {
          Taro.showToast({ title: '需要麦克风权限', icon: 'none' })
        }
      })
  }

  function togglePause() {
    const rm = recorderRef.current
    if (!rm) return
    if (paused) {
      rm.resume()
      setPaused(false)
    } else {
      rm.pause()
      setPaused(true)
    }
  }

  function stopRec() {
    const rm = recorderRef.current
    if (rm) rm.stop()
  }

  async function submitAudio(path: string, durationSec = 0) {
    const body: any = { scene: scene || scenes[0].code, consent }
    if (custType === 'existing') body.customerId = custId
    else body.customerName = custName || `新客户 ${fmtNow()}`
    Taro.showLoading({ title: '创建会谈并上传录音…', mask: true })
    const r = await meetingApi.create(body)
    if (!r.ok) {
      Taro.hideLoading()
      Taro.showToast({ title: r.error || '创建失败', icon: 'none' })
      return
    }
    const id = r.data?.id || r.data?.meetingId
    if (id) {
      const up = await meetingApi.uploadAudio(id, path, durationSec)
      Taro.hideLoading()
      if (!up.ok) {
        Taro.showToast({ title: up.error || '上传失败', icon: 'none' })
        resetForm()
        load()
        const modal = await Taro.showModal({
          title: '录音尚未上传',
          content: '会谈已保留。请进入详情重新选择录音上传，无需重新创建会谈。',
          confirmText: '去处理',
          confirmColor: '#008448',
        })
        if (modal.confirm) Taro.navigateTo({ url: `/pages/meeting-detail/index?id=${id}` })
        return
      }
      Taro.showToast({ title: '上传成功，开始转写', icon: 'none' })
    } else {
      Taro.hideLoading()
      Taro.showToast({ title: '会谈已创建', icon: 'none' })
    }
    resetForm()
    load()
  }

  async function uploadFile() {
    if (recording) {
      Taro.showToast({ title: '请先结束录音', icon: 'none' })
      return
    }
    if (!consent) {
      Taro.showToast({ title: '请先勾选已获客户同意', icon: 'none' })
      return
    }
    const res = await Taro.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['mp3', 'wav', 'm4a', 'aac', 'amr'],
    })
    if (!res.tempFiles || !res.tempFiles.length) return
    await submitAudio(res.tempFiles[0].path)
  }

  function resetForm() {
    setCustName('')
    setCustId('')
    setConsent(false)
  }

  function selectCust(c: any) {
    setCustId(c.id)
    setCustName(c.name)
    setShowCustPicker(false)
  }

  // 按客户类型（新/老）筛选会谈场景
  const visibleScenes = scenes.filter((s) => {
    const t = SCENE_TYPE[s.code] || 'both'
    return t === 'both' || t === custType
  })

  // 切换新老客户：场景列表随之切换，并自动选中该类第一个场景
  function switchCustType(t: 'new' | 'existing') {
    setCustType(t)
    const next = scenes.filter((s) => {
      const st = SCENE_TYPE[s.code] || 'both'
      return st === 'both' || st === t
    })
    if (next.length > 0) setScene(next[0].code)
  }

  // 到店识别：按手机号/姓名查找客户，展示负责人/到店/最近会谈等消歧信息
  async function doIdentify() {
    const kw = identifyKw.trim()
    if (!kw) {
      Taro.showToast({ title: '请输入手机号或姓名', icon: 'none' })
      return
    }
    setIdentifyLoading(true)
    const r = await customerApi.identify(kw)
    setIdentifyLoading(false)
    if (r.ok) setIdentifyList(r.data || [])
    else setIdentifyList([])
  }

  async function delMeeting(m: any) {
    const modal = await Taro.showModal({
      title: '删除会谈',
      content: '删除后不可恢复，确定删除？',
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    const r = await meetingApi.delete(m.id)
    Taro.showToast({ title: r.ok ? '已删除' : r.error || '删除失败', icon: 'none' })
    if (r.ok) load()
  }

  // 会谈卡片：编辑客户资料（展开内联面板，参照客户页）。先加载客户档案回填表单。
  async function editMeetingCustomer(m: any) {
    if (editingId === m.id) {
      setEditingId('')
      return
    }
    const cid = m.customer_id || m.customerId
    if (!cid) {
      Taro.showToast({ title: '暂无可编辑的客户档案', icon: 'none' })
      return
    }
    const r = await customerApi.detail(cid)
    const c = r.ok ? (r.data || {}) : {}
    const birthday = c.birthday || c.birth_date || ''
    setCustForm({
      name: c.name || m.customerName || m.customer_name || '',
      phone: c.phone || '',
      gender: c.gender === 'female' ? '女' : c.gender === 'male' ? '男' : '',
      age: c.age ? String(c.age) : '',
      birthday: birthday ? String(birthday).slice(0, 10) : '',
      stage: c.stage || '',
    })
    setEditingId(m.id)
  }

  // 保存会谈关联客户的资料（改客户档案，改名时后端自动同步会谈 customer_name）
  async function saveMeetingCustomer(m: any) {
    const name = custForm.name.trim()
    if (!name) {
      Taro.showToast({ title: '姓名不能为空', icon: 'none' })
      return
    }
    if (custForm.phone && !/^1\d{10}$/.test(custForm.phone)) {
      Taro.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    const cid = m.customer_id || m.customerId
    if (!cid) return
    setCustSaving(true)
    const payload: any = {
      name,
      phone: custForm.phone || null,
      gender: custForm.gender === '男' ? 'male' : custForm.gender === '女' ? 'female' : null,
      age: custForm.age ? Number(custForm.age) : null,
      birthday: custForm.birthday || null,
      stage: custForm.stage || null,
    }
    const ur = await customerApi.update(cid, payload)
    setCustSaving(false)
    if (ur.ok) {
      Taro.showToast({ title: '已保存', icon: 'none' })
      setEditingId('')
      load()
    } else {
      Taro.showToast({ title: ur.error || '保存失败', icon: 'none' })
    }
  }

  // 绑定已有客户：与客户页绑定同一逻辑 —— 把占位"新客户"档案合并进选中的正式客户，
  // 迁移其全部业务数据（会谈/任务/记忆/互动时间线）到正式客户，再删除占位档案本身。
  // 当前会谈（customer_id = 占位客户）也会自动跟随迁移到正式客户，不会丢失。
  async function bindMeetingCustomer(m: any) {
    const sourceId = m.customer_id || m.customerId
    if (!sourceId) {
      Taro.showToast({ title: '暂无可绑定的客户档案', icon: 'none' })
      return
    }
    const r = await customerApi.list()
    const all = r.ok ? (r.data || []) : []
    // 绑定目标必须是正式客户：有有效手机号，且排除占位客户（"新客户"前缀）
    const targets = all.filter(
      (x: any) =>
        x.id !== sourceId &&
        x.phone &&
        /^1\d{10}$/.test(String(x.phone)) &&
        !String(x.name || '').startsWith('新客户')
    )
    if (targets.length === 0) {
      Taro.showToast({ title: '暂无可绑定的正式客户', icon: 'none' })
      return
    }
    const options = targets.map((x: any) => `${x.name}${x.phone ? `（尾号${String(x.phone).slice(-4)}）` : ''}`)
    const sel = await Taro.showActionSheet({ itemList: options.slice(0, 6), itemColor: '#008448' })
    if (sel.errMsg && !sel.errMsg.includes('ok')) return
    const target = targets[sel.tapIndex]
    if (!target) return
    const confirm = await Taro.showModal({
      title: '绑定到正式客户',
      content: `将把当前客户「${m.customerName || m.customer_name || '新客户'}」的会谈、任务、记忆和时间线并入「${target.name}」，并删除该占位档案。此操作不可撤销。`,
      confirmText: '确认绑定',
      confirmColor: '#d94b3d',
    })
    if (!confirm.confirm) return
    Taro.showLoading({ title: '绑定中…' })
    const mr = await customerApi.merge(target.id, sourceId)
    Taro.hideLoading()
    Taro.showToast({ title: mr.ok ? `已绑定到「${target.name}」` : mr.error || '绑定失败', icon: 'none' })
    if (mr.ok) {
      setEditingId('')
      load()
    }
  }

  return (
    <View className="page meeting-page">
      {/* 快速会谈设置卡 */}
      <View className="ref-card rec-card">
        <Text className="rec-title">快速会谈</Text>

        <View className="cust-type-row">
          <View className={`type-btn${custType === 'new' ? ' active' : ''}`} onClick={() => switchCustType('new')}>
            新客户
          </View>
          <View className={`type-btn${custType === 'existing' ? ' active' : ''}`} onClick={() => switchCustType('existing')}>
            已有客户
          </View>
        </View>

        {custType === 'new' ? (
          <Input
            className="ref-field cust-name-input"
            placeholder="客户姓名（留空自动生成）"
            placeholderClass="ref-field-placeholder"
            value={custName}
            onInput={(e) => setCustName(e.detail.value)}
          />
        ) : (
          <View className="pick-btn" onClick={() => setShowCustPicker(!showCustPicker)}>
            <Text>{custId ? customers.find((c) => c.id === custId)?.name || custName : '选择已有客户'}</Text>
            <Text className="pick-arrow">▾</Text>
          </View>
        )}
        {showCustPicker && custType === 'existing' ? (
          <View className="cust-picker-wrap">
            {/* 同名客户识别：输入手机号/姓名精确找到目标客户，避免选错 */}
            <View className="identify-bar">
              <Input
                className="identify-input"
                placeholder="输手机号/姓名识别客户"
                placeholderClass="ref-field-placeholder"
                value={identifyKw}
                onInput={(e) => {
                  setIdentifyKw(e.detail.value)
                  if (!e.detail.value.trim()) setIdentifyList([])
                }}
                confirmType="search"
                onConfirm={doIdentify}
              />
              <View className="identify-btn" onClick={doIdentify}>
                {identifyLoading ? '识别中' : '识别'}
              </View>
            </View>
            {identifyList.length > 0 ? (
              <ScrollView scrollY className="identify-list">
                {identifyList.map((c) => (
                  <View key={c.id} className="identify-item" onClick={() => selectCust(c)}>
                    <View className="identify-head">
                      <Text className="identify-name">{c.name}</Text>
                      <Text className="identify-phone">尾号 {String(c.phone || '').slice(-4)}</Text>
                      {c.checked_in_today ? <Text className="ref-status ref-status-green">今日已到</Text> : null}
                    </View>
                    {c.assigned_to_name ? <Text className="identify-meta">负责人：{c.assigned_to_name}</Text> : null}
                    {c.last_checkin_at ? <Text className="identify-meta">最近到店：{fmtDate(c.last_checkin_at)}</Text> : null}
                    {c.latest_meeting_summary ? (
                      <Text className="identify-summary">最近会谈：{c.latest_meeting_summary}</Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <ScrollView scrollY className="cust-picker">
              <Text className="picker-hint">或从列表选择</Text>
              {customers.length === 0 ? (
                <Text className="picker-empty">暂无客户</Text>
              ) : (
                customers.map((c) => (
                  <View key={c.id} className="picker-item" onClick={() => selectCust(c)}>
                    {c.name}
                    <Text className="picker-sub">尾号 {String(c.phone || '').slice(-4)}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        ) : null}

        <View className="scene-label">会谈场景{custType === 'existing' ? '（老客）' : '（新客）'}</View>
        <View className="scene-chips">
          {visibleScenes.map((s) => (
            <View
              key={s.code}
              className={`scene-chip${(scene || visibleScenes[0].code) === s.code ? ' active' : ''}`}
              onClick={() => setScene(s.code)}
            >
              {s.label}
            </View>
          ))}
        </View>

        <View className="consent-row" onClick={() => setConsent(!consent)}>
          <View className={`checkbox${consent ? ' checked' : ''}`}>{consent ? '✓' : ''}</View>
          <Text className="consent-text">已向客户告知并获得同意</Text>
        </View>

        <View className={`ref-primary rec-start${recording ? ' recording' : ''}`} onClick={startRec}>
          <Icon svg={ICN.mic('#fff')} size={32} />
          <Text>{recording ? '录音中…' : '开始录音会谈'}</Text>
        </View>
        <View className={`rec-upload${recording ? ' rec-upload-disabled' : ''}`} onClick={uploadFile}>
          {recording ? '录音中，暂不可上传文件' : '上传已有录音转写'}
        </View>
      </View>

      {/* 录音状态横幅 */}
      {recording ? (
        <View className="rec-banner">
          <View className="rec-dot" />
          <Text className="rec-time">
            {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}
          </Text>
          <View className="rec-btns">
            <View className="rec-btn" onClick={togglePause}>
              {paused ? '继续' : '暂停'}
            </View>
            <View className="rec-btn rec-btn-stop" onClick={stopRec}>
              结束
            </View>
          </View>
        </View>
      ) : null}

      {/* 近期会谈 */}
      <View className="section-title">
        <Text>近期会谈</Text>
        <Text className="section-sub">共 {list.length} 条</Text>
      </View>

      {loading ? (
        <View className="ref-skeleton meet-skeleton" />
      ) : list.length === 0 ? (
        <View className="ref-empty">暂无会谈记录</View>
      ) : (
        list.map((m, i) => {
          const st = statusOf(m)
          return (
            <View
              className="ref-card meet-item"
              key={m.id || i}
              onClick={() => Taro.navigateTo({ url: `/pages/meeting-detail/index?id=${m.id || ''}` })}
            >
              <View className="meet-head">
                <View className="meet-dot" style={{ backgroundColor: st.color }} />
                <Text className="meet-customer">{m.customerName || m.customer_name || '客户会谈'}</Text>
                {m.scene ? <Text className="meet-scene">{sceneLabel(m.scene)}</Text> : null}
                <Text className={`ref-status ${st.tag}`}>{st.label}</Text>
              </View>
              <View className="meet-meta">
                {m.qualityScore != null || m.quality_score != null ? (
                  <Text className="meet-score">{m.qualityScore ?? m.quality_score} 分</Text>
                ) : null}
                {m.qualityScore != null || m.quality_score != null ? (
                  <Text className="meet-meta-sep">·</Text>
                ) : null}
                <Text className="meet-time">{fmtDuration(m.duration)}</Text>
                <View className="meet-ops">
                  {isPlaceholderName(m.customerName || m.customer_name) ? (
                    <Text
                      className="meet-op"
                      onClick={(e) => {
                        e.stopPropagation()
                        bindMeetingCustomer(m)
                      }}
                    >
                      绑定客户
                    </Text>
                  ) : null}
                  <Text
                    className="meet-op"
                    onClick={(e) => {
                      e.stopPropagation()
                      editMeetingCustomer(m)
                    }}
                  >
                    编辑
                  </Text>
                  <Text
                    className="meet-del"
                    onClick={(e) => {
                      e.stopPropagation()
                      delMeeting(m)
                    }}
                  >
                    删除
                  </Text>
                </View>
              </View>

              {/* 内联编辑客户资料（参照客户页） */}
              {editingId === m.id ? (
                <View className="meet-cust-edit" onClick={(e) => e.stopPropagation()}>
                  <Text className="ce-title">编辑客户资料</Text>
                  <View className="ce-field">
                    <Text className="ce-k">姓名</Text>
                    <Input
                      className="ce-input"
                      value={custForm.name}
                      onInput={(e) => setCustForm({ ...custForm, name: e.detail.value })}
                      placeholder="客户姓名"
                      placeholderClass="ref-field-placeholder"
                      maxlength={20}
                    />
                  </View>
                  <View className="ce-field">
                    <Text className="ce-k">手机号</Text>
                    <Input
                      className="ce-input"
                      value={custForm.phone}
                      onInput={(e) => setCustForm({ ...custForm, phone: e.detail.value })}
                      placeholder="11 位手机号"
                      placeholderClass="ref-field-placeholder"
                      type="number"
                      maxlength={11}
                    />
                  </View>
                  <View className="ce-field">
                    <Text className="ce-k">性别</Text>
                    <Picker
                      mode="selector"
                      range={CUST_GENDERS}
                      value={CUST_GENDERS.indexOf(custForm.gender) < 0 ? -1 : CUST_GENDERS.indexOf(custForm.gender)}
                      onChange={(e) => setCustForm({ ...custForm, gender: CUST_GENDERS[Number(e.detail.value)] || '' })}
                    >
                      <View className="ce-input ce-picker">{custForm.gender || '选择性别'}</View>
                    </Picker>
                  </View>
                  <View className="ce-field">
                    <Text className="ce-k">生日</Text>
                    <Picker
                      mode="date"
                      start="1900-01-01"
                      end={new Date().toISOString().slice(0, 10)}
                      value={custForm.birthday || '2000-01-01'}
                      onChange={(e) => {
                        const bd = e.detail.value
                        setCustForm((f) => ({ ...f, birthday: bd, age: ageFromBirthday(bd) || f.age }))
                      }}
                    >
                      <View className="ce-input ce-picker">{custForm.birthday || '选择生日'}</View>
                    </Picker>
                  </View>
                  <View className="ce-field">
                    <Text className="ce-k">年龄</Text>
                    <Input
                      className="ce-input"
                      value={custForm.age}
                      onInput={(e) => setCustForm({ ...custForm, age: e.detail.value.replace(/\D/g, '') })}
                      onBlur={() => {
                        // 输入年龄后自动补生日（仅定年份，月日取 1 月 1 日，可再细化）
                        if (custForm.age && !custForm.birthday) {
                          setCustForm((f) => ({ ...f, birthday: birthdayFromAge(f.age) }))
                        }
                      }}
                      placeholder="如 35"
                      placeholderClass="ref-field-placeholder"
                      type="number"
                      maxlength={3}
                    />
                  </View>
                  <View className="ce-field">
                    <Text className="ce-k">客户阶段</Text>
                    <Picker
                      mode="selector"
                      range={CUST_STAGES.map((s) => s.label)}
                      value={CUST_STAGES.findIndex((s) => s.key === custForm.stage)}
                      onChange={(e) =>
                        setCustForm({ ...custForm, stage: CUST_STAGES[Number(e.detail.value)]?.key || '' })
                      }
                    >
                      <View className="ce-input ce-picker">
                        {CUST_STAGE_LABEL[custForm.stage] || '选择客户阶段'}
                      </View>
                    </Picker>
                  </View>
                  <View className="ce-actions">
                    <View className="ref-btn-sm ref-btn-sm-plain" onClick={() => setEditingId('')}>
                      取消
                    </View>
                    <View
                      className={`ref-btn-sm ref-btn-sm-primary${custSaving ? ' disabled' : ''}`}
                      onClick={() => saveMeetingCustomer(m)}
                    >
                      {custSaving ? '保存中…' : '保存'}
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          )
        })
      )}
    </View>
  )
}
