import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import FileUpload from './components/FileUpload'
import DataVisualization from './components/DataVisualization'
import DataFilter from './components/DataFilter'
import LabelDuplicateAnalysis from './components/LabelDuplicateAnalysis'
import FilteredResultsList from './components/FilteredResultsList'
import { DataRow } from './types'
import { getDataCount, batchReadData, filterData, exportAllData } from './utils/indexedDB'
import './App.css'

function App() {
  const [dataCount, setDataCount] = useState<number>(0)
  const [sampleData, setSampleData] = useState<DataRow[]>([]) // 只保存采样数据用于统计
  const [filteredData, setFilteredData] = useState<DataRow[]>([])
  const [fileType, setFileType] = useState<'csv' | 'tsv'>('csv')
  const [fileName, setFileName] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const handleDataLoaded = async (count: number, type: 'csv' | 'tsv', name: string) => {
    setDataCount(count)
    setFileType(type)
    setFileName(name)
    setFilteredData([])
    
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

  const handleExportCSV = async () => {
    if (filteredData.length === 0) {
      alert('没有可导出的数据')
      return
    }

    // 获取所有列名
    const columns = Object.keys(filteredData[0])
    
    // 根据文件类型选择分隔符
    const delimiter = fileType === 'tsv' ? '\t' : ','
    const extension = fileType === 'tsv' ? 'tsv' : 'csv'
    
    // 转换为CSV/TSV格式
    const csv = Papa.unparse(filteredData, {
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
            {sampleData.some(row => row.label || row.caption) && (
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
              onFilterChange={setFilteredData} 
              fileType={fileType} 
            />
            
            {filteredData.length > 0 && (
              <div className="filter-results">
                <h2>筛选结果</h2>
                <div className="results-info">
                  <p>共找到 <strong>{filteredData.length}</strong> 条符合条件的数据</p>
                </div>
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
          </>
        )}
      </main>
    </div>
  )
}

export default App

