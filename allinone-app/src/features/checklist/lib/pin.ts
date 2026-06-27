// 清单项置顶状态
// 设计原则：不侵入 md 文件，置顶状态独立存储到 localStorage
// 标识方式：文件路径 + 行内容指纹（避免行号变化导致置顶错位）

const STORAGE_KEY = 'allinone-pinned-items'

/** 生成某条清单项的唯一指纹：文件路径 + 文本内容（不含勾选状态） */
export function pinKey(filePath: string, text: string): string {
  return `${filePath}::${text}`
}

interface PinMap { [key: string]: boolean }

function load(): PinMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function save(map: PinMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

/** 判断指定项是否被置顶 */
export function isPinned(filePath: string, text: string): boolean {
  return !!load()[pinKey(filePath, text)]
}

/** 切换置顶状态，返回切换后的布尔值 */
export function togglePin(filePath: string, text: string): boolean {
  const map = load()
  const key = pinKey(filePath, text)
  const next = !map[key]
  if (next) map[key] = true
  else delete map[key]
  save(map)
  return next
}
