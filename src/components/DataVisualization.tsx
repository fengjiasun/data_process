import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { DataRow } from '../types'
import './DataVisualization.css'

interface DataVisualizationProps {
  data: DataRow[]
  fileType: 'csv' | 'tsv'
  totalCount?: number
}

export default function DataVisualization({ data, fileType, totalCount }: DataVisualizationProps) {
  const numericFeatures = useMemo(() => {
    if (data.length === 0) return []

    const features: string[] = []
    const firstRow = data[0]
    
    Object.keys(firstRow).forEach(key => {
      if (key !== 'id' && typeof firstRow[key] === 'number') {
        features.push(key)
      }
    })

    return features
  }, [data])

  // 采样函数：对于大数据量进行采样
  const sampleData = useMemo(() => {
    // 只有当数据量超过10万条时才采样，采样10万条
    const SAMPLE_THRESHOLD = 100000
    const SAMPLE_SIZE = 100000
    
    if (data.length <= SAMPLE_THRESHOLD) return data
    
    // 计算采样步长
    const step = Math.ceil(data.length / SAMPLE_SIZE)
    const sampled: DataRow[] = []
    
    for (let i = 0; i < data.length; i += step) {
      sampled.push(data[i])
      if (sampled.length >= SAMPLE_SIZE) break
    }
    
    return sampled
  }, [data])

  const statistics = useMemo(() => {
    return numericFeatures.map(feature => {
      const values = sampleData
        .map(row => row[feature] as number)
        .filter(val => val !== undefined && !isNaN(val))

      if (values.length === 0) {
        return { feature, min: 0, max: 0, mean: 0, median: 0, q1: 0, q3: 0, count: 0, isSampled: false }
      }

      const sorted = [...values].sort((a, b) => a - b)
      const min = sorted[0]
      const max = sorted[sorted.length - 1]
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)]
      
      const q1Index = Math.floor(sorted.length * 0.25)
      const q3Index = Math.floor(sorted.length * 0.75)
      const q1 = sorted[q1Index]
      const q3 = sorted[q3Index]

      return { 
        feature, 
        min, 
        max, 
        mean, 
        median, 
        q1, 
        q3, 
        count: totalCount || data.length, // 显示实际数据量
        isSampled: totalCount ? sampleData.length < totalCount : sampleData.length < data.length 
      }
    })
  }, [data, numericFeatures, sampleData])

  const histogramData = useMemo(() => {
    return numericFeatures.map(feature => {
      const values = sampleData
        .map(row => row[feature] as number)
        .filter(val => val !== undefined && !isNaN(val))

      if (values.length === 0) return { feature, bins: [] }

      const min = Math.min(...values)
      const max = Math.max(...values)
      const binCount = 20
      const binWidth = (max - min) / binCount

      const bins = Array(binCount).fill(0).map((_, i) => {
        const binStart = min + i * binWidth
        const binEnd = binStart + binWidth
        const count = values.filter(v => v >= binStart && (i === binCount - 1 ? v <= binEnd : v < binEnd)).length
        return {
          range: `${binStart.toFixed(2)}-${binEnd.toFixed(2)}`,
          count,
          mid: (binStart + binEnd) / 2
        }
      })

      return { feature, bins, isSampled: sampleData.length < data.length }
    })
  }, [data, numericFeatures, sampleData])

  // 自动识别文本列并统计单词数
  const textColumnForWordCount = useMemo(() => {
    if (data.length === 0) return null
    const firstRow = data[0]
    // 优先查找label或caption列
    if (firstRow.label && typeof firstRow.label === 'string') return 'label'
    if (firstRow.caption && typeof firstRow.caption === 'string') return 'caption'
    // 查找其他文本列
    for (const key in firstRow) {
      if (key !== 'id' && typeof firstRow[key] === 'string') {
        return key
      }
    }
    return null
  }, [data])

  // 统计文本列单词数
  const labelWordCountStats = useMemo(() => {
    if (!textColumnForWordCount || !data.some(row => {
      const textValue = row[textColumnForWordCount]
      return textValue !== undefined && textValue !== null && typeof textValue === 'string'
    })) {
      return null
    }

    // 计算单词数
    const wordCounts = sampleData
      .map(row => {
        const textValue = row[textColumnForWordCount] as string | undefined
        if (!textValue || typeof textValue !== 'string') return null
        const words = textValue.trim().split(/\s+/).filter(w => w.length > 0)
        return words.length
      })
      .filter(count => count !== null && count !== undefined && !isNaN(count)) as number[]

    if (wordCounts.length === 0) return null

    const sorted = [...wordCounts].sort((a, b) => a - b)
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const mean = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]
    const q1Index = Math.floor(sorted.length * 0.25)
    const q3Index = Math.floor(sorted.length * 0.75)
    const q1 = sorted[q1Index]
    const q3 = sorted[q3Index]

    // 生成单词数分布直方图数据
    const binCount = 20
    const binWidth = (max - min) / binCount
    const bins = Array(binCount).fill(0).map((_, i) => {
      const binStart = min + i * binWidth
      const binEnd = binStart + binWidth
      const count = wordCounts.filter(v => v >= binStart && (i === binCount - 1 ? v <= binEnd : v < binEnd)).length
      return {
        range: `${Math.round(binStart)}-${Math.round(binEnd)}`,
        count,
        mid: (binStart + binEnd) / 2
      }
    })

    // 计算实际有文本的数据量
    const actualCount = data.filter(row => {
      const textValue = row[textColumnForWordCount] as string | undefined
      return textValue !== undefined && textValue !== null && typeof textValue === 'string' && textValue.trim().length > 0
    }).length

    return { 
      min, 
      max, 
      mean, 
      median, 
      q1, 
      q3, 
      count: actualCount, // 显示实际数据量，不是采样后的数量
      bins,
      isSampled: sampleData.length < data.length,
      columnName: textColumnForWordCount
    }
  }, [data, fileType, sampleData, textColumnForWordCount])

  // 找出词数最长和最短的文本
  const { longestLabel, shortestLabel } = useMemo(() => {
    if (!textColumnForWordCount) return { longestLabel: null, shortestLabel: null }
    
    let longest: { label: string; wordCount: number; id: string } | null = null
    let shortest: { label: string; wordCount: number; id: string } | null = null

    data.forEach(row => {
      const textValue = row[textColumnForWordCount] as string | undefined
      if (textValue && typeof textValue === 'string') {
        const label = textValue.trim()
        if (label) {
          const words = label.split(/\s+/).filter(w => w.length > 0)
          const wordCount = words.length

          if (!longest || wordCount > longest.wordCount) {
            longest = { label, wordCount, id: row.id }
          }
          if (!shortest || wordCount < shortest.wordCount) {
            shortest = { label, wordCount, id: row.id }
          }
        }
      }
    })

    return { longestLabel: longest, shortestLabel: shortest }
  }, [data, textColumnForWordCount])

  if (data.length === 0) return null

  return (
    <div className="data-visualization">
      <h2>数据分布分析</h2>
      
      {labelWordCountStats && (
        <div className="label-word-count-section">
          <h3>{labelWordCountStats.columnName}单词数统计</h3>
          <div className="label-stats-grid">
            <div className="label-stat-card">
              <div className="label-stat-item">
                <span className="label-stat-label">最小单词数:</span>
                <span className="label-stat-value">{labelWordCountStats.min}</span>
              </div>
              <div className="label-stat-item">
                <span className="label-stat-label">最大单词数:</span>
                <span className="label-stat-value">{labelWordCountStats.max}</span>
              </div>
              <div className="label-stat-item">
                <span className="label-stat-label">平均单词数:</span>
                <span className="label-stat-value label-stat-mean">{labelWordCountStats.mean.toFixed(2)}</span>
              </div>
              <div className="label-stat-item">
                <span className="label-stat-label">中位数:</span>
                <span className="label-stat-value">{labelWordCountStats.median.toFixed(2)}</span>
              </div>
              <div className="label-stat-item">
                <span className="label-stat-label">Q1:</span>
                <span className="label-stat-value">{labelWordCountStats.q1.toFixed(2)}</span>
              </div>
              <div className="label-stat-item">
                <span className="label-stat-label">Q3:</span>
                <span className="label-stat-value">{labelWordCountStats.q3.toFixed(2)}</span>
              </div>
              <div className="label-stat-item">
                <span className="label-stat-label">数据量:</span>
                <span className="label-stat-value">
                  {labelWordCountStats.count.toLocaleString()}
                  {labelWordCountStats.isSampled && <span className="sampled-hint"> (采样统计)</span>}
                </span>
              </div>
            </div>
            <div className="label-chart-card">
              <h4>单词数分布直方图</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={labelWordCountStats.bins}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="mid" 
                    tickFormatter={(value) => Math.round(value).toString()}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4caf50" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {(longestLabel || shortestLabel) && (
            <div className="extreme-labels-section">
              <h4>词数统计</h4>
              <div className="extreme-labels">
                {longestLabel && (
                  <div className="extreme-label-card longest">
                    <h5>词数最长的Label</h5>
                    <div className="extreme-label-content">
                      <p className="extreme-label-text">{longestLabel.label}</p>
                      <div className="extreme-label-info">
                        <span className="word-count">词数: {longestLabel.wordCount}</span>
                        <span className="label-id">ID: {longestLabel.id}</span>
                      </div>
                    </div>
                  </div>
                )}
                {shortestLabel && (
                  <div className="extreme-label-card shortest">
                    <h5>词数最短的Label</h5>
                    <div className="extreme-label-content">
                      <p className="extreme-label-text">{shortestLabel.label}</p>
                      <div className="extreme-label-info">
                        <span className="word-count">词数: {shortestLabel.wordCount}</span>
                        <span className="label-id">ID: {shortestLabel.id}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="stats-grid">
        {statistics.map(stat => (
          <div key={stat.feature} className="stat-card">
            <h3>{stat.feature}</h3>
            <div className="stat-info">
              <div className="stat-item">
                <span className="stat-label">最小值:</span>
                <span className="stat-value">{stat.min.toFixed(4)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">最大值:</span>
                <span className="stat-value">{stat.max.toFixed(4)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">平均值:</span>
                <span className="stat-value stat-mean">{stat.mean.toFixed(4)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">中位数:</span>
                <span className="stat-value">{stat.median.toFixed(4)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Q1:</span>
                <span className="stat-value">{stat.q1.toFixed(4)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Q3:</span>
                <span className="stat-value">{stat.q3.toFixed(4)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">数据量:</span>
                <span className="stat-value">
                  {stat.count.toLocaleString()}
                  {stat.isSampled && <span className="sampled-hint"> (采样统计)</span>}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="charts-container">
        {histogramData.map(({ feature, bins }) => {
          if (bins.length === 0) return null

          return (
            <div key={feature} className="chart-card">
              <h3>{feature} - 分布直方图</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={bins}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="mid" 
                    tickFormatter={(value) => value.toFixed(2)}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#667eea" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        })}
      </div>

      <div className="boxplot-container">
        <h3>箱线图对比</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={statistics} margin={{ top: 20, right: 30, left: 20, bottom: 100 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="feature" 
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="min" fill="#8884d8" name="最小值" />
            <Bar dataKey="q1" fill="#82ca9d" name="Q1" />
            <Bar dataKey="median" fill="#ffc658" name="中位数" />
            <Bar dataKey="q3" fill="#ff7300" name="Q3" />
            <Bar dataKey="max" fill="#ff0000" name="最大值" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

