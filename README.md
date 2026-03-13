# 数据分析和可视化平台

本项目提供两类数据的可视化与分析：
- **Action 统计 JSON**：用于分析动作类别分布、筛选与Top统计。
- **音频数据 CSV/TSV**：用于数据分布分析、文本统计、重复分析、筛选与重采样。

## 功能概览

### Action 统计 JSON
- 解析 `action_category_frame_counts`，统计动作类别帧数。
- 支持按 `buttons` 精确筛选、`axis[0..3]` 范围筛选。
- 展示 Top N 动作类别表格与柱状图，并显示占比。

### 音频 CSV/TSV
- 读取 CSV/TSV/TXT（逗号/制表符分隔，包含表头）。
- 自动识别数值列与文本列。
- 数值列统计：最小值/最大值/均值/中位数/Q1/Q3、直方图与箱线图。
- 文本列统计：单词数分布、最长/最短文本示例。
- 文本重复分析：阈值筛选、分布图、重复值列表与关联ID。
- 多条件筛选（数值范围 + 文本包含/排除），结果支持导出与复制ID。
- 重采样：按关键词分组，指定每个关键词的目标数量（超量随机采样、缺量重复采样），可导出结果。

## 数据格式

### Action 统计 JSON
**必须字段**
- `action_category_frame_counts`：动作类别帧数统计，键为 `axis|buttons` 组合。

**推荐字段**
- `total_action_frames`：用于计算占比。
- `total_action_categories`：可选，不影响解析。

**键格式**
```
axis:0.0,-1.0,0.0,0.0|buttons:-1
```
- `axis` 必须为 4 个数值。
- `buttons` 为数值（支持 -1 等特殊值）。

**示例**
```json
{
  "total_action_frames": 123456,
  "total_action_categories": 200,
  "action_category_frame_counts": {
    "axis:0.0,-1.0,0.0,0.0|buttons:-1": 3456,
    "axis:1.0,0.0,0.0,0.0|buttons:1": 789
  }
}
```

### 音频 CSV/TSV
**通用要求**
- 必须包含表头。
- **首列作为 ID**（优先使用列名 `id`，否则默认首列为 ID）。
- 支持 `.csv`、`.tsv`、`.txt`（`.txt` 自动识别逗号或制表符）。

**典型字段（示例）**
- `id`：样本ID或文件名
- 数值列：`non_silence_score`, `audio_quality`, `sync_score` 等
- 文本列：`label`, `caption` 等

**示例（CSV）**
```csv
id,non_silence_score,audio_quality,label
abc_001,0.87,4.2,heavy rain and thunder
abc_002,0.12,3.1,cat meowing
```

**示例（TSV）**
```tsv
id\tnon_silence_score\taudio_quality\tlabel
abc_001\t0.87\t4.2\theavy rain and thunder
abc_002\t0.12\t3.1\tcat meowing
```

## 使用方式

### Action 统计 JSON
1. 进入页面顶部 **Action 类别统计（JSON）** 模块。
2. 上传 JSON 文件。
3. 可选设置 `buttons` 与 `axis` 范围筛选条件。
4. 查看 Top 动作列表、占比与分布图。

### 音频 CSV/TSV
1. 在 **数据分析和可视化平台** 页面上传 CSV/TSV/TXT。
2. 系统会将数据写入浏览器 IndexedDB（便于处理大数据量）。
3. 在以下模块查看与操作：
   - **数据分布分析**：数值列统计、直方图、箱线图。
   - **文本列单词数统计**：文本列词数分布、最长/最短示例。
   - **重复分析**：按阈值显示重复文本及其ID。
   - **数据筛选**：数值范围 + 文本包含/排除（不区分大小写，按单词匹配）。
   - **导出/复制**：筛选结果导出原格式，或复制全部ID。
   - **数据重采样**：按关键词设置目标数量，导出重采样结果（TSV）。

## 安装与启动

### 环境要求
- Node.js + npm（建议使用 LTS 版本）

### 安装依赖
```bash
npm install
```

### 启动开发环境
```bash
npm run dev
```
默认访问地址：`http://localhost:5173`

### 打包构建
```bash
npm run build
```

### 本地预览
```bash
npm run preview
```

