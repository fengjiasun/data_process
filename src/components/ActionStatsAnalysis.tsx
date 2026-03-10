import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { FileJson, Filter } from 'lucide-react'
import './ActionStatsAnalysis.css'

const TOP_N_DEFAULT = 10
const TOP_N_FILTERED = 5

/** 解析 action 键 "axis:0.0,-1.0,0.0,0.0|buttons:-1" */
function parseActionKey(key: string): { axis: number[]; buttons: number } | null {
  const parts = key.split('|')
  let axis: number[] = []
  let buttons = -1
  for (const p of parts) {
    const t = p.trim()
    if (t.startsWith('axis:')) {
      const s = t.slice(5).trim()
      axis = s.split(',').map((x) => parseFloat(x.trim()))
      if (axis.length !== 4 || axis.some((n) => isNaN(n))) return null
    } else if (t.startsWith('buttons:')) {
      buttons = parseFloat(t.slice(8).trim())
      if (isNaN(buttons)) return null
    }
  }
  return axis.length === 4 ? { axis, buttons } : null
}

export interface ActionStatsJson {
  total_action_frames?: number
  total_action_categories?: number
  action_category_frame_counts?: Record<string, number>
}

interface ParsedAction {
  key: string
  frames: number
  axis: number[]
  buttons: number
}

export default function ActionStatsAnalysis() {
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [raw, setRaw] = useState<ActionStatsJson | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 筛选条件
  const [buttonsFilter, setButtonsFilter] = useState<string>('') // 空表示不筛
  const [axis0Min, setAxis0Min] = useState<string>('')
  const [axis0Max, setAxis0Max] = useState<string>('')
  const [axis1Min, setAxis1Min] = useState<string>('')
  const [axis1Max, setAxis1Max] = useState<string>('')
  const [axis2Min, setAxis2Min] = useState<string>('')
  const [axis2Max, setAxis2Max] = useState<string>('')
  const [axis3Min, setAxis3Min] = useState<string>('')
  const [axis3Max, setAxis3Max] = useState<string>('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setJsonFile(file)
    setParseError(null)
    setRaw(null)
    setLoading(true)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = reader.result as string
        const data = JSON.parse(text) as ActionStatsJson
        if (!data.action_category_frame_counts || typeof data.action_category_frame_counts !== 'object') {
          setParseError('JSON 中缺少 action_category_frame_counts 或格式不正确')
          setRaw(null)
        } else {
          setRaw(data)
          setParseError(null)
        }
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'JSON 解析失败')
        setRaw(null)
      }
      setLoading(false)
    }
    reader.onerror = () => {
      setParseError('文件读取失败')
      setLoading(false)
    }
    reader.readAsText(file, 'utf-8')
  }

  const totalFrames = raw?.total_action_frames ?? 0

  const parsedList = useMemo((): ParsedAction[] => {
    if (!raw?.action_category_frame_counts) return []
    const list: ParsedAction[] = []
    for (const [key, frames] of Object.entries(raw.action_category_frame_counts)) {
      const parsed = parseActionKey(key)
      if (parsed) list.push({ key, frames, axis: parsed.axis, buttons: parsed.buttons })
    }
    return list
  }, [raw])

  const filteredList = useMemo(() => {
    let list = parsedList

    const b = buttonsFilter.trim()
    if (b !== '') {
      const n = parseFloat(b)
      if (!isNaN(n)) list = list.filter((x) => x.buttons === n)
    }

    const inRange = (v: number, minS: string, maxS: string): boolean => {
      const min = minS.trim() === '' ? -Infinity : parseFloat(minS)
      const max = maxS.trim() === '' ? Infinity : parseFloat(maxS)
      if (isNaN(min) && isNaN(max)) return true
      if (!isNaN(min) && v < min) return false
      if (!isNaN(max) && v > max) return false
      return true
    }

    list = list.filter(
      (x) =>
        inRange(x.axis[0], axis0Min, axis0Max) &&
        inRange(x.axis[1], axis1Min, axis1Max) &&
        inRange(x.axis[2], axis2Min, axis2Max) &&
        inRange(x.axis[3], axis3Min, axis3Max)
    )
    return list
  }, [
    parsedList,
    buttonsFilter,
    axis0Min,
    axis0Max,
    axis1Min,
    axis1Max,
    axis2Min,
    axis2Max,
    axis3Min,
    axis3Max,
  ])

  const hasFilter =
    buttonsFilter.trim() !== '' ||
    [axis0Min, axis0Max, axis1Min, axis1Max, axis2Min, axis2Max, axis3Min, axis3Max].some((s) => s.trim() !== '')

  const filteredTotalFrames = useMemo(() => filteredList.reduce((s, x) => s + x.frames, 0), [filteredList])
  const topN = hasFilter ? TOP_N_FILTERED : TOP_N_DEFAULT
  const topList = useMemo(() => {
    const sorted = [...filteredList].sort((a, b) => b.frames - a.frames)
    return sorted.slice(0, topN)
  }, [filteredList, topN])

  const chartData = useMemo(
    () =>
      topList.map((x) => ({
        name: x.key.length > 40 ? x.key.slice(0, 40) + '…' : x.key,
        fullName: x.key,
        frames: x.frames,
        pct: totalFrames > 0 ? (x.frames / totalFrames) * 100 : 0,
      })),
    [topList, totalFrames]
  )

  if (!raw && !loading && !parseError) {
    return (
      <div className="action-stats-analysis">
        <h2>
          <FileJson size={24} />
          Action 类别统计（JSON）
        </h2>
        <div className="action-stats-upload">
          <label className="action-stats-upload-btn">
            <input type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
            选择 Action 统计 JSON 文件
          </label>
          <p className="action-stats-hint">需包含 action_category_frame_counts 及 total_action_frames</p>
        </div>
      </div>
    )
  }

  return (
    <div className="action-stats-analysis">
      <h2>
        <FileJson size={24} />
        Action 类别统计（JSON）
      </h2>

      <div className="action-stats-upload">
        <label className="action-stats-upload-btn">
          <input type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
          {jsonFile?.name ?? '重新选择 JSON'}
        </label>
        {loading && <p>正在解析 JSON…</p>}
        {parseError && <p className="action-stats-error">{parseError}</p>}
      </div>

      {raw && !loading && !parseError && (
        <>
          <div className="action-stats-summary">
            <h3>概览</h3>
            <div className="action-stats-summary-grid">
              <div className="action-stats-summary-item">
                <span className="label">总 frame 数（total_action_frames）</span>
                <span className="value">{totalFrames.toLocaleString()}</span>
              </div>
              <div className="action-stats-summary-item">
                <span className="label">Action 种类数（当前{hasFilter ? '筛选后' : '全部'}）</span>
                <span className="value">{filteredList.length.toLocaleString()}</span>
              </div>
              {hasFilter && (
                <div className="action-stats-summary-item">
                  <span className="label">筛选后 frame 总数</span>
                  <span className="value">
                    {filteredTotalFrames.toLocaleString()}
                    {totalFrames > 0 && (
                      <span className="action-stats-pct">
                        （占 {((filteredTotalFrames / totalFrames) * 100).toFixed(2)}%）
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="action-stats-filters">
            <h3>
              <Filter size={20} />
              筛选条件
            </h3>
            <div className="action-stats-filters-grid">
              <div className="filter-group">
                <label>buttons（精确）</label>
                <input
                  type="text"
                  placeholder="如 1 或 -1，空=不筛"
                  value={buttonsFilter}
                  onChange={(e) => setButtonsFilter(e.target.value)}
                />
              </div>
              {([0, 1, 2, 3] as const).map((i) => (
                <div key={i} className="filter-group axis-group">
                  <label>axis[{i}] 范围</label>
                  <div className="axis-inputs">
                    <input
                      type="text"
                      placeholder="最小"
                      value={i === 0 ? axis0Min : i === 1 ? axis1Min : i === 2 ? axis2Min : axis3Min}
                      onChange={(e) => {
                        const v = e.target.value
                        if (i === 0) setAxis0Min(v)
                        else if (i === 1) setAxis1Min(v)
                        else if (i === 2) setAxis2Min(v)
                        else setAxis3Min(v)
                      }}
                    />
                    <span>～</span>
                    <input
                      type="text"
                      placeholder="最大"
                      value={i === 0 ? axis0Max : i === 1 ? axis1Max : i === 2 ? axis2Max : axis3Max}
                      onChange={(e) => {
                        const v = e.target.value
                        if (i === 0) setAxis0Max(v)
                        else if (i === 1) setAxis1Max(v)
                        else if (i === 2) setAxis2Max(v)
                        else setAxis3Max(v)
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="action-stats-top">
            <h3>Top {topN} 动作（按 frame 数）</h3>
            <p className="action-stats-top-hint">
              {hasFilter
                ? `筛选后共 ${filteredList.length.toLocaleString()} 种 action，${filteredTotalFrames.toLocaleString()} frames，仅展示前 ${TOP_N_FILTERED} 名`
                : `展示前 ${TOP_N_DEFAULT} 名，数量及占 total_action_frames 比例`}
            </p>
            <div className="action-stats-table-wrap">
              <table className="action-stats-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>action（axis|buttons）</th>
                    <th>frame 数</th>
                    <th>占 total_action_frames 比例</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row, idx) => (
                    <tr key={row.fullName}>
                      <td>{idx + 1}</td>
                      <td title={row.fullName}>{row.fullName}</td>
                      <td>{row.frames.toLocaleString()}</td>
                      <td>{row.pct.toFixed(4)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="action-stats-chart">
            <h3>Top {topN} 分布</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 10 }}
                />
                <YAxis />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload?.[0]) {
                      const d = payload[0].payload
                      return (
                        <div className="action-stats-tooltip">
                          <div>{d.fullName}</div>
                          <div>frames: {d.frames.toLocaleString()}</div>
                          <div>比例: {d.pct.toFixed(4)}%</div>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar dataKey="frames" fill="#667eea">
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={['#667eea', '#82ca9d', '#ffc658', '#ff7c7c', '#8c7cff'][i % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
