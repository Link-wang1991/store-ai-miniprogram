export function fmtDate(s?: unknown): string {
  if (s == null) return ''
  // 防止后端把日期字段返回成对象/数组时直接渲染触发 React error #31
  if (typeof s !== 'string' && typeof s !== 'number') return ''
  const str = String(s)
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${m}-${day}`
}

export function taskStatusTag(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'done':
    case 'completed':
      return 'green'
    case 'pending':
    case 'todo':
      return 'orange'
    case 'doing':
    case 'in_progress':
      return 'blue'
    default:
      return 'gray'
  }
}

export function taskStatusLabel(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'done':
    case 'completed':
      return '已完成'
    case 'pending':
    case 'todo':
      return '待办'
    case 'doing':
    case 'in_progress':
      return '进行中'
    default:
      return status || '待办'
  }
}
