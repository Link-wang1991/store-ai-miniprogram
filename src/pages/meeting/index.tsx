import { useEffect, useRef, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { usePullDownRefresh, useDidShow } from '@tarojs/taro'
import { meetingApi, customerApi } from '@/utils/api'
import { isLoggedIn } from '@/utils/auth'
import { sceneLabel, MEETING_SCENES } from '@/utils/scenes'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import { setActiveTab } from '@/utils/ui'
import './index.scss'

// 场景兜底：{code, label}，后端 /api/meetings/scenes 返回的是对象数组（含 code/display_name/sort_order）
const SCENE_FALLBACK = MEETING_SCENES.map(([code, label]) => ({ code, label }))

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

  // 录音状态
  const recorderRef = useRef<any>(null)
  const timerRef = useRef<any>(null)
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
          Taro.hideLoading()
          Taro.showModal({
            title: '需要麦克风权限',
            content: '请在设置中允许使用麦克风后重试',
            confirmText: '去设置',
            success: (r) => {
              if (r.confirm) Taro.openSetting()
            },
          })
          return null
        }
        return authorize()
      })
      .then(() => {
        Taro.hideLoading()
        const rm = Taro.getRecorderManager()
        recorderRef.current = rm
        rm.onStart(() => {
          setRecording(true)
          setPaused(false)
          setSeconds(0)
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
        })
        rm.onStop((res) => {
          setRecording(false)
          setPaused(false)
          setSeconds(0)
          if (timerRef.current) clearInterval(timerRef.current)
          if (res.tempFilePath) submitAudio(res.tempFilePath)
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
          setSeconds(0)
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
          Taro.showToast({ title: '录音中…', icon: 'none' })
        } catch (e) {
          setRecording(false)
          Taro.showToast({ title: '录音启动失败，请检查麦克风', icon: 'none' })
        }
      })
      .catch((err) => {
        Taro.hideLoading()
        const msg = err?.message === 'authorize_timeout' ? '未获得麦克风授权' : '需要麦克风权限'
        Taro.showToast({ title: msg, icon: 'none' })
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

  async function submitAudio(path: string) {
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
      const up = await meetingApi.uploadAudio(id, path)
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

  return (
    <View className="page meeting-page">
      {/* 快速会谈设置卡 */}
      <View className="ref-card rec-card">
        <Text className="rec-title">快速会谈</Text>

        <View className="cust-type-row">
          <View className={`type-btn${custType === 'new' ? ' active' : ''}`} onClick={() => setCustType('new')}>
            新客户
          </View>
          <View className={`type-btn${custType === 'existing' ? ' active' : ''}`} onClick={() => setCustType('existing')}>
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
          <ScrollView scrollY className="cust-picker">
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
        ) : null}

        <View className="scene-label">会谈场景</View>
        <View className="scene-chips">
          {scenes.map((s) => (
            <View
              key={s.code}
              className={`scene-chip${(scene || scenes[0].code) === s.code ? ' active' : ''}`}
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
                <Text className={`ref-status ${st.tag}`}>{st.label}</Text>
              </View>
              <View className="meet-meta">
                {m.scene ? <Text className="meet-scene">{sceneLabel(m.scene)}</Text> : null}
                {m.quality_score != null ? <Text className="meet-score">{m.quality_score} 分</Text> : null}
                <Text className="meet-time">{m.ended_at || m.duration || ''}</Text>
              </View>
              {['analyzing', 'transcribing', 'processing', 'submitting'].includes(
                String(m.status || '').toLowerCase()
              ) ? (
                <View className="progress-track">
                  <View className="progress-bar" />
                </View>
              ) : null}
              {String(m.status || '').toLowerCase() === 'failed' && m.error ? (
                <Text className="meet-fail">{m.error}</Text>
              ) : null}
              <View className="meet-ops">
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
          )
        })
      )}
    </View>
  )
}
