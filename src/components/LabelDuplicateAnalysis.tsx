import { useMemo, useState, useEffect } from 'react'
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
  
  // 默认文本列：优先选择列名中包含 label 或 caption 的列，否则取第一个文本列
  const defaultColumnName = useMemo(() => {
    if (textColumns.length === 0) return null
    const lower = (s: string) => s.toLowerCase()
    const withLabel = textColumns.find(col => lower(col).includes('label'))
    if (withLabel) return withLabel
    const withCaption = textColumns.find(col => lower(col).includes('caption'))
    if (withCaption) return withCaption
    return textColumns[0]
  }, [textColumns])

  // 用户选择的要分析重复的列（可手动切换）
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null)
  useEffect(() => {
    if (!defaultColumnName) return
    setSelectedColumn(prev => {
      if (!prev || !textColumns.includes(prev)) return defaultColumnName
      return prev
    })
  }, [defaultColumnName, textColumns.join(',')])
  const textColumnName = selectedColumn ?? defaultColumnName

  // 统计文本列重复情况
  // 使用采样数据进行统计（避免大数据量卡死）
  // 注意：这是基于采样数据的统计，可能与全量数据的精确统计有差异
  const labelStatsWithUniqueCount = useMemo(() => {
    if (!textColumnName) return { stats: [], uniqueCount: 0 }
    
    // 使用传入的采样数据进行统计
    const dataToUse = data
    
    const labelMap = new Map<string, { count: number; ids: string[] }>()
    const MAX_IDS_TO_STORE = 100 // 每个label最多存储100个ID
    
    // 使用分批处理避免阻塞
    const processBatch = (startIndex: number, batchSize: number = 10000) => {
      const endIndex = Math.min(startIndex + batchSize, dataToUse.length)
      for (let i = startIndex; i < endIndex; i++) {
        const row = dataToUse[i]
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
    if (dataToUse.length > 50000) {
      let currentIndex = 0
      const batchSize = 10000
      while (currentIndex < dataToUse.length) {
        processBatch(currentIndex, batchSize)
        currentIndex += batchSize
      }
    } else {
      processBatch(0, dataToUse.length)
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
        {textColumns.length > 0 && (
          <div className="column-selector">
            <label htmlFor="duplicate-analysis-column">选择要分析重复的列:</label>
            <select
              id="duplicate-analysis-column"
              value={textColumnName}
              onChange={(e) => setSelectedColumn(e.target.value)}
            >
              {textColumns.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
        )}
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
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <p>没有找到重复次数 ≥ {threshold} 的{textColumnName}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="label-duplicate-analysis">
      <h2>{textColumnName}重复分析</h2>
      
      <div className="analysis-summary">
        <div className="summary-item">
          <span className="summary-label">唯一值数量（基于采样数据）:</span>
          <span className="summary-value">{uniqueCount.toLocaleString()}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">总数据量:</span>
          <span className="summary-value">{(totalCount || data.length).toLocaleString()}</span>
        </div>
        {totalCount && totalCount > data.length && (
          <div className="summary-item">
            <span className="summary-label" style={{ fontSize: '0.9rem', color: '#888' }}>
              （基于 {data.length.toLocaleString()} 条采样数据统计）
            </span>
          </div>
        )}
      </div>
      
      {textColumns.length > 0 && (
        <div className="column-selector">
          <label htmlFor="duplicate-analysis-column">选择要分析重复的列:</label>
          <select
            id="duplicate-analysis-column"
            value={textColumnName}
            onChange={(e) => setSelectedColumn(e.target.value)}
          >
            {textColumns.map(col => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>
      )}
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
