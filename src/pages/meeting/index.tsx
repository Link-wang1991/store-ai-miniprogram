import { useEffect, useRef, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { usePullDownRefresh, useDidShow } from '@tarojs/taro'
import { meetingApi, customerApi } from '@/utils/api'
import { isLoggedIn } from '@/utils/auth'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import './index.scss'

const SCENE_FALLBACK = ['新客咨询', '护理服务', '成交沟通', '复购回访']

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
  const [scenes, setScenes] = useState<string[]>(SCENE_FALLBACK)

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
    try {
      Taro.getTabBar(Taro.getCurrentInstance().page)?.setSelected?.(0)
    } catch {}
  })

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    loadAll()
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
    if (s.ok && Array.isArray(s.data) && s.data.length > 0) setScenes(s.data)
    setScene((prev) => prev || SCENE_FALLBACK[0])
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
    if (!consent) {
      Taro.showToast({ title: '请先勾选已获客户同意', icon: 'none' })
      return
    }
    if (custType === 'existing' && !custId) {
      Taro.showToast({ title: '请选择客户', icon: 'none' })
      return
    }
    Taro.authorize({ scope: 'scope.record' })
      .then(() => {
        const rm = Taro.getRecorderManager()
        recorderRef.current = rm
        rm.onStop((res) => {
          setRecording(false)
          setPaused(false)
          setSeconds(0)
          if (timerRef.current) clearInterval(timerRef.current)
          if (res.tempFilePath) submitAudio(res.tempFilePath)
        })
        rm.onError(() => {
          setRecording(false)
          setPaused(false)
          if (timerRef.current) clearInterval(timerRef.current)
          Taro.showToast({ title: '录音出错，请重试', icon: 'none' })
        })
        rm.start({ duration: 600000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'mp3' })
        setRecording(true)
        setPaused(false)
        setSeconds(0)
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
      })
      .catch(() => Taro.showToast({ title: '需要麦克风权限', icon: 'none' }))
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
    const body: any = { scene: scene || scenes[0], consent }
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
      Taro.showToast({ title: up.ok ? '上传成功，开始转写' : up.error || '上传失败', icon: 'none' })
    } else {
      Taro.hideLoading()
      Taro.showToast({ title: '会谈已创建', icon: 'none' })
    }
    resetForm()
    load()
  }

  async function uploadFile() {
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
              key={s}
              className={`scene-chip${(scene || scenes[0]) === s ? ' active' : ''}`}
              onClick={() => setScene(s)}
            >
              {s}
            </View>
          ))}
        </View>

        <View className="consent-row" onClick={() => setConsent(!consent)}>
          <View className={`checkbox${consent ? ' checked' : ''}`}>{consent ? '✓' : ''}</View>
          <Text className="consent-text">已向客户告知并获得同意</Text>
        </View>

        <View className={`ref-primary rec-start${recording ? ' recording' : ''}`} onClick={startRec}>
          <Icon svg={ICN.mic('#fff')} size={32} />
          <Text>开始录音会谈</Text>
        </View>
        <View className="rec-upload" onClick={uploadFile}>
          上传已有录音转写
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
                {m.scene ? <Text className="meet-scene">{m.scene}</Text> : null}
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
