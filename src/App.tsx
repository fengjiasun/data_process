import { useState, useEffect, useMemo } from 'react'
import Papa from 'papaparse'
import FileUpload from './components/FileUpload'
import DataVisualization from './components/DataVisualization'
import DataFilter from './components/DataFilter'
import LabelDuplicateAnalysis from './components/LabelDuplicateAnalysis'
import FilteredResultsList from './components/FilteredResultsList'
import DataResampling from './components/DataResampling'
import { DataRow, FilterCondition } from './types'
import { getDataCount, batchReadData, filterData, exportAllData } from './utils/indexedDB'
import { matchesWord } from './utils/textMatching'
import './App.css'

function App() {
  const [dataCount, setDataCount] = useState<number>(0)
  const [sampleData, setSampleData] = useState<DataRow[]>([]) // 只保存采样数据用于统计
  const [filteredData, setFilteredData] = useState<DataRow[]>([])
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([])
  const [fileType, setFileType] = useState<'csv' | 'tsv'>('csv')
  const [fileName, setFileName] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [originalColumns, setOriginalColumns] = useState<string[]>([])

  const handleDataLoaded = async (count: number, type: 'csv' | 'tsv', name: string, columns: string[]) => {
    setDataCount(count)
    setFileType(type)
    setFileName(name)
    setFilteredData([])
    setOriginalColumns(columns)
    
    // 加载采样数据用于统计（最多10万条）
    setIsLoading(true)
    try {
      const sampleSize = Math.min(100000, count)
      const sampled = await batchReadData(0, sampleSize)
      setSampleData(sampled)
    } catch (error) {
      console.error('加载采样数据失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 获取完整数据（用于需要全部数据的场景）
  const getFullData = async (): Promise<DataRow[]> => {
    if (dataCount <= 100000) {
      return await batchReadData(0, dataCount)
    }
    // 对于大数据量，返回采样数据
    return sampleData
  }

  // 统计包含关键词的列值重复频率
  const getTopKeywordResults = useMemo(() => {
    if (filteredData.length === 0 || filterConditions.length === 0) {
      return []
    }

    // 提取所有文本搜索条件中的"包含关键词"和对应的列
    const textConditions = filterConditions.filter(
      condition => condition.type === 'text' && condition.textSearch
    )

    if (textConditions.length === 0) {
      return []
    }

    // 对每个文本搜索条件，统计包含该关键词的列值的重复次数
    const results: Array<{
      keyword: string
      column: string
      topValues: Array<{ value: string; count: number }>
    }> = []

    textConditions.forEach(condition => {
      const keyword = condition.textSearch!.toLowerCase()
      const column = condition.feature

      // 收集所有包含该关键词的行的该列的值（使用单词匹配）
      const columnValues: string[] = []
      filteredData.forEach(row => {
        const columnValue = row[column]
        if (typeof columnValue === 'string' && columnValue) {
          if (matchesWord(columnValue, condition.textSearch!)) {
            columnValues.push(columnValue) // 保存原始值
          }
        }
      })

      if (columnValues.length === 0) {
        return
      }

      // 统计每个值的重复次数
      const valueCounts: Record<string, number> = {}
      columnValues.forEach(value => {
        valueCounts[value] = (valueCounts[value] || 0) + 1
      })

      // 转换为数组并按重复次数排序
      const sortedValues = Object.entries(valueCounts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)

      // 检查是否有重复的值
      const hasDuplicates = sortedValues.some(item => item.count > 1)

      let topValues: Array<{ value: string; count: number }>
      if (hasDuplicates) {
        // 有重复的，取重复最多的前3个
        topValues = sortedValues.slice(0, 3)
      } else {
        // 都是不重复的，随机取3个
        const shuffled = [...sortedValues].sort(() => Math.random() - 0.5)
        topValues = shuffled.slice(0, 3)
      }

      if (topValues.length > 0) {
        results.push({
          keyword: condition.textSearch!, // 使用原始关键词（保持大小写）
          column,
          topValues
        })
      }
    })

    return results
  }, [filteredData, filterConditions])

  const handleExportCSV = async () => {
    if (filteredData.length === 0) {
      alert('没有可导出的数据')
      return
    }

    // 使用原始文件的列名，而不是筛选后数据的所有列
    const columns = originalColumns.length > 0 ? originalColumns : Object.keys(filteredData[0])
    
    // 根据文件类型选择分隔符
    const delimiter = fileType === 'tsv' ? '\t' : ','
    const extension = fileType === 'tsv' ? 'tsv' : 'csv'
    
    // 只导出原始列的数据
    const dataToExport = filteredData.map(row => {
      const exportRow: Record<string, any> = {}
      columns.forEach(col => {
        exportRow[col] = row[col] ?? ''
      })
      return exportRow
    })
    
    // 转换为CSV/TSV格式
    const csv = Papa.unparse(dataToExport, {
      columns: columns,
      header: true,
      delimiter: delimiter
    })

    // 创建Blob并下载
    const mimeType = fileType === 'tsv' ? 'text/tab-separated-values;charset=utf-8;' : 'text/csv;charset=utf-8;'
    const blob = new Blob(['\ufeff' + csv], { type: mimeType })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    link.setAttribute('href', url)
    link.setAttribute('download', `filtered_data_${new Date().getTime()}.${extension}`)
    link.style.visibility = 'hidden'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    alert(`成功导出 ${filteredData.length.toLocaleString()} 条数据！`)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>数据分析和可视化平台</h1>
        <p>上传CSV/TSV文件，分析数据分布，筛选指定特征的数据</p>
      </header>

      <main className="app-main">
        <FileUpload onDataLoaded={handleDataLoaded} />

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p>正在加载数据...</p>
          </div>
        )}
        
        {dataCount > 0 && !isLoading && (
          <>
            <div className="file-info-card">
              <h2>📄 已导入文件信息</h2>
              <div className="file-info-content">
                <div className="file-info-item">
                  <span className="file-info-label">文件名:</span>
                  <span className="file-info-value">{fileName}</span>
                </div>
                <div className="file-info-item">
                  <span className="file-info-label">文件类型:</span>
                  <span className="file-info-value">{fileType.toUpperCase()}</span>
                </div>
                <div className="file-info-item">
                  <span className="file-info-label">数据总量:</span>
                  <span className="file-info-value">{dataCount.toLocaleString()} 条</span>
                </div>
              </div>
            </div>
            
            <DataVisualization data={sampleData} fileType={fileType} totalCount={dataCount} />
            {sampleData.some(row => {
              // 检查是否有任何文本列（非数值、非id的列）
              return Object.keys(row).some(key => {
                if (key === 'id') return false
                const value = row[key]
                return typeof value === 'string' && value.trim().length > 0
              })
            }) && (
              <LabelDuplicateAnalysis 
                data={sampleData} 
                fileType={fileType} 
                totalCount={dataCount}
                onNeedFullData={getFullData}
              />
            )}
            <DataFilter 
              dataCount={dataCount}
              sampleData={sampleData}
              onFilterChange={(data, conditions) => {
                setFilteredData(data)
                setFilterConditions(conditions)
              }} 
              fileType={fileType} 
            />
            
            {filteredData.length > 0 && (
              <div className="filter-results">
                <h2>筛选结果</h2>
                <div className="results-info">
                  <p>共找到 <strong>{filteredData.length}</strong> 条符合条件的数据</p>
                </div>
                {getTopKeywordResults.length > 0 && (
                  <div className="keywords-frequency">
                    <h3>📊 包含关键词的列值统计（前3名）</h3>
                    {getTopKeywordResults.map((result, resultIndex) => (
                      <div key={`${result.keyword}-${result.column}-${resultIndex}`} className="keyword-group">
                        <div className="keyword-group-header">
                          <span className="keyword-label">关键词: <strong>"{result.keyword}"</strong></span>
                          <span className="keyword-column">列: <strong>{result.column}</strong></span>
                        </div>
                        <div className="keywords-list">
                          {result.topValues.map((item, index) => (
                            <div key={`${result.keyword}-${index}`} className="keyword-item">
                              <span className="keyword-rank">#{index + 1}</span>
                              <span className="keyword-text" title={item.value}>
                                {item.value.length > 100 ? item.value.substring(0, 100) + '...' : item.value}
                              </span>
                              <span className="keyword-count">重复 {item.count} 次</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="results-actions">
                  <button 
                    className="export-csv-button"
                    onClick={handleExportCSV}
                  >
                    导出为{fileType.toUpperCase()}文件
                  </button>
                  <button 
                    className="copy-button"
                    onClick={() => {
                      const ids = filteredData.map(row => row.id)
                      navigator.clipboard.writeText(ids.join('\n'))
                      alert('已复制所有ID到剪贴板！')
                    }}
                  >
                    复制所有ID
                  </button>
                </div>
                <FilteredResultsList data={filteredData} />
              </div>
            )}
            
            {/* 数据重采样功能 - 放在页面最后，独立于筛选功能 */}
            {sampleData.length > 0 && (
              <DataResampling
                data={sampleData}
                dataCount={dataCount}
                fileType={fileType}
                originalColumns={originalColumns}
                onNeedFullData={getFullData}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App

