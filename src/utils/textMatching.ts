/**
 * 检查文本中是否包含完整的单词或单词变形（忽略大小写）
 * 例如："cry" 可以匹配 "cry", "crying", "cryed", "crys", "cryes" 等
 * @param text 要搜索的文本
 * @param keyword 关键词
 * @returns 是否匹配
 */
export function matchesWord(text: string, keyword: string): boolean {
  if (!text || !keyword) return false
  
  // 转小写进行匹配
  const textLower = text.toLowerCase()
  const keywordLower = keyword.toLowerCase().trim()
  
  if (!keywordLower) return false
  
  // 转义特殊字符
  const escapedKeyword = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  
  // 匹配以关键词开头的完整单词（允许后面有字母形成变形）
  // \b 表示单词边界，\w* 表示0个或多个单词字符（字母、数字、下划线）
  // 这样可以匹配 cry, crying, cryed, crys, cryes 等
  // 但不会匹配 acrylic（因为acrylic不是以cry开头的单词）
  const regex = new RegExp(`\\b${escapedKeyword}\\w*\\b`, 'i')
  
  return regex.test(text)
}

