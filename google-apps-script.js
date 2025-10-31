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
 * 9. Set Who has access: "Anyone" (anonymous users)
 * 10. Click "Deploy"
 * 11. Copy the Web app URL
 * 12. Set GOOGLE_APPS_SCRIPT_URL environment variable in Vercel to this URL
 * 
 * IMPORTANT: After deploying, you must authorize the script:
 * - The first time you access the URL, Google will ask you to authorize
 * - Click "Authorize access" and grant permissions to edit the spreadsheet
 * - If you update the code, create a NEW deployment (don't just save) for changes to take effect
 */

const SHEET_ID = '1C28DqXCkz8DqCeuCF5ibNqiq50l4K4XKp5TnjIGPYbU';

/**
 * Handle OPTIONS request for CORS preflight
 */
function doOptions() {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

/**
 * Handle POST request to update annotations
 */
function doPost(e) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  try {
    // Parse request data
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return ContentService.createTextOutput(
        JSON.stringify({ error: 'Invalid JSON in request body', details: parseError.toString() })
      )
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(corsHeaders);
    }
    
    const annotations = data.annotations;
    
    if (!annotations || !Array.isArray(annotations)) {
      return ContentService.createTextOutput(
        JSON.stringify({ error: 'Invalid data: annotations must be an array' })
      )
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(corsHeaders);
    }
    
    // Open spreadsheet
    let spreadsheet;
    try {
      spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    } catch (sheetError) {
      return ContentService.createTextOutput(
        JSON.stringify({ error: 'Failed to open spreadsheet', details: sheetError.toString() })
      )
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(corsHeaders);
    }
    
    const sheet = spreadsheet.getSheetByName('Sheet1');
    
    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({ error: 'Sheet1 not found in spreadsheet' })
      )
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(corsHeaders);
    }
    
    // Get sheet headers to find column positions
    const lastCol = sheet.getLastColumn();
    const sheetHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const idColIndex = sheetHeaders.findIndex(h => h.toString().toLowerCase() === 'id') + 1;
    
    if (idColIndex === 0) {
      return ContentService.createTextOutput(
        JSON.stringify({ error: 'ID column not found in sheet headers' })
      )
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(corsHeaders);
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
    
    let startCol = sheetHeaders.findIndex(h => 
      h.toString().toLowerCase() === annotationCols[0].toLowerCase()
    ) + 1;
    
    // If columns don't exist, add them
    if (startCol === 0) {
      startCol = lastCol + 1;
      // Add headers
      sheet.getRange(1, startCol, 1, annotationCols.length).setValues([annotationCols]);
    }
    
    // Update rows
    const updates = [];
    const lastRow = sheet.getLastRow();
    const idRange = sheet.getRange(1, idColIndex, lastRow, 1);
    const idValues = idRange.getValues();
    
    for (const ann of annotations) {
      // Find row by ID
      let rowNum = -1;
      
      for (let i = 0; i < idValues.length; i++) {
        if (idValues[i][0] && idValues[i][0].toString().trim() === ann.id) {
          rowNum = i + 1;
          break;
        }
      }
      
      if (rowNum > 0) {
        try {
          // Update the row with rankings
          const rankings = ann.rankings.slice(0, 7);
          // Pad with empty strings if less than 7
          while (rankings.length < 7) {
            rankings.push('');
          }
          sheet.getRange(rowNum, startCol, 1, 7).setValues([rankings]);
          updates.push({ id: ann.id, row: rowNum, success: true });
        } catch (updateError) {
          updates.push({ 
            id: ann.id, 
            success: false, 
            error: `Failed to update row ${rowNum}: ${updateError.toString()}` 
          });
        }
      } else {
        updates.push({ id: ann.id, success: false, error: `Row not found for ID: ${ann.id}` });
      }
    }
    
    return ContentService.createTextOutput(
      JSON.stringify({ success: true, updates: updates })
    )
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders(corsHeaders);
    
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: 'Unexpected error', details: error.toString(), stack: error.stack })
    )
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders(corsHeaders);
  }
}
