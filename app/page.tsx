'use client'

import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd'

interface TranslationRow {
  id: string
  sentence: string
  translations: string[]
  translationColumns: string[] // Column names (ad, an, bo, ca, op, pa, no) for each translation
  rankedTranslations?: string[]
  rankedColumnNames?: string[] // Column names in ranked order
  originalRowIndex?: number // Store original row index for updating
}

interface TranslationRowWithNeeds extends TranslationRow {
  needsAnnotatorRound: 1 | 2 | 3 | null
}

const GOOGLE_SHEET_ID = '1C28DqXCkz8DqCeuCF5ibNqiq50l4K4XKp5TnjIGPYbU'
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=0`

export default function Home() {
  const [data, setData] = useState<TranslationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [shouldRedirect, setShouldRedirect] = useState(false)
  const [comments, setComments] = useState<{ [key: string]: string }>({}) // id -> comment
  const [error, setError] = useState<string | null>(null)

  const PROLIFIC_COMPLETION_URL = 'https://app.prolific.com/submissions/complete?cc=C1HEEFFM'

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
      const headerColumnNames = headers.slice(translationStartIndex, translationStartIndex + 7).map(h => h.toLowerCase().trim())
      
      // Helper to find column indices with flexible naming
      const findColumnIndex = (variants: string[]) => {
        return headers.findIndex(header => {
          const normalized = header.toLowerCase().trim()
          return variants.some(variant => normalized === variant)
        })
      }

      const annotator1RankIndex = findColumnIndex([
        'annotator_1_rankings',
        'annotator 1 rankings',
        'annotator_1',
        'annotator 1'
      ])
      const annotator2RankIndex = findColumnIndex([
        'annotator_2_rankings',
        'annotator 2 rankings',
        'annotator_2',
        'annotator 2'
      ])
      const annotator3RankIndex = findColumnIndex([
        'annotator_3_rankings',
        'annotator 3 rankings',
        'annotator_3',
        'annotator 3'
      ])

      const annotator1CommentIndex = findColumnIndex([
        'annotator_1_comments',
        'annotator 1 comments',
        'annotator_1_comment',
        'annotator 1 comment'
      ])
      const annotator2CommentIndex = findColumnIndex([
        'annotator_2_comments',
        'annotator 2 comments',
        'annotator_2_comment',
        'annotator 2 comment'
      ])
      const annotator3CommentIndex = findColumnIndex([
        'annotator_3_comments',
        'annotator 3 comments',
        'annotator_3_comment',
        'annotator 3 comment'
      ])

      // Debug: log column names extracted
      console.log('Translation column headers:', headerColumnNames)
      console.log('Annotator column indices:', {
        annotator1RankIndex,
        annotator2RankIndex,
        annotator3RankIndex,
        annotator1CommentIndex,
        annotator2CommentIndex,
        annotator3CommentIndex
      })

      // Parse all rows and track annotation status
      const allRows: TranslationRowWithNeeds[] = []
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i])
        
        if (row.length < translationStartIndex + 7) continue

        const id = row[idIndex]?.trim() || ''
        const sentence = row[sentenceIndex]?.trim() || ''
        
        if (!id || !sentence) continue

        const numericIdMatch = id.match(/\d+/)
        const numericId = numericIdMatch ? parseInt(numericIdMatch[0], 10) : null

        if (numericId === null || Number.isNaN(numericId) || numericId < 0 || numericId > 49) {
          console.log('Skipping row outside ID range 0-49:', id)
          continue
        }

        const translations: string[] = []
        const translationColumns: string[] = []
        
        // Map translations to their column names
        for (let j = 0; j < 7; j++) {
          const translation = row[translationStartIndex + j]?.trim() || ''
          const columnName = headerColumnNames[j] || '' // Already lowercase from extraction
          
          if (translation && columnName) {
            translations.push(translation)
            translationColumns.push(columnName)
          }
        }
        
        // Check annotator column values
        const annotator1RankValue = annotator1RankIndex >= 0 ? (row[annotator1RankIndex]?.trim() || '') : ''
        const annotator2RankValue = annotator2RankIndex >= 0 ? (row[annotator2RankIndex]?.trim() || '') : ''
        const annotator3RankValue = annotator3RankIndex >= 0 ? (row[annotator3RankIndex]?.trim() || '') : ''

        const annotator1CommentValue = annotator1CommentIndex >= 0 ? (row[annotator1CommentIndex]?.trim() || '') : ''
        const annotator2CommentValue = annotator2CommentIndex >= 0 ? (row[annotator2CommentIndex]?.trim() || '') : ''
        const annotator3CommentValue = annotator3CommentIndex >= 0 ? (row[annotator3CommentIndex]?.trim() || '') : ''
        
        const annotator1Complete = annotator1RankIndex >= 0 && annotator1CommentIndex >= 0
          ? annotator1RankValue.length > 0 && annotator1CommentValue.length > 0
          : annotator1RankValue.length > 0
        const annotator2Complete = annotator2RankIndex >= 0 && annotator2CommentIndex >= 0
          ? annotator2RankValue.length > 0 && annotator2CommentValue.length > 0
          : annotator2RankValue.length > 0
        const annotator3Complete = annotator3RankIndex >= 0 && annotator3CommentIndex >= 0
          ? annotator3RankValue.length > 0 && annotator3CommentValue.length > 0
          : annotator3RankValue.length > 0
        
        // Determine which annotator round is empty (priority: 1, then 2, then 3)
        let needsAnnotatorRound: 1 | 2 | 3 | null = null
        if (!annotator1Complete) {
          needsAnnotatorRound = 1
        } else if (!annotator2Complete) {
          needsAnnotatorRound = 2
        } else if (!annotator3Complete) {
          needsAnnotatorRound = 3
        }

        if (needsAnnotatorRound === null) {
          console.log('Skipping fully annotated row:', id)
          continue
        }

        if (translations.length > 0) {
          // Randomize the initial order of translations and column names
          const shuffledIndices = Array.from({ length: translations.length }, (_, idx) => idx)
            .sort(() => Math.random() - 0.5)
          
          const shuffledTranslations = shuffledIndices.map(idx => translations[idx])
          const shuffledColumnNames = shuffledIndices.map(idx => translationColumns[idx])
          
          allRows.push({
            id,
            sentence,
            translations,
            translationColumns,
            rankedTranslations: shuffledTranslations,
            rankedColumnNames: shuffledColumnNames,
            originalRowIndex: i + 1, // 1-indexed for Google Sheets
            needsAnnotatorRound
          })
        }
      }

      // Prioritize rows that need annotation for the lowest available round
      let candidateRows = allRows.filter(row => row.needsAnnotatorRound === 1)
      if (candidateRows.length === 0) {
        candidateRows = allRows.filter(row => row.needsAnnotatorRound === 2)
      }
      if (candidateRows.length === 0) {
        candidateRows = allRows.filter(row => row.needsAnnotatorRound === 3)
      }

      if (candidateRows.length === 0) {
        console.warn('All eligible rows (IDs 0-49) are fully annotated. No examples available.')
        setData([])
        setLoading(false)
        return
      }

      const firstCandidate = candidateRows[0]
      console.log(`Found ${candidateRows.length} eligible rows needing annotation (round ${firstCandidate?.needsAnnotatorRound || 'unknown'})`)

      // Select up to 5 random rows from the prioritized candidate set
      const shuffled = [...candidateRows].sort(() => Math.random() - 0.5)
      const selectedRows = shuffled.slice(0, 5)
      const cleanedRows = selectedRows.map(({ needsAnnotatorRound, ...row }) => row)

      setData(cleanedRows)
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
    
    if (currentItem && currentItem.rankedTranslations && currentItem.rankedColumnNames) {
      // Reorder both translations and column names
      const translations = Array.from(currentItem.rankedTranslations)
      const columnNames = Array.from(currentItem.rankedColumnNames)
      
      const [reorderedTranslation] = translations.splice(result.source.index, 1)
      const [reorderedColumnName] = columnNames.splice(result.source.index, 1)
      
      translations.splice(result.destination.index, 0, reorderedTranslation)
      columnNames.splice(result.destination.index, 0, reorderedColumnName)
      
      currentItem.rankedTranslations = translations
      currentItem.rankedColumnNames = columnNames
      setData(newData)
    }
  }

  // Check if all sentences have been interacted with
  const checkAllInteractions = () => {
    if (data.length === 0) return false

    return data.every(row => {
      // Check if rankings have been changed from original order
      const hasReranked = row.rankedColumnNames && row.translationColumns && 
        JSON.stringify(row.rankedColumnNames) !== JSON.stringify(row.translationColumns)
      
      // Check if comment has been entered
      const hasComment = comments[row.id] && comments[row.id].trim().length > 0
      
      return hasReranked && hasComment
    })
  }

  const canSubmit = checkAllInteractions()

  const handleSubmit = async () => {
    console.log('=== SUBMIT BUTTON CLICKED ===')
    console.log('Data length:', data.length)
    
    // Force visible alert to test if function is called
    if (typeof window !== 'undefined') {
      console.log('Window object available, function is executing')
    }
    
    if (data.length === 0) {
      alert('No data to submit')
      return
    }

    // Check if all sentences have been interacted with
    if (!canSubmit) {
      const missingInteractions = data.filter(row => {
        const hasReranked = row.rankedColumnNames && row.translationColumns && 
          JSON.stringify(row.rankedColumnNames) !== JSON.stringify(row.translationColumns)
        const hasComment = comments[row.id] && comments[row.id].trim().length > 0
        return !hasReranked || !hasComment
      })
      
      const missingReranks = missingInteractions.filter(row => {
        const hasReranked = row.rankedColumnNames && row.translationColumns && 
          JSON.stringify(row.rankedColumnNames) !== JSON.stringify(row.translationColumns)
        return !hasReranked
      })
      const missingComments = missingInteractions.filter(row => {
        const hasComment = comments[row.id] && comments[row.id].trim().length > 0
        return !hasComment
      })
      
      let message = 'Please complete all interactions before submitting:\n\n'
      if (missingReranks.length > 0) {
        message += `- Reorder rankings for ${missingReranks.length} sentence(s)\n`
      }
      if (missingComments.length > 0) {
        message += `- Add comments for ${missingComments.length} sentence(s)\n`
      }
      alert(message)
      return
    }

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
      // Validate that we have ranked column names
      const invalidRows = data.filter(row => !row.rankedColumnNames || row.rankedColumnNames.length === 0)
      if (invalidRows.length > 0) {
        alert(`Error: Some rows are missing column name rankings. Please refresh and try again.`)
        setSubmitting(false)
        return
      }

      const annotations = data.map(row => {
        // Ensure we're sending column names, not translations
        let rankings = row.rankedColumnNames || []
        
        // If rankedColumnNames is missing or empty, try to derive from rankedTranslations
        if (rankings.length === 0 && row.rankedTranslations && row.translations && row.translationColumns) {
          // Map each ranked translation back to its column name
          rankings = row.rankedTranslations.map(rankedTranslation => {
            // Find the index of this translation in the original translations array
            const origIndex = row.translations.findIndex(t => t === rankedTranslation)
            if (origIndex >= 0 && origIndex < row.translationColumns.length) {
              return row.translationColumns[origIndex]
            }
            return null
          }).filter(cn => cn !== null) as string[]
          
          console.warn('Derived column names from translations for row:', row.id, rankings)
        }
        
        if (rankings.length === 0) {
          console.error('Missing rankedColumnNames for row:', row.id, {
            hasRankedColumnNames: !!row.rankedColumnNames,
            hasRankedTranslations: !!row.rankedTranslations,
            hasTranslationColumns: !!row.translationColumns
          })
        }
        
        // Final check: ensure rankings are column names (short strings), not translations (long text)
        const hasLongStrings = rankings.some(r => r && r.length > 10)
        if (hasLongStrings) {
          console.error('ERROR: Rankings contain translation text instead of column names:', {
            rowId: row.id,
            rankings: rankings.slice(0, 2)
          })
          throw new Error(`Row ${row.id}: Rankings appear to contain translation text instead of column names. Please refresh and try again.`)
        }
        
        return {
          id: row.id,
          rowIndex: row.originalRowIndex || 0,
          rankings: rankings, // Send column names in ranked order (e.g., ["ca", "no", "ad", ...])
          comment: comments[row.id] || '' // Include comment for this sentence
        }
      })
      
      // Debug: log what we're sending
      console.log('Submitting annotations:', annotations.map(a => ({ 
        id: a.id, 
        rankings: a.rankings,
        rankingsLength: a.rankings?.length || 0,
        firstRanking: a.rankings?.[0]
      })))
      
      // Validate before sending
      const emptyRankings = annotations.filter(a => !a.rankings || a.rankings.length === 0)
      if (emptyRankings.length > 0) {
        console.error('ERROR: Some annotations have empty rankings:', emptyRankings)
        alert(`Error: ${emptyRankings.length} annotation(s) have empty rankings. Please check the console for details.`)
        setSubmitting(false)
        return
      }

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

      // Redirect to Prolific completion URL
      setSubmitted(true)
      setShouldRedirect(true)
      
      // Redirect after a brief delay to show success message
      setTimeout(() => {
        window.location.href = PROLIFIC_COMPLETION_URL
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to submit annotations')
    } finally {
      setSubmitting(false)
    }
  }

  // Show thank you message before redirect
  if (submitted && shouldRedirect) {
    return (
      <div className="container">
        <div className="header">
          <h1>Thank You! 🎉</h1>
          <p>Your annotations have been successfully submitted.</p>
        </div>
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          background: '#f8f9fa',
          borderRadius: '8px',
          marginTop: '30px'
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '20px', color: '#333' }}>
            Redirecting you to complete the survey...
          </div>
          <div style={{ color: '#666', fontSize: '1.1rem', marginBottom: '20px' }}>
            If you are not redirected automatically, <a href={PROLIFIC_COMPLETION_URL} style={{ color: '#667eea' }}>click here</a>.
          </div>
        </div>
      </div>
    )
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
          
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ marginBottom: '10px' }}>Comments:</h3>
            <textarea
              placeholder="Please explain your reasoning for these rankings. What did you like or dislike about the translation options?"
              value={comments[item.id] || ''}
              onChange={(e) => setComments(prev => ({ ...prev, [item.id]: e.target.value }))}
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                border: '2px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.95rem',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>
        </div>
      ))}

      {data.length > 0 && (
        <div className="save-section">
          <button 
            onClick={(e) => {
              e.preventDefault()
              console.log('Button clicked!')
              handleSubmit()
            }} 
            className="btn btn-secondary" 
            style={{ 
              fontSize: '1.1rem', 
              padding: '15px 30px',
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? 'pointer' : 'not-allowed'
            }}
            disabled={submitting || submitted || !canSubmit}
            type="button"
          >
            {submitting ? 'Submitting...' : submitted ? 'Submitted!' : 'Submit Annotations'}
          </button>
          {!canSubmit && (
            <p style={{ marginTop: '15px', color: '#d32f2f', fontSize: '0.9rem' }}>
              ⚠️ Please interact with all {data.length} sentences: reorder rankings and add comments for each one.
            </p>
          )}
          {canSubmit && (
            <p style={{ marginTop: '15px', color: '#666' }}>
              ✓ All interactions complete. Your rankings and comments will be saved to the Google Sheet.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
