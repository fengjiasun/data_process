import { useState, useMemo } from 'react'
import { DataRow } from '../types'
import './FilteredResultsList.css'

interface FilteredResultsListProps {
  data: DataRow[]
}

const ITEMS_PER_PAGE = 1000

export default function FilteredResultsList({ data }: FilteredResultsListProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [showAll, setShowAll] = useState(false)

  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE)
  const displayedData = useMemo(() => {
    if (showAll || data.length <= ITEMS_PER_PAGE) {
      return data
    }
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    const end = start + ITEMS_PER_PAGE
    return data.slice(start, end)
  }, [data, currentPage, showAll])

  if (data.length === 0) return null

  return (
    <div className="filtered-results-list">
      <div className="results-list-header">
        <span className="results-count">共 {data.length} 条数据</span>
        {data.length > ITEMS_PER_PAGE && !showAll && (
          <div className="pagination-controls">
            <button
              className="page-btn"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              上一页
            </button>
            <span className="page-info">
              第 {currentPage} / {totalPages} 页
            </span>
            <button
              className="page-btn"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              下一页
            </button>
            <button
              className="show-all-btn"
              onClick={() => setShowAll(true)}
            >
              显示全部
            </button>
          </div>
        )}
      </div>
      <div className="results-list">
        {displayedData.map((row) => (
          <span key={row.id} className="result-id">{row.id}</span>
        ))}
      </div>
      {showAll && data.length > ITEMS_PER_PAGE && (
        <button
          className="collapse-btn"
          onClick={() => {
            setShowAll(false)
            setCurrentPage(1)
          }}
        >
          收起列表
        </button>
      )}
    </div>
  )
}



