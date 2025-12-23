import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { Upload } from 'lucide-react'
import { DataRow } from '../types'
import { initDB, clearDB, batchWriteData } from '../utils/indexedDB'
import './FileUpload.css'

interface FileUploadProps {
  onDataLoaded: (dataCount: number, fileType: 'csv' | 'tsv', fileName: string) => void
}

// 计算文本的单词数
const countWords = (text: string): number => {
  if (!text || typeof text !== 'string') return 0
  // 移除多余空格，按空格和标点符号分割
  const words = text.trim().split(/\s+/).filter(word => word.length > 0)
  return words.length
}

// 处理单行数据 - 自适应识别所有列
const processRow = (row: any): DataRow | null => {
  const processedRow: DataRow = { id: row.id || '' }
  if (!processedRow.id) return null
  
  // 遍历所有列，自动识别类型
  Object.keys(row).forEach(key => {
    if (key === 'id') return // id已经处理过了
    
    const value = row[key]
    
    // 跳过空值
    if (value === undefined || value === null || value === '') {
      return
    }
    
    // 尝试转换为数字
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && isFinite(numValue)) {
      // 是有效数字，存储为数字类型
      processedRow[key] = numValue
    } else {
      // 是文本，存储为字符串
      const stringValue = String(value).trim()
      if (stringValue) {
        processedRow[key] = stringValue
        
        // 如果是label或caption列，计算单词数
        if (key.toLowerCase() === 'label' || key.toLowerCase() === 'caption') {
          // 为了兼容，也设置label字段
          if (key.toLowerCase() === 'caption') {
            processedRow.label = stringValue
          }
          processedRow.label_word_count = countWords(stringValue)
        }
      }
    }
  })

  return processedRow
}

export default function FileUpload({ onDataLoaded }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsProcessing(true)
    setProgress(0)

    try {
      // 初始化IndexedDB
      await initDB()
      // 清空旧数据
      await clearDB()

      const fileName = file.name.toLowerCase()
      const isTSV = fileName.endsWith('.tsv')
      const delimiter = isTSV ? '\t' : ','

      const batch: DataRow[] = []
      let rowCount = 0
      const BATCH_SIZE = 5000 // 每5000条写入一次IndexedDB
      const CHUNK_SIZE = 10000 // 每处理10000行更新一次进度
      const startTime = Date.now()
      const fileSize = file.size

      await new Promise<void>((resolve, reject) => {
        let isWriting = false
        let writeQueue: Promise<void> = Promise.resolve()

        const writeBatchToDB = async (dataBatch: DataRow[]) => {
          if (dataBatch.length === 0) return
          const batchCopy = [...dataBatch]
          writeQueue = writeQueue.then(async () => {
            try {
              await batchWriteData(batchCopy, BATCH_SIZE)
            } catch (error) {
              reject(error)
              throw error
            }
          })
          return writeQueue
        }

        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          delimiter: delimiter,
          step: (results) => {
            const processedRow = processRow(results.data)
            if (processedRow) {
              batch.push(processedRow)
              
              // 当批次达到BATCH_SIZE时，异步写入IndexedDB
              if (batch.length >= BATCH_SIZE && !isWriting) {
                isWriting = true
                const batchToWrite = [...batch]
                batch.length = 0 // 清空批次
                
                writeBatchToDB(batchToWrite).then(() => {
                  isWriting = false
                }).catch((error) => {
                  reject(error)
                })
              }
            }
            rowCount++
            
            // 更新进度
            if (rowCount % CHUNK_SIZE === 0) {
              const estimatedProgress = Math.min(95, (rowCount / 1000000) * 100)
              setProgress(estimatedProgress)
            }
          },
          complete: async () => {
            try {
              // 等待所有写入完成
              await writeQueue
              
              // 写入剩余数据
              if (batch.length > 0) {
                await writeBatchToDB(batch)
                await writeQueue
              }
              
              setProgress(100)
              const processingTime = ((Date.now() - startTime) / 1000).toFixed(1)
              console.log(`处理完成: ${rowCount} 行，耗时 ${processingTime} 秒`)
              
              setTimeout(() => {
                onDataLoaded(rowCount, isTSV ? 'tsv' : 'csv', file.name)
                setIsProcessing(false)
                setProgress(0)
              }, 100)
              
              resolve()
            } catch (error) {
              reject(error)
            }
          },
          error: (error) => {
            console.error('文件解析错误:', error)
            alert(`${isTSV ? 'TSV' : 'CSV'}文件解析失败，请检查文件格式`)
            setIsProcessing(false)
            setProgress(0)
            reject(error)
          }
        })
      })
    } catch (error) {
      console.error('处理文件时出错:', error)
      alert('文件处理失败，请重试')
      setIsProcessing(false)
      setProgress(0)
    }
  }

  return (
    <div className="file-upload">
      <div 
        className="upload-area"
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        style={{ opacity: isProcessing ? 0.6 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
      >
        <Upload size={48} />
        {isProcessing ? (
          <>
            <p>正在处理文件...</p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="upload-hint">已处理: {progress.toFixed(1)}%</p>
          </>
        ) : (
          <>
            <p>点击或拖拽文件到此处上传</p>
            <p className="upload-hint">支持 .csv 和 .tsv 格式文件（支持大数据量）</p>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv"
        onChange={handleFileChange}
        disabled={isProcessing}
        style={{ display: 'none' }}
      />
    </div>
  )
}


