import { useEffect, useState } from 'react'
import { View, Text, Input, Textarea, Picker } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { knowledgeAdminApi } from '@/utils/api'
import { isLoggedIn } from '@/utils/auth'
import { fmtDate } from '@/utils/format'
import Icon from '@/components/Icon'
import { ICN } from '@/utils/icons'
import './index.scss'

// 常用知识库分类（与门店业务一致）
const CATEGORIES = ['话术', '产品知识', '流程规范', '价格政策', '合规口径', '成功案例', '其他']

const STATUS_META: Record<string, [string, string]> = {
  active: ['启用', 'ref-status-green'],
  inactive: ['停用', 'ref-status-gray'],
  draft: ['草稿', 'ref-status-gray'],
  approved: ['已审核', 'ref-status-green'],
  needs_review: ['待复核', 'ref-status-yellow'],
  retired: ['已下架', 'ref-status-gray'],
}

export default function AdminKnowledge() {
  const [tab, setTab] = useState<'upload' | 'manual' | 'list'>('upload')
  const [list, setList] = useState<any[]>([])
  const [category, setCategory] = useState('话术')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // 手动录入表单
  const [form, setForm] = useState({ title: '', content: '', tags: '', remark: '' })

  useEffect(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePullDownRefresh(() => {
    loadList()
  })

  async function loadList() {
    const r = await knowledgeAdminApi.list()
    if (r.ok) setList(r.data || [])
    else Taro.showToast({ title: r.error || '加载失败', icon: 'none' })
    setLoading(false)
    Taro.stopPullDownRefresh()
  }

  // 上传文件资料
  async function uploadDoc() {
    if (busy) return
    if (!form.title) {
      Taro.showToast({ title: '请先填写资料标题', icon: 'none' })
      return
    }
    const res = await Taro.chooseMessageFile({ count: 1, type: 'file' })
    if (!res.tempFiles || !res.tempFiles.length) return
    setBusy(true)
    const r = await knowledgeAdminApi.upload(res.tempFiles[0].path, {
      title: form.title.trim(),
      category,
      tags: form.tags,
      remark: form.remark,
    })
    setBusy(false)
    Taro.showToast({ title: r.ok ? '上传成功，已自动入库分类' : r.error || '上传失败', icon: 'none' })
    if (r.ok) {
      setForm({ title: '', content: '', tags: '', remark: '' })
      loadList()
    }
  }

  // 手动录入
  async function submitManual() {
    if (!form.title.trim() || !form.content.trim()) {
      Taro.showToast({ title: '标题和内容不能为空', icon: 'none' })
      return
    }
    setBusy(true)
    const r = await knowledgeAdminApi.createManual({
      title: form.title.trim(),
      category,
      content: form.content.trim(),
      tags: form.tags.trim() || undefined,
      remark: form.remark.trim() || undefined,
    })
    setBusy(false)
    Taro.showToast({ title: r.ok ? '知识已入库' : r.error || '保存失败', icon: 'none' })
    if (r.ok) {
      setForm({ title: '', content: '', tags: '', remark: '' })
      loadList()
    }
  }

  async function toggleDoc(d: any) {
    const r = await knowledgeAdminApi.toggle(d.id)
    Taro.showToast({ title: r.ok ? '已更新状态' : r.error || '操作失败', icon: 'none' })
    if (r.ok) loadList()
  }

  async function deleteDoc(d: any) {
    const modal = await Taro.showModal({
      title: '删除知识',
      content: `确定删除「${d.title}」？删除后不再参与 AI 检索。`,
      confirmColor: '#d94b3d',
    })
    if (!modal.confirm) return
    const r = await knowledgeAdminApi.delete(d.id)
    Taro.showToast({ title: r.ok ? '已删除' : r.error || '删除失败', icon: 'none' })
    if (r.ok) loadList()
  }

  const st = (s?: string) => STATUS_META[s || 'active'] || STATUS_META.active

  return (
    <View className="page admin-knowledge">
      <View className="page-header">
        <Text>门店知识库</Text>
      </View>

      <View className="tab-row">
        <View className={`tab-btn${tab === 'upload' ? ' active' : ''}`} onClick={() => setTab('upload')}>上传资料</View>
        <View className={`tab-btn${tab === 'manual' ? ' active' : ''}`} onClick={() => setTab('manual')}>手动录入</View>
        <View className={`tab-btn${tab === 'list' ? ' active' : ''}`} onClick={() => setTab('list')}>已有知识</View>
      </View>

      <View className="cat-row">
        <Text className="cat-label">分类：</Text>
        <Picker mode="selector" range={CATEGORIES} value={CATEGORIES.indexOf(category)} onChange={(e) => setCategory(CATEGORIES[Number(e.detail.value)])}>
          <View className="cat-picker">{category} ▾</View>
        </Picker>
      </View>

      {tab === 'upload' ? (
        <View className="ref-card form-card">
          <View className="upload-hero">
            <View className="upload-ico"><Icon svg={ICN.copy('#008448')} size={40} /></View>
            <Text className="upload-title">批量上传（AI 自动分类）</Text>
            <Text className="upload-sub">支持 PDF / Word / 文本，系统自动解析、切分并入库，AI 检索可直接命中。</Text>
          </View>
          <Input
            className="ref-field form-field"
            placeholder="资料标题"
            placeholderClass="ref-field-placeholder"
            value={form.title}
            onInput={(e) => setForm({ ...form, title: e.detail.value })}
          />
          <Input
            className="ref-field form-field"
            placeholder="标签（可选，逗号分隔）"
            placeholderClass="ref-field-placeholder"
            value={form.tags}
            onInput={(e) => setForm({ ...form, tags: e.detail.value })}
          />
          <Input
            className="ref-field form-field"
            placeholder="备注（可选）"
            placeholderClass="ref-field-placeholder"
            value={form.remark}
            onInput={(e) => setForm({ ...form, remark: e.detail.value })}
          />
          <View
            className={`ref-primary submit-btn${busy ? ' disabled' : ''}`}
            onClick={uploadDoc}
          >
            {busy ? '上传中…' : '选择文件并上传'}
          </View>
        </View>
      ) : tab === 'manual' ? (
        <View className="ref-card form-card">
          <View className="upload-hero">
            <View className="upload-ico ico-manual"><Icon svg={ICN.help('#277db8')} size={40} /></View>
            <Text className="upload-title">手动输入知识</Text>
            <Text className="upload-sub">不用传文件，直接录入一段标准话术、流程或口径，即时入库。</Text>
          </View>
          <Input
            className="ref-field form-field"
            placeholder="知识标题"
            placeholderClass="ref-field-placeholder"
            value={form.title}
            onInput={(e) => setForm({ ...form, title: e.detail.value })}
          />
          <Textarea
            className="ref-textarea"
            placeholder="知识正文内容"
            placeholderClass="ref-field-placeholder"
            value={form.content}
            onInput={(e) => setForm({ ...form, content: e.detail.value })}
          />
          <Input
            className="ref-field form-field"
            placeholder="标签（可选）"
            placeholderClass="ref-field-placeholder"
            value={form.tags}
            onInput={(e) => setForm({ ...form, tags: e.detail.value })}
          />
          <View
            className={`ref-primary submit-btn${busy ? ' disabled' : ''}`}
            onClick={submitManual}
          >
            {busy ? '保存中…' : '保存到知识库'}
          </View>
        </View>
      ) : (
        <View>
          {loading ? (
            <View className="ref-skeleton list-skeleton" />
          ) : list.length === 0 ? (
            <View className="ref-empty">暂无知识资料，请先上传或录入</View>
          ) : (
            list.map((d, i) => {
              const [label, tag] = st(d.status || d.review_status)
              return (
                <View className="ref-card kd-card" key={d.id || i}>
                  <View className="kd-head">
                    <Text className="kd-title">{d.title}</Text>
                    <Text className={`ref-status ${tag}`}>{label}</Text>
                  </View>
                  <View className="kd-meta">
                    {d.category ? <Text className="kd-cat">{d.category}</Text> : null}
                    <Text> · {d.file_type ? `文件 ${d.file_type}` : '手动录入'}</Text>
                    <Text> · {fmtDate(d.created_at)}</Text>
                  </View>
                  {d.remark ? <Text className="kd-remark">{d.remark}</Text> : null}
                  <View className="kd-actions">
                    <View className="ref-btn-sm ref-btn-sm-ghost" onClick={() => toggleDoc(d)}>
                      {d.status === 'active' ? '停用' : '启用'}
                    </View>
                    <View className="ref-btn-sm ref-btn-sm-danger" onClick={() => deleteDoc(d)}>删除</View>
                  </View>
                </View>
              )
            })
          )}
        </View>
      )}
    </View>
  )
}
