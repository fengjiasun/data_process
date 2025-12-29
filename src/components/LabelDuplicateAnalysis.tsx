import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { DataRow } from '../types'
import './LabelDuplicateAnalysis.css'

interface LabelDuplicateAnalysisProps {
  data: DataRow[]
  fileType?: 'csv' | 'tsv'
  totalCount?: number
  onNeedFullData?: () => Promise<DataRow[]>
}

export default function LabelDuplicateAnalysis({ data, fileType, totalCount, onNeedFullData }: LabelDuplicateAnalysisProps) {
  const [threshold, setThreshold] = useState<number>(100)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  // 自动识别所有文本列（用于重复分析）
  const textColumns = useMemo(() => {
    if (data.length === 0) return []
    
    const firstRow = data[0]
    const textCols: string[] = []
    
    Object.keys(firstRow).forEach(key => {
      if (key === 'id') return
      const value = firstRow[key]
      // 如果是字符串类型，认为是文本列
      if (typeof value === 'string') {
        textCols.push(key)
      }
    })
    
    return textCols
  }, [data])
  
  // 默认选择第一个文本列（优先label）
  const textColumnName = useMemo(() => {
    if (textColumns.length === 0) return null
    // 优先选择label列
    if (textColumns.includes('label')) return 'label'
    // 其次选择caption列
    if (textColumns.includes('caption')) return 'caption'
    // 否则选择第一个文本列
    return textColumns[0]
  }, [textColumns])

  // 统计文本列重复情况
  // 优化：对于大数据量，限制存储的ID数量，只存储前100个
  const labelStatsWithUniqueCount = useMemo(() => {
    if (!textColumnName) return { stats: [], uniqueCount: 0 }
    
    const labelMap = new Map<string, { count: number; ids: string[] }>()
    const MAX_IDS_TO_STORE = 100 // 每个label最多存储100个ID
    
    // 使用分批处理避免阻塞
    const processBatch = (startIndex: number, batchSize: number = 10000) => {
      const endIndex = Math.min(startIndex + batchSize, data.length)
      for (let i = startIndex; i < endIndex; i++) {
        const row = data[i]
        const textValue = row[textColumnName] as string | undefined
        if (textValue && typeof textValue === 'string') {
          const label = textValue.trim()
          if (label) {
            if (!labelMap.has(label)) {
              labelMap.set(label, { count: 0, ids: [] })
            }
            const stat = labelMap.get(label)!
            stat.count++
            // 只存储前MAX_IDS_TO_STORE个ID
            if (stat.ids.length < MAX_IDS_TO_STORE) {
              stat.ids.push(row.id)
            }
          }
        }
      }
    }

    // 对于大数据量，分批处理
    if (data.length > 50000) {
      let currentIndex = 0
      const batchSize = 10000
      while (currentIndex < data.length) {
        processBatch(currentIndex, batchSize)
        currentIndex += batchSize
      }
    } else {
      processBatch(0, data.length)
    }

    // 转换为数组并按数量排序
    const statsArray = Array.from(labelMap.entries())
      .map(([label, stat]) => ({
        label,
        count: stat.count,
        ids: stat.ids,
        hasMoreIds: stat.count > stat.ids.length
      }))
      .sort((a, b) => b.count - a.count)

    return {
      stats: statsArray,
      uniqueCount: labelMap.size // 唯一值的数量
    }
  }, [data, textColumnName])
  
  const labelStats = useMemo(() => {
    return labelStatsWithUniqueCount.stats
  }, [labelStatsWithUniqueCount])
  
  const uniqueCount = useMemo(() => {
    return labelStatsWithUniqueCount.uniqueCount
  }, [labelStatsWithUniqueCount])

  // 过滤出超过阈值的label
  const filteredStats = useMemo(() => {
    return labelStats.filter(stat => stat.count >= threshold)
  }, [labelStats, threshold])


  // 准备分布数据（用于可视化，使用与显示阈值相同的阈值）
  const distributionData = useMemo(() => {
    const overThreshold = filteredStats.filter(stat => stat.count >= threshold)
    if (overThreshold.length === 0) return null

    return overThreshold.map(stat => ({
      label: stat.label.length > 30 ? stat.label.substring(0, 30) + '...' : stat.label,
      count: stat.count,
      fullLabel: stat.label
    }))
  }, [filteredStats, threshold])

  if (filteredStats.length === 0 || !textColumnName) {
    return null
  }

  return (
    <div className="label-duplicate-analysis">
      <h2>{textColumnName}重复分析</h2>
      
      <div className="analysis-summary">
        <div className="summary-item">
          <span className="summary-label">唯一值数量:</span>
          <span className="summary-value">{uniqueCount.toLocaleString()}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">总数据量:</span>
          <span className="summary-value">{(totalCount || data.length).toLocaleString()}</span>
        </div>
      </div>
      
      <div className="threshold-control">
        <label>显示阈值:</label>
        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(Math.max(1, parseInt(e.target.value) || 1))}
          min="1"
        />
        <span className="threshold-hint">只显示重复次数 ≥ {threshold} 的{textColumnName}</span>
      </div>

      {distributionData && distributionData.length > 0 && (
        <div className="distribution-chart">
          <div className="distribution-header">
            <h3>重复次数 ≥ {threshold} 的{textColumnName}分布</h3>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={distributionData} margin={{ top: 20, right: 30, left: 20, bottom: 150 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="label" 
                angle={-45}
                textAnchor="end"
                height={150}
                interval={0}
              />
              <YAxis />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="custom-tooltip">
                        <p className="tooltip-label">{data.fullLabel}</p>
                        <p className="tooltip-count">重复次数: {data.count}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Bar dataKey="count" fill="#667eea">
                {distributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.count > 100 ? '#ff4444' : '#667eea'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="duplicate-list">
        <h3>重复{textColumnName}列表 (共 {filteredStats.length} 个)</h3>
        <div className="duplicate-items">
          {filteredStats.map((stat, index) => (
            <div key={index} className="duplicate-item">
              <div className="duplicate-header">
                <span className="duplicate-count">{stat.count} 次</span>
                <span className="duplicate-label-text">
                  {stat.label.length > 100 ? stat.label.substring(0, 100) + '...' : stat.label}
                </span>
              </div>
              <div className="duplicate-ids">
                <span className="ids-label">相关ID:</span>
                <div className="ids-container">
                  {(expandedIds.has(index) ? stat.ids : stat.ids.slice(0, 10)).map(id => (
                    <span key={id} className="duplicate-id">{id}</span>
                  ))}
                  {(stat.ids.length > 10 || (stat as any).hasMoreIds) && (
                    <button
                      className="expand-ids-btn"
                      onClick={() => {
                        const newExpanded = new Set(expandedIds)
                        if (newExpanded.has(index)) {
                          newExpanded.delete(index)
                        } else {
                          newExpanded.add(index)
                        }
                        setExpandedIds(newExpanded)
                      }}
                    >
                      {expandedIds.has(index) ? (
                        <>
                          <ChevronUp size={14} />
                          收起
                        </>
                      ) : (
                        <>
                          <ChevronDown size={14} />
                          展开全部 ({stat.ids.length}{(stat as any).hasMoreIds ? '+' : ''} 个)
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
