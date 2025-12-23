import { useState, useMemo } from 'react'
import { RefreshCw, Download, X, Plus } from 'lucide-react'
import Papa from 'papaparse'
import { DataRow } from '../types'
import { matchesWord } from '../utils/textMatching'
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
  // 只在TSV文件时显示
  if (fileType !== 'tsv') return null

  const [conditions, setConditions] = useState<ResampleCondition[]>([])
  const [resampledData, setResampledData] = useState<DataRow[]>([])
  const [isResampling, setIsResampling] = useState(false)
  
  // 获取完整数据（用于重采样，确保与筛选功能使用相同的数据源）
  const getFullDataForResampling = async (): Promise<DataRow[]> => {
    if (dataCount <= 100000) {
      // 数据量不大，直接使用传入的数据
      return data
    }
    // 数据量大，从IndexedDB读取全部数据
    return await onNeedFullData()
  }

  // 自动检测可用的文本列（label或caption）
  const availableColumns = useMemo(() => {
    if (data.length === 0) return []
    
    const columns: string[] = []
    const firstRow = data[0]
    
    if (firstRow.label && typeof firstRow.label === 'string') {
      columns.push('label')
    }
    if (firstRow.caption && typeof firstRow.caption === 'string') {
      columns.push('caption')
    }
    
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

  // 统计某个关键词匹配的数据量（使用采样数据预览，实际重采样时使用完整数据）
  const getKeywordCount = (keyword: string, column: string): number => {
    if (!keyword.trim() || !column) return 0
    
    // 使用采样数据快速预览，实际重采样时会使用完整数据
    return data.filter(row => {
      const value = row[column]
      if (typeof value === 'string' && value) {
        return matchesWord(value, keyword)
      }
      return false
    }).length
  }

  // 执行重采样
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
      // 获取完整数据（与筛选功能使用相同的数据源）
      const fullData = await getFullDataForResampling()
      
      // 按条件分组数据
      const conditionGroups: Record<string, DataRow[]> = {}
      const allMatchedIds = new Set<string>()

      validConditions.forEach(condition => {
        const matchedRows: DataRow[] = []

        fullData.forEach(row => {
          const value = row[condition.column]
          if (typeof value === 'string' && value) {
            // 使用单词匹配（与筛选功能一致）
            if (matchesWord(value, condition.keyword)) {
              // 避免重复添加（如果一条数据匹配多个条件，只添加到第一个匹配的条件）
              if (!allMatchedIds.has(row.id)) {
                matchedRows.push(row)
                allMatchedIds.add(row.id)
              }
            }
          }
        })

        conditionGroups[condition.id] = matchedRows
      })

      const resampled: DataRow[] = []

      // 对每个条件进行重采样
      validConditions.forEach(condition => {
        const rows = conditionGroups[condition.id] || []
        const maxCountNum = parseInt(condition.maxCount)

        if (rows.length === 0) {
          return // 没有匹配的数据
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
      })

      // 添加未被重采样操作涉及到的数据（保留原始数据）
      fullData.forEach(row => {
        if (!allMatchedIds.has(row.id)) {
          resampled.push(row)
        }
      })

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
                          匹配 {matchCount} 条数据
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
