// 笔记文件置顶状态
// 设计原则：不侵入 md 文件，置顶状态独立存储到 localStorage
// 标识方式：文件绝对路径（每个文件唯一）
// 注意：与清单工具的置顶相互独立（不同 key），符合 features 隔离原则

const STORAGE_KEY = 'allinone-notes-pinned-files'

interface PinSet { [path: string]: boolean }

function load(): PinSet {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function save(set: PinSet) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(set))
}

/** 判断文件是否被置顶 */
export function isFilePinned(path: string): boolean {
  return !!load()[path]
}

/** 切换文件置顶状态，返回切换后的布尔值 */
export function toggleFilePin(path: string): boolean {
  const set = load()
  const next = !set[path]
  if (next) set[path] = true
  else delete set[path]
  save(set)
  return next
}

/** 加载所有置顶文件路径集合 */
export function loadPinnedFiles(): Set<string> {
  const set = load()
  return new Set(Object.keys(set).filter(k => set[k]))
}
