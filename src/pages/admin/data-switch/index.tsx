import { useEffect, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { dataResetApi } from '@/utils/api'
import { getUserInfo, isLoggedIn } from '@/utils/auth'
import './index.scss'

export default function DataSwitch() {
  const user = getUserInfo()
  const isOwner = !!user && (user.role === 'owner' || user.role === 'super_admin')
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<any>(null)
  const [backups, setBackups] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [dlBusy, setDlBusy] = useState('')
  const [confirm, setConfirm] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (!isOwner) {
      setLoading(false)
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePullDownRefresh(() => {
    load()
  })

  async function load() {
    setLoading(true)
    const [r1, r2] = await Promise.all([dataResetApi.preview(), dataResetApi.backups()])
    if (r1.ok) setPreview(r1.data)
    else Taro.showToast({ title: r1.error || '预览加载失败', icon: 'none' })
    if (r2.ok) setBackups(r2.data || [])
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  // 下载备份文件
  async function download(b: any) {
    if (dlBusy) return
    setDlBusy(b.fileName)
    const r = await dataResetApi.download(b.fileName)
    setDlBusy('')
    if (r.ok) {
      Taro.showToast({ title: '已打开备份文件，可预览或另存', icon: 'none' })
    } else {
      Taro.showToast({ title: r.error || '下载失败', icon: 'none' })
    }
  }

  // 生成本地备份
  async function doBackup() {
    if (busy) return
    setBusy(true)
    const r = await dataResetApi.backup()
    setBusy(false)
    if (r.ok) {
      Taro.showToast({ title: '已生成本地备份', icon: 'success' })
      setResult({ type: 'backup', data: r.data })
    } else {
      Taro.showToast({ title: r.error || '备份失败', icon: 'none' })
    }
  }

  // 清空经营数据
  async function doClear() {
    const phrase = preview?.confirmationPhrase || '清空本店经营数据'
    if (confirm.trim() !== phrase) {
      Taro.showToast({ title: '请输入准确的确认词', icon: 'none' })
      return
    }
    const modal = await Taro.showModal({
      title: '确认清空经营数据',
      content: '系统会先自动生成备份，再删除当前门店全部经营数据。该操作不可恢复，请确认。',
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    setBusy(true)
    const r = await dataResetApi.clear(confirm.trim())
    setBusy(false)
    if (r.ok) {
      Taro.showToast({ title: '经营数据已清空', icon: 'success' })
      setResult({ type: 'clear', data: r.data })
      load()
      setConfirm('')
    } else {
      Taro.showToast({ title: r.error || '清空失败', icon: 'none' })
    }
  }

  if (!user || !isOwner) {
    return (
      <View className="page data-switch-page">
        <View className="ref-empty">仅老板可执行数据切换</View>
        <View className="ref-primary back-btn" onClick={() => Taro.navigateBack()}>返回</View>
      </View>
    )
  }

  const counts = preview?.counts || {}
  const countEntries = Object.entries(counts)

  return (
    <View className="page data-switch-page">
      <View className="page-header">
        <Text>数据切换</Text>
      </View>

      <View className="banner-card">
        <Text className="banner-title">先备份，再导入真实门店数据</Text>
        <Text className="banner-sub">切换前请生成本地备份；切换后原演示数据将被清空。</Text>
      </View>

      {/* 数据预览 */}
      <View className="section-title">
        <Text>数据预览</Text>
        {preview ? <Text className="section-sub">共 {preview.totalRows || 0} 条</Text> : null}
      </View>
      {loading ? (
        <View className="ref-skeleton preview-skeleton" />
      ) : (
        <View className="ref-card preview-card">
          {countEntries.length === 0 ? (
            <Text className="ref-empty">暂无经营数据</Text>
          ) : (
            countEntries.map(([label, count]) => (
              <View className="pv-row" key={label}>
                <Text className="pv-label">{label}</Text>
                <Text className="pv-count">{String(count)}</Text>
              </View>
            ))
          )}
          {preview?.preservedData?.length ? (
            <View className="pv-preserve">
              <Text className="pv-preserve-title">始终保留（不清空）</Text>
              {preview.preservedData.map((p: string, i: number) => (
                <Text className="pv-preserve-item" key={i}>{p}</Text>
              ))}
            </View>
          ) : null}
        </View>
      )}

      {/* 生成本地备份 */}
      <View className="section-title">
        <Text>生成本地备份</Text>
      </View>
      <View className="ref-card act-card">
        <Text className="act-desc">
          把当前门店全部经营数据导出为 JSON 备份文件，保存到本机「{preview?.backupLocation || '文稿/门店AI助手备份'}」。
        </Text>
        <View className={`ref-primary act-btn${busy ? ' disabled' : ''}`} onClick={doBackup}>
          {busy ? '生成中…' : '生成本地备份'}
        </View>
        {result?.type === 'backup' && result.data ? (
          <View className="result-box">
            <Text className="result-line">备份文件：{result.data.fileName}</Text>
            <Text className="result-line">共 {result.data.totalRows} 条记录</Text>
          </View>
        ) : null}
      </View>

      {/* 备份文件列表 + 下载 */}
      {backups.length > 0 ? (
        <>
          <View className="section-title">
            <Text>已生成的备份</Text>
            <Text className="section-sub">共 {backups.length} 份</Text>
          </View>
          <View className="ref-card backups-card">
            {backups.map((b, i) => (
              <View className="backup-row" key={b.fileName || i}>
                <View className="backup-main">
                  <Text className="backup-name">{b.fileName}</Text>
                  <Text className="backup-meta">{b.sizeBytes ? `${(b.sizeBytes / 1024).toFixed(1)}KB` : ''}</Text>
                </View>
                <View
                  className={`ref-btn-sm ref-btn-sm-ghost${dlBusy === b.fileName ? ' disabled' : ''}`}
                  onClick={() => download(b)}
                >
                  {dlBusy === b.fileName ? '下载中…' : '下载'}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* 清空经营数据 */}
      <View className="section-title">
        <Text>清空经营数据</Text>
        <Text className="section-sub">仅老板 · 高危</Text>
      </View>
      <View className="ref-card act-card danger">
        <Text className="act-desc">
          先自动备份，再删除当前门店客户、会谈、任务、AI 对话与经营记录等全部经营数据。需输入确认词
          「{preview?.confirmationPhrase || '清空本店经营数据'}」。
        </Text>
        <Input
          className="ref-field confirm-input"
          placeholder={preview?.confirmationPhrase || '清空本店经营数据'}
          placeholderClass="ref-field-placeholder"
          value={confirm}
          onInput={(e) => setConfirm(e.detail.value)}
        />
        <View className={`ref-primary act-btn danger-btn${busy ? ' disabled' : ''}`} onClick={doClear}>
          {busy ? '处理中…' : '备份并清空经营数据'}
        </View>
        {result?.type === 'clear' && result.data ? (
          <View className="result-box">
            <Text className="result-line">已备份：{result.data.backup?.fileName}</Text>
            <Text className="result-line">已清空 {result.data.totalRows} 条经营数据</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
