/**
 * Google Apps Script for updating Google Sheet with annotations
 * 
 * Instructions:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code
 * 4. Paste this code
 * 5. Save the project
 * 6. Click "Deploy" > "New deployment"
 * 7. Select type: "Web app"
 * 8. Set Execute as: "Me"
 * 9. Set Who has access: "Anyone"
 * 10. Click "Deploy"
 * 11. Copy the Web app URL
 * 12. Set GOOGLE_APPS_SCRIPT_URL environment variable in Vercel to this URL
 */

const SHEET_ID = '1C28DqXCkz8DqCeuCF5ibNqiq50l4K4XKp5TnjIGPYbU';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const annotations = data.annotations;
    
    if (!annotations || !Array.isArray(annotations)) {
      return ContentService.createTextOutput(
        JSON.stringify({ error: 'Invalid data' })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const sheet = spreadsheet.getSheetByName('Sheet1');
    
    if (!sheet) {
      throw new Error('Sheet1 not found');
    }
    
    // Get headers to find column positions
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idColIndex = headers.findIndex(h => h.toString().toLowerCase() === 'id') + 1;
    
    if (idColIndex === 0) {
      throw new Error('ID column not found');
    }
    
    // Check if annotation columns exist
    const annotationCols = [
      'ranked_translation_1',
      'ranked_translation_2',
      'ranked_translation_3',
      'ranked_translation_4',
      'ranked_translation_5',
      'ranked_translation_6',
      'ranked_translation_7'
    ];
    
    let startCol = headers.findIndex(h => 
      h.toString().toLowerCase() === annotationCols[0].toLowerCase()
    ) + 1;
    
    // If columns don't exist, add them
    if (startCol === 0) {
      startCol = headers.length + 1;
      // Add headers
      sheet.getRange(1, startCol, 1, annotationCols.length).setValues([annotationCols]);
    }
    
    // Update rows
    const updates = [];
    for (const ann of annotations) {
      // Find row by ID
      const idRange = sheet.getRange(idColIndex, 1, sheet.getLastRow(), 1);
      const idValues = idRange.getValues();
      let rowNum = -1;
      
      for (let i = 0; i < idValues.length; i++) {
        if (idValues[i][0].toString().trim() === ann.id) {
          rowNum = i + 1;
          break;
        }
      }
      
      if (rowNum > 0) {
        // Update the row with rankings
        const rankings = ann.rankings.slice(0, 7);
        // Pad with empty strings if less than 7
        while (rankings.length < 7) {
          rankings.push('');
        }
        sheet.getRange(rowNum, startCol, 1, 7).setValues([rankings]);
        updates.push({ id: ann.id, row: rowNum, success: true });
      } else {
        updates.push({ id: ann.id, success: false, error: 'Row not found' });
      }
    }
    
    return ContentService.createTextOutput(
      JSON.stringify({ success: true, updates: updates })
    ).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

