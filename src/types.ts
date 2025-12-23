export interface DataRow {
  id: string
  non_silence_score?: number
  vision_audio_similarity?: number
  sync_score?: number
  text_audio_similarity?: number
  audio_caption?: number
  audio_enjoyment?: number
  audio_content?: number
  audio_complexity?: number
  audio_quality?: number
  label?: string
  caption?: string
  label_word_count?: number
  [key: string]: string | number | undefined
}

export interface FilterCondition {
  feature: string
  min?: number
  max?: number
  textSearch?: string
  excludeTextSearch?: string
  type: 'numeric' | 'text'
}


