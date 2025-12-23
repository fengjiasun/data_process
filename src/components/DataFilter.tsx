import { useState, useMemo } from 'react'
import { Filter, X, Search } from 'lucide-react'
import { DataRow, FilterCondition } from '../types'
import { filterData } from '../utils/indexedDB'
import './DataFilter.css'

interface DataFilterProps {
  dataCount: number
  sampleData: DataRow[]
  onFilterChange: (filteredData: DataRow[]) => void
  fileType: 'csv' | 'tsv'
}

export default function DataFilter({ dataCount, sampleData, onFilterChange, fileType }: DataFilterProps) {
  const [conditions, setConditions] = useState<FilterCondition[]>([])
  const [selectedFeature, setSelectedFeature] = useState<string>('')
  const [minValue, setMinValue] = useState<string>('')
  const [maxValue, setMaxValue] = useState<string>('')
  const [textSearch, setTextSearch] = useState<string>('')
  const [excludeTextSearch, setExcludeTextSearch] = useState<string>('')
  const [selectedTextColumn, setSelectedTextColumn] = useState<string>('')
  const [filterType, setFilterType] = useState<'numeric' | 'text'>('numeric')

  const numericFeatures = useMemo(() => {
    if (sampleData.length === 0) return []

    const features: string[] = []
    const firstRow = sampleData[0]
    
    Object.keys(firstRow).forEach(key => {
      if (key !== 'id' && typeof firstRow[key] === 'number') {
        features.push(key)
      }
    })

    return features
  }, [sampleData])

  const featureStats = useMemo(() => {
    const stats: Record<string, { min: number; max: number }> = {}
    
    numericFeatures.forEach(feature => {
      const values = sampleData
        .map(row => row[feature] as number)
        .filter(val => val !== undefined && !isNaN(val))

      if (values.length > 0) {
        stats[feature] = {
          min: Math.min(...values),
          max: Math.max(...values)
        }
      }
    })

    return stats
  }, [sampleData, numericFeatures])

  // 自动识别所有文本列（非数值、非id的列）
  const textColumns = useMemo(() => {
    if (sampleData.length === 0) return []
    
    const textCols: string[] = []
    const firstRow = sampleData[0]
    
    Object.keys(firstRow).forEach(key => {
      if (key === 'id') return
      // 如果是字符串类型，且不是数值列，则认为是文本列
      if (typeof firstRow[key] === 'string' && 
          sampleData.some(row => {
            const val = row[key]
            return val !== undefined && val !== null && val !== '' && typeof val === 'string'
          })) {
        textCols.push(key)
      }
    })
    
    return textCols
  }, [sampleData])

  const hasTextColumn = textColumns.length > 0

  const handleAddNumericCondition = () => {
    if (!selectedFeature || !minValue || !maxValue) {
      alert('请填写完整的筛选条件')
      return
    }

    const min = parseFloat(minValue)
    const max = parseFloat(maxValue)

    if (isNaN(min) || isNaN(max)) {
      alert('请输入有效的数值')
      return
    }

    if (min > max) {
      alert('最小值不能大于最大值')
      return
    }

    setConditions([...conditions, { 
      feature: selectedFeature, 
      min, 
      max, 
      type: 'numeric' 
    }])
    setSelectedFeature('')
    setMinValue('')
    setMaxValue('')
  }

  const handleAddTextCondition = () => {
    if (!textSearch.trim()) {
      alert('请输入搜索关键词')
      return
    }
    
    if (!selectedTextColumn) {
      alert('请选择要搜索的文本列')
      return
    }

    setConditions([...conditions, { 
      feature: selectedTextColumn, 
      textSearch: textSearch.trim(),
      excludeTextSearch: excludeTextSearch.trim() || undefined,
      type: 'text' 
    }])
    setTextSearch('')
    setExcludeTextSearch('')
    setSelectedTextColumn('')
  }

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index))
  }

  const [isFiltering, setIsFiltering] = useState(false)

  const handleApplyFilter = async () => {
    if (conditions.length === 0) {
      onFilterChange([])
      return
    }

    setIsFiltering(true)
    try {
      // 从IndexedDB筛选数据
      const filtered = await filterData((row) => {
        return conditions.every(condition => {
          if (condition.type === 'numeric') {
            const value = row[condition.feature] as number | undefined
            if (value === undefined || isNaN(value)) return false
            return value >= (condition.min || 0) && value <= (condition.max || 0)
          } else if (condition.type === 'text') {
            // 支持任意文本列
            const textValue = row[condition.feature] as string | undefined
            if (!textValue || typeof textValue !== 'string') return false
            const textLower = textValue.toLowerCase()
            const searchLower = (condition.textSearch || '').toLowerCase()
            const excludeLower = (condition.excludeTextSearch || '').toLowerCase()
            
            const includesSearch = searchLower ? textLower.includes(searchLower) : true
            const excludesExclude = excludeLower ? !textLower.includes(excludeLower) : true
            
            return includesSearch && excludesExclude
          }
          return false
        })
      }, (processed) => {
        // 更新筛选进度
        if (processed % 10000 === 0) {
          console.log(`已处理 ${processed} 条数据...`)
        }
      })

      onFilterChange(filtered)
    } catch (error) {
      console.error('筛选数据失败:', error)
      alert('筛选数据时出错，请重试')
    } finally {
      setIsFiltering(false)
    }
  }

  const handleFeatureSelect = (feature: string) => {
    setSelectedFeature(feature)
    const stats = featureStats[feature]
    if (stats) {
      setMinValue(stats.min.toString())
      setMaxValue(stats.max.toString())
    }
  }

  return (
    <div className="data-filter">
      <h2>
        <Filter size={24} />
        数据筛选
      </h2>

      <div className="filter-hint">
        <p>💡 提示：可以添加多个筛选条件，多个条件之间是 <strong>AND（且）</strong> 关系，即数据必须同时满足所有条件</p>
      </div>

      {/* 数值筛选 */}
      <div className="filter-section">
        <h3>数值范围筛选</h3>
        <div className="filter-controls">
          <div className="filter-input-group">
            <label>选择特征:</label>
            <select
              value={selectedFeature}
              onChange={(e) => handleFeatureSelect(e.target.value)}
            >
              <option value="">请选择特征</option>
              {numericFeatures
                .filter(feature => !conditions.some(c => c.feature === feature && c.type === 'numeric'))
                .map(feature => (
                  <option key={feature} value={feature}>
                    {feature}
                    {featureStats[feature] && 
                      ` (${featureStats[feature].min.toFixed(2)} ~ ${featureStats[feature].max.toFixed(2)})`
                    }
                  </option>
                ))}
            </select>
          </div>

          <div className="filter-input-group">
            <label>最小值:</label>
            <input
              type="number"
              value={minValue}
              onChange={(e) => setMinValue(e.target.value)}
              placeholder="输入最小值"
              step="any"
            />
          </div>

          <div className="filter-input-group">
            <label>最大值:</label>
            <input
              type="number"
              value={maxValue}
              onChange={(e) => setMaxValue(e.target.value)}
              placeholder="输入最大值"
              step="any"
            />
          </div>

          <button 
            className="add-condition-btn"
            onClick={handleAddNumericCondition}
            disabled={!selectedFeature || !minValue || !maxValue}
          >
            添加数值条件
          </button>
        </div>
      </div>

      {/* 文本搜索筛选 */}
      {hasTextColumn && (
        <div className="filter-section">
          <h3>
            <Search size={20} />
            文本搜索筛选
          </h3>
          <div className="text-search-controls">
            <div className="filter-input-group">
              <label>选择文本列:</label>
              <select
                value={selectedTextColumn}
                onChange={(e) => setSelectedTextColumn(e.target.value)}
              >
                <option value="">请选择文本列</option>
                {textColumns
                  .filter(col => !conditions.some(c => c.feature === col && c.type === 'text'))
                  .map(col => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
              </select>
            </div>
            <div className="filter-input-group full-width">
              <label>包含关键词:</label>
              <input
                type="text"
                value={textSearch}
                onChange={(e) => setTextSearch(e.target.value)}
                placeholder="例如：firework, rain, helicopter..."
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && textSearch.trim() && selectedTextColumn) {
                    handleAddTextCondition()
                  }
                }}
              />
            </div>
            <div className="filter-input-group full-width">
              <label>排除关键词 (可选):</label>
              <input
                type="text"
                value={excludeTextSearch}
                onChange={(e) => setExcludeTextSearch(e.target.value)}
                placeholder="例如：noise, loud..."
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && textSearch.trim() && selectedTextColumn) {
                    handleAddTextCondition()
                  }
                }}
              />
              <p className="search-hint">输入关键词，将在选定的文本列中搜索包含"包含关键词"但不包含"排除关键词"的数据（不区分大小写）</p>
            </div>
            <button 
              className="add-condition-btn"
              onClick={handleAddTextCondition}
              disabled={!textSearch.trim() || !selectedTextColumn}
            >
              添加文本搜索条件
            </button>
          </div>
        </div>
      )}

      {conditions.length > 0 && (
        <>
          <div className="conditions-list">
            <h3>
              当前筛选条件 ({conditions.length} 个):
              {conditions.length > 1 && <span className="condition-note">（所有条件需同时满足）</span>}
            </h3>
            {conditions.map((condition, index) => (
              <div key={index} className="condition-item">
                <span className="condition-number">{index + 1}</span>
                <span className="condition-text">
                  {condition.type === 'numeric' ? (
                    <>
                      <strong>{condition.feature}</strong>: {condition.min?.toFixed(4)} ~ {condition.max?.toFixed(4)}
                    </>
                  ) : (
                    <>
                      <strong>{condition.feature}</strong> 包含: <em>"{condition.textSearch}"</em>
                      {condition.excludeTextSearch && (
                        <>，但不包含: <em style={{color: '#ff4444'}}>"{condition.excludeTextSearch}"</em></>
                      )}
                    </>
                  )}
                </span>
                <button
                  className="remove-condition-btn"
                  onClick={() => handleRemoveCondition(index)}
                  title="删除此条件"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {conditions.length > 0 && (
              <button
                className="clear-all-btn"
                onClick={() => {
                  setConditions([])
                  onFilterChange([])
                }}
              >
                清空所有条件
              </button>
            )}
          </div>

          <button 
            className="apply-filter-btn" 
            onClick={handleApplyFilter}
            disabled={isFiltering}
          >
            {isFiltering ? '正在筛选...' : '应用筛选'}
          </button>
        </>
      )}
    </div>
  )
}
