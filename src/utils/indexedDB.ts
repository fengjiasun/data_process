import { DataRow } from '../types'

const DB_NAME = 'CSVDataDB'
const STORE_NAME = 'dataRows'
const DB_VERSION = 1

let db: IDBDatabase | null = null

// 初始化IndexedDB
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        objectStore.createIndex('id', 'id', { unique: true })
      }
    }
  })
}

// 清空数据库
export const clearDB = async (): Promise<void> => {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// 批量写入数据
export const batchWriteData = async (data: DataRow[], batchSize: number = 10000): Promise<void> => {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    let processed = 0
    let hasError = false

    const writeBatch = (startIndex: number) => {
      if (hasError || startIndex >= data.length) {
        if (!hasError) resolve()
        return
      }

      const transaction = database.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      const endIndex = Math.min(startIndex + batchSize, data.length)
      const batch = data.slice(startIndex, endIndex)

      let completed = 0
      batch.forEach((row) => {
        const request = store.put(row)
        request.onerror = () => {
          if (!hasError) {
            hasError = true
            reject(request.error)
          }
        }
        request.onsuccess = () => {
          completed++
          if (completed === batch.length) {
            processed += batch.length
            // 使用setTimeout避免阻塞
            setTimeout(() => writeBatch(endIndex), 0)
          }
        }
      })
    }

    writeBatch(0)
  })
}

// 获取数据总数
export const getDataCount = async (): Promise<number> => {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.count()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// 批量读取数据（分页）
export const batchReadData = async (
  offset: number = 0,
  limit: number = 10000
): Promise<DataRow[]> => {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()
    const results: DataRow[] = []
    let skipped = 0

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
      if (!cursor) {
        resolve(results)
        return
      }

      if (skipped < offset) {
        skipped++
        cursor.continue()
        return
      }

      if (results.length < limit) {
        results.push(cursor.value)
        cursor.continue()
      } else {
        resolve(results)
      }
    }

    request.onerror = () => reject(request.error)
  })
}

// 获取所有ID
export const getAllIds = async (): Promise<string[]> => {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAllKeys()

    request.onsuccess = () => resolve(request.result as string[])
    request.onerror = () => reject(request.error)
  })
}

// 根据条件筛选数据（使用游标）
export const filterData = async (
  filterFn: (row: DataRow) => boolean,
  onProgress?: (processed: number) => void
): Promise<DataRow[]> => {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()
    const results: DataRow[] = []
    let processed = 0

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
      if (!cursor) {
        resolve(results)
        return
      }

      const row = cursor.value
      if (filterFn(row)) {
        results.push(row)
      }

      processed++
      if (onProgress && processed % 10000 === 0) {
        onProgress(processed)
      }

      cursor.continue()
    }

    request.onerror = () => reject(request.error)
  })
}

// 导出所有数据
export const exportAllData = async (): Promise<DataRow[]> => {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}



