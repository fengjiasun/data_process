import { useState, useMemo, useEffect } from 'react'
import { RefreshCw, Download, X, Plus } from 'lucide-react'
import Papa from 'papaparse'
import { DataRow } from '../types'
import { matchesWord } from '../utils/textMatching'
import { filterData, countMatchingData } from '../utils/indexedDB'
import './DataResampling.css'

interface DataResamplingProps {
  data: DataRow[]
  dataCount: number
  fileType: 'csv' | 'tsv'
  originalColumns: string[]
  onNeedFullData: () => Promise<DataRow[]>
}

interface ResampleCondition {
  id: string
  keyword: string
  column: string
  maxCount: string
}

export default function DataResampling({ data, dataCount, fileType, originalColumns, onNeedFullData }: DataResamplingProps) {
  // CSV/TSV 均支持重采样

  const [conditions, setConditions] = useState<ResampleCondition[]>([])
  const [resampledData, setResampledData] = useState<DataRow[]>([])
  const [isResampling, setIsResampling] = useState(false)

  // 自适应：所有字符串类型的列都作为可搜索列（不写死列名）
  const availableColumns = useMemo(() => {
    if (data.length === 0) return []
    const firstRow = data[0]
    const columns: string[] = []
    Object.keys(firstRow).forEach(key => {
      if (key === 'id') return
      if (typeof firstRow[key] === 'string') columns.push(key)
    })
    return columns
  }, [data])

  // 添加新的重采样条件
  const handleAddCondition = () => {
    const defaultColumn = availableColumns[0] || ''
    setConditions([
      ...conditions,
      {
        id: Date.now().toString(),
        keyword: '',
        column: defaultColumn,
        maxCount: ''
      }
    ])
  }

  // 删除条件
  const handleRemoveCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id))
    setResampledData([])
  }

  // 更新条件
  const handleUpdateCondition = (id: string, field: keyof ResampleCondition, value: string) => {
    setConditions(conditions.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ))
    setResampledData([])
  }

  // 统计某个关键词匹配的数据量（从IndexedDB查询完整数据，与筛选功能一致）
  const [keywordCounts, setKeywordCounts] = useState<Record<string, number>>({})
  const [isCounting, setIsCounting] = useState(false)
  const [pendingQueries, setPendingQueries] = useState<Set<string>>(new Set())

  // 异步获取关键词匹配数量（使用完整数据）
  const getKeywordCountAsync = async (keyword: string, column: string): Promise<number> => {
    if (!keyword.trim() || !column) return 0
    
    const cacheKey = `${column}:${keyword.toLowerCase()}`
    
    // 如果已有缓存，直接返回
    if (keywordCounts[cacheKey] !== undefined) {
      return keywordCounts[cacheKey]
    }
    
    // 如果正在查询中，避免重复查询
    if (pendingQueries.has(cacheKey)) {
      // 等待现有查询完成
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (keywordCounts[cacheKey] !== undefined) {
            clearInterval(checkInterval)
            resolve(keywordCounts[cacheKey])
          } else if (!pendingQueries.has(cacheKey)) {
            clearInterval(checkInterval)
            // 查询可能失败了，返回采样数据估算
            const fallbackCount = data.filter(row => {
              const value = row[column]
              if (typeof value === 'string' && value) {
                return matchesWord(value, keyword)
              }
              return false
            }).length
            resolve(fallbackCount)
          }
        }, 100)
      })
    }
    
    // 标记为正在查询
    setPendingQueries(prev => new Set(prev).add(cacheKey))
    setIsCounting(true)
    
    try {
      // 使用优化的计数函数，只计数不收集数据，性能更好
      const count = await countMatchingData((row) => {
        const value = row[column]
        if (typeof value === 'string' && value) {
          return matchesWord(value, keyword)
        }
        return false
      }, (processed, currentCount) => {
        // 对于大数据量，每处理1万条更新一次计数（可选，用于显示进度）
        if (processed % 10000 === 0) {
          console.log(`统计 "${keyword}": 已处理 ${processed} 条，匹配 ${currentCount} 条...`)
        }
      })
      
      setKeywordCounts(prev => ({ ...prev, [cacheKey]: count }))
      return count
    } catch (error) {
      console.error('统计关键词匹配数量失败:', error)
      // 如果查询失败，回退到使用采样数据估算
      const fallbackCount = data.filter(row => {
        const value = row[column]
        if (typeof value === 'string' && value) {
          return matchesWord(value, keyword)
        }
        return false
      }).length
      setKeywordCounts(prev => ({ ...prev, [cacheKey]: fallbackCount }))
      return fallbackCount
    } finally {
      setIsCounting(false)
      setPendingQueries(prev => {
        const next = new Set(prev)
        next.delete(cacheKey)
        return next
      })
    }
  }

  // 同步获取关键词匹配数量（用于显示，优先使用缓存）
  // 注意：不会自动触发查询，查询由useEffect的防抖机制触发
  const getKeywordCount = (keyword: string, column: string): number => {
    if (!keyword.trim() || !column) return 0
    
    const cacheKey = `${column}:${keyword.toLowerCase()}`
    if (keywordCounts[cacheKey] !== undefined) {
      return keywordCounts[cacheKey]
    }
    
    // 返回采样数据的估算值（临时显示，直到完整数据查询完成）
    // 不在这里触发查询，避免输入时卡死
    return data.filter(row => {
      const value = row[column]
      if (typeof value === 'string' && value) {
        return matchesWord(value, keyword)
      }
      return false
    }).length
  }

  // 当关键词或列改变时，异步查询完整数据的匹配数量（使用防抖）
  const conditionKeys = useMemo(() => 
    conditions.map(c => `${c.column}:${c.keyword}`).join(','), 
    [conditions]
  )
  
  useEffect(() => {
    // 使用防抖，避免用户输入时频繁查询
    // 增加防抖时间到1.5秒，给用户更多输入时间
    const timeoutId = setTimeout(() => {
      conditions.forEach(condition => {
        if (condition.keyword.trim() && condition.column) {
          const cacheKey = `${condition.column}:${condition.keyword.toLowerCase()}`
          // 只在没有缓存且不在查询中时才查询
          if (keywordCounts[cacheKey] === undefined && !pendingQueries.has(cacheKey)) {
            getKeywordCountAsync(condition.keyword, condition.column).catch(() => {})
          }
        }
      })
    }, 1500) // 用户停止输入1.5秒后才查询，减少不必要的查询
    
    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditionKeys])

  // 执行重采样（使用IndexedDB游标，避免加载所有数据到内存）
  const handleResample = async () => {
    // 验证所有条件
    const validConditions = conditions.filter(c => 
      c.keyword.trim() && c.column && c.maxCount.trim()
    )

    if (validConditions.length === 0) {
      alert('请至少添加一个有效的重采样条件')
      return
    }

    // 验证数量
    for (const condition of validConditions) {
      const maxCountNum = parseInt(condition.maxCount)
      if (isNaN(maxCountNum) || maxCountNum <= 0) {
        alert(`"${condition.keyword}" 的数量设置无效`)
        return
      }
    }

    setIsResampling(true)

    try {
      // 使用IndexedDB游标遍历，按条件分组数据（避免加载所有数据到内存）
      const conditionGroups: Record<string, DataRow[]> = {}
      const allMatchedIds = new Set<string>()

      // 为每个条件从IndexedDB筛选匹配的数据
      for (const condition of validConditions) {
        const matchedRows = await filterData((row) => {
          const value = row[condition.column]
          if (typeof value === 'string' && value) {
            // 使用单词匹配（与筛选功能一致）
            if (matchesWord(value, condition.keyword)) {
              // 避免重复添加（如果一条数据匹配多个条件，只添加到第一个匹配的条件）
              if (!allMatchedIds.has(row.id)) {
                allMatchedIds.add(row.id)
                return true
              }
            }
          }
          return false
        }, (processed) => {
          // 更新进度
          if (processed % 10000 === 0) {
            console.log(`正在筛选 "${condition.keyword}": 已处理 ${processed} 条数据...`)
          }
        })

        conditionGroups[condition.id] = matchedRows
      }

      const resampled: DataRow[] = []

      // 对每个条件进行重采样
      for (const condition of validConditions) {
        const rows = conditionGroups[condition.id] || []
        const maxCountNum = parseInt(condition.maxCount)

        if (rows.length === 0) {
          continue // 没有匹配的数据
        }

        if (rows.length > maxCountNum) {
          // 超过数量，随机采样（无放回）
          const shuffled = [...rows].sort(() => Math.random() - 0.5)
          resampled.push(...shuffled.slice(0, maxCountNum))
        } else if (rows.length < maxCountNum) {
          // 不足数量，先添加所有原始数据，然后重复采样（有放回）补足
          resampled.push(...rows)
          const needed = maxCountNum - rows.length
          for (let i = 0; i < needed; i++) {
            const randomIndex = Math.floor(Math.random() * rows.length)
            // 创建新对象以避免引用问题
            resampled.push({ ...rows[randomIndex] })
          }
        } else {
          // 正好等于数量
          resampled.push(...rows)
        }
      }

      // 添加未被重采样操作涉及到的数据（保留原始数据）
      // 使用IndexedDB游标遍历，只添加未匹配的数据
      const unmatchedData = await filterData((row) => {
        return !allMatchedIds.has(row.id)
      }, (processed) => {
        // 更新进度
        if (processed % 10000 === 0) {
          console.log(`正在添加未匹配数据: 已处理 ${processed} 条数据...`)
        }
      })
      resampled.push(...unmatchedData)

      // 打乱最终结果
      const shuffled = resampled.sort(() => Math.random() - 0.5)
      setResampledData(shuffled)
    } catch (error) {
      console.error('重采样失败:', error)
      alert('重采样失败，请重试')
    } finally {
      setIsResampling(false)
    }
  }

  // 导出重采样后的数据
  const handleExport = () => {
    if (resampledData.length === 0) {
      alert('没有可导出的数据，请先执行重采样')
      return
    }

    const columns = originalColumns.length > 0 ? originalColumns : Object.keys(resampledData[0])
    const delimiter = '\t' // TSV固定使用制表符
    const extension = 'tsv'

    const dataToExport = resampledData.map(row => {
      const exportRow: Record<string, any> = {}
      columns.forEach(col => {
        exportRow[col] = row[col] ?? ''
      })
      return exportRow
    })

    const csv = Papa.unparse(dataToExport, {
      columns: columns,
      header: true,
      delimiter: delimiter
    })

    const mimeType = 'text/tab-separated-values;charset=utf-8;'
    const blob = new Blob(['\ufeff' + csv], { type: mimeType })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    link.setAttribute('href', url)
    link.setAttribute('download', `resampled_data_${new Date().getTime()}.${extension}`)
    link.style.visibility = 'hidden'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    alert(`成功导出 ${resampledData.length.toLocaleString()} 条重采样数据！`)
  }

  if (data.length === 0 || availableColumns.length === 0) return null

  return (
    <div className="data-resampling">
      <h2>
        <RefreshCw size={24} />
        数据重采样
      </h2>

      <div className="resampling-hint">
        <p>💡 提示：添加关键词搜索条件，指定每个关键词匹配的数据重采样到固定数量。超过数量的会随机采样，不足的会重复采样。</p>
      </div>

      <div className="conditions-section">
        <div className="conditions-header">
          <h3>重采样条件</h3>
          <button className="add-condition-btn" onClick={handleAddCondition}>
            <Plus size={18} />
            添加条件
          </button>
        </div>

        {conditions.length === 0 ? (
          <div className="no-conditions">
            <p>点击"添加条件"开始设置重采样规则</p>
          </div>
        ) : (
          <div className="conditions-list">
            {conditions.map((condition) => {
              const matchCount = getKeywordCount(condition.keyword, condition.column)
              return (
                <div key={condition.id} className="condition-item">
                  <div className="condition-controls">
                    <div className="control-group">
                      <label>搜索列:</label>
                      <select
                        value={condition.column}
                        onChange={(e) => handleUpdateCondition(condition.id, 'column', e.target.value)}
                      >
                        {availableColumns.map(col => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="control-group">
                      <label>关键词:</label>
                      <input
                        type="text"
                        value={condition.keyword}
                        onChange={(e) => handleUpdateCondition(condition.id, 'keyword', e.target.value)}
                        placeholder="例如：piano"
                      />
                      {condition.keyword && (
                        <span className="match-count">
                          {isCounting ? '正在统计...' : `匹配 ${matchCount.toLocaleString()} 条数据`}
                          {keywordCounts[`${condition.column}:${condition.keyword.toLowerCase()}`] === undefined && !isCounting && matchCount > 0 && (
                            <span style={{ fontSize: '0.85em', color: '#888', marginLeft: '4px' }}>(估算中...)</span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="control-group">
                      <label>重采样到:</label>
                      <input
                        type="number"
                        value={condition.maxCount}
                        onChange={(e) => handleUpdateCondition(condition.id, 'maxCount', e.target.value)}
                        min="1"
                        placeholder="数量"
                      />
                    </div>

                    <button
                      className="remove-condition-btn"
                      onClick={() => handleRemoveCondition(condition.id)}
                      title="删除此条件"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="resampling-actions">
        <button
          className="resample-btn"
          onClick={handleResample}
          disabled={conditions.length === 0 || isResampling}
        >
          {isResampling ? '正在重采样...' : '执行重采样'}
        </button>
      </div>

      {resampledData.length > 0 && (
        <div className="resampled-results">
          <h3>重采样结果</h3>
          <div className="results-summary">
            <p>重采样后共 <strong>{resampledData.length}</strong> 条数据</p>
          </div>
          <button className="export-btn" onClick={handleExport}>
            <Download size={18} />
            导出重采样数据
          </button>
        </div>
      )}
    </div>
  )
}
