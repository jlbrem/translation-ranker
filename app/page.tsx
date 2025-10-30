'use client'

import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd'

interface TranslationRow {
  id: string
  sentence: string
  translations: string[]
  rankedTranslations?: string[]
  originalRowIndex?: number // Store original row index for updating
}

const GOOGLE_SHEET_ID = '1C28DqXCkz8DqCeuCF5ibNqiq50l4K4XKp5TnjIGPYbU'
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=0`

export default function Home() {
  const [data, setData] = useState<TranslationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(GOOGLE_SHEET_URL)
      if (!response.ok) {
        throw new Error('Failed to fetch Google Sheet')
      }

      const csvText = await response.text()
      const lines = csvText.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        throw new Error('No data found in sheet')
      }

      // Parse header
      const headerLine = lines[0]
      const headers = parseCSVLine(headerLine)
      
      // Find column indices
      const idIndex = headers.findIndex(h => h.toLowerCase() === 'id')
      const sentenceIndex = headers.findIndex(h => h.toLowerCase() === 'sentence')
      
      if (idIndex === -1 || sentenceIndex === -1) {
        throw new Error('Required columns (id, sentence) not found')
      }

      // Translation columns are after sentence (columns C-I: ad, an, bo, ca, op, pa, no)
      const translationStartIndex = sentenceIndex + 1
      const translationColumns = headers.slice(translationStartIndex, translationStartIndex + 7)

      // Parse all rows
      const allRows: TranslationRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i])
        
        if (row.length < translationStartIndex + 7) continue

        const id = row[idIndex]?.trim() || ''
        const sentence = row[sentenceIndex]?.trim() || ''
        
        if (!id || !sentence) continue

        const translations: string[] = []
        for (let j = 0; j < 7; j++) {
          const translation = row[translationStartIndex + j]?.trim() || ''
          if (translation) {
            translations.push(translation)
          }
        }

        if (translations.length > 0) {
          allRows.push({
            id,
            sentence,
            translations,
            rankedTranslations: [...translations],
            originalRowIndex: i + 1 // 1-indexed for Google Sheets
          })
        }
      }

      // Select 5 random rows
      const shuffled = [...allRows].sort(() => Math.random() - 0.5)
      const selectedRows = shuffled.slice(0, 5)

      setData(selectedRows)
      setLoading(false)
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
      setLoading(false)
    }
  }

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++ // Skip next quote
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const onDragEnd = (result: DropResult, rowIndex: number) => {
    if (!result.destination) return

    const newData = [...data]
    const currentItem = newData[rowIndex]
    
    if (currentItem && currentItem.rankedTranslations) {
      const items = Array.from(currentItem.rankedTranslations)
      const [reorderedItem] = items.splice(result.source.index, 1)
      items.splice(result.destination.index, 0, reorderedItem)
      
      currentItem.rankedTranslations = items
      setData(newData)
    }
  }

  const handleSubmit = async () => {
    if (data.length === 0) return

    // Check if all rows are ranked
    const allRanked = data.every(row => 
      row.rankedTranslations && row.rankedTranslations.length > 0
    )

    if (!allRanked) {
      alert('Please rank all translations before submitting')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const annotations = data.map(row => ({
        id: row.id,
        rowIndex: row.originalRowIndex || 0,
        rankings: row.rankedTranslations || []
      }))

      const response = await fetch('/api/update-sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ annotations }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update Google Sheet')
      }

      setSubmitted(true)
      setTimeout(() => {
        // Reload with new random rows
        loadData()
        setSubmitted(false)
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to submit annotations')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="header">
          <h1>Translation Ranker</h1>
          <p>Loading data from Google Sheets...</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '1.2rem', color: '#666' }}>Please wait...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="header">
          <h1>Translation Ranker</h1>
          <p>Error loading data</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ color: '#d32f2f', marginBottom: '20px' }}>{error}</div>
          <button onClick={loadData} className="btn btn-primary">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="header">
        <h1>Translation Ranker</h1>
        <p>Rank the translations for each sentence (drag to reorder)</p>
        {data.length > 0 && (
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '10px' }}>
            You are annotating {data.length} sentence{data.length > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {submitted && (
        <div style={{
          padding: '15px',
          background: '#4caf50',
          color: 'white',
          borderRadius: '6px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          ✓ Annotations submitted successfully! Loading new examples...
        </div>
      )}

      {error && (
        <div style={{
          padding: '15px',
          background: '#f44336',
          color: 'white',
          borderRadius: '6px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          Error: {error}
        </div>
      )}

      {data.map((item, rowIndex) => (
        <div key={item.id} className="sentence-card" style={{ marginBottom: '30px' }}>
          <h3>Sentence {rowIndex + 1} - ID: {item.id}</h3>
          <div className="original-sentence">
            <strong>Original Sentence:</strong><br />
            {item.sentence}
          </div>

          <h3 style={{ marginTop: '20px', marginBottom: '15px' }}>
            Rank Translations (drag to reorder, best first):
          </h3>
          
          <DragDropContext onDragEnd={(result) => onDragEnd(result, rowIndex)}>
            <Droppable droppableId={`translations-${rowIndex}`}>
              {(provided) => (
                <ul
                  className="translations-list"
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {(item.rankedTranslations || item.translations).map((translation, index) => (
                    <Draggable
                      key={`${item.id}-${index}`}
                      draggableId={`${item.id}-${index}`}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <li
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`translation-item ${snapshot.isDragging ? 'dragging' : ''}`}
                        >
                          <span className="rank-badge">{index + 1}</span>
                          {translation}
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      ))}

      {data.length > 0 && (
        <div className="save-section">
          <button 
            onClick={handleSubmit} 
            className="btn btn-secondary" 
            style={{ fontSize: '1.1rem', padding: '15px 30px' }}
            disabled={submitting || submitted}
          >
            {submitting ? 'Submitting...' : submitted ? 'Submitted!' : 'Submit Annotations'}
          </button>
          <p style={{ marginTop: '15px', color: '#666' }}>
            Your rankings will be saved to the Google Sheet.
          </p>
        </div>
      )}
    </div>
  )
}
