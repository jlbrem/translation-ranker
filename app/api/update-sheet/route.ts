import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_SHEET_ID = '1C28DqXCkz8DqCeuCF5ibNqiq50l4K4XKp5TnjIGPYbU'
const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL

interface AnnotationUpdate {
  id: string
  rowIndex: number
  rankings: string[] // Ordered list of translations (ranked 1-7)
}

// Helper to parse CSV line properly (handles quoted fields)
function parseCSVLine(line: string): string[] {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const annotations: AnnotationUpdate[] = body.annotations

    if (!annotations || !Array.isArray(annotations) || annotations.length === 0) {
      return NextResponse.json(
        { error: 'Invalid annotations data' },
        { status: 400 }
      )
    }

    // If Google Apps Script URL is configured, use it to update the sheet
    if (GOOGLE_APPS_SCRIPT_URL) {
      try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ annotations }),
        })

        if (!response.ok) {
          throw new Error(`Google Apps Script returned status ${response.status}`)
        }

        const result = await response.json()
        
        if (result.error) {
          throw new Error(result.error)
        }

        return NextResponse.json({
          success: true,
          message: 'Annotations successfully updated in Google Sheet',
          result
        })
      } catch (error: any) {
        console.error('Error calling Google Apps Script:', error)
        return NextResponse.json(
          { error: `Failed to update sheet: ${error.message}` },
          { status: 500 }
        )
      }
    }

    // Fallback: Prepare updates (for when Google Apps Script is not configured)
    const csvUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=0`
    const csvResponse = await fetch(csvUrl)
    
    if (!csvResponse.ok) {
      throw new Error('Failed to fetch Google Sheet')
    }

    const csvText = await csvResponse.text()
    const lines = csvText.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      throw new Error('Sheet appears to be empty')
    }

    const headerLine = lines[0]
    const headers = parseCSVLine(headerLine)

    // Find column indices
    const idColIndex = headers.findIndex(h => h.toLowerCase() === 'id')
    if (idColIndex === -1) {
      throw new Error('ID column not found in sheet')
    }

    // Build row number map
    const idToRowMap: { [key: string]: number } = {}
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i])
      if (row[idColIndex]) {
        const id = row[idColIndex].replace(/^"|"$/g, '').trim()
        if (id) {
          idToRowMap[id] = i + 1 // 1-indexed for Google Sheets
        }
      }
    }

    // Prepare updates for reference
    const updates = annotations.map(ann => {
      const rowNum = idToRowMap[ann.id] || ann.rowIndex
      return {
        id: ann.id,
        rowNum,
        rankings: ann.rankings.slice(0, 7)
      }
    })

    return NextResponse.json({
      success: false,
      message: 'Google Apps Script URL not configured',
      updates: updates,
      note: 'To enable sheet updates, set GOOGLE_APPS_SCRIPT_URL environment variable. See README for setup instructions.'
    })

  } catch (error: any) {
    console.error('Error updating sheet:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process annotations' },
      { status: 500 }
    )
  }
}
