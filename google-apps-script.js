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
 * Helper function to create JSON response
 * Note: Google Apps Script Web Apps with "Anyone" access automatically handle CORS
 */
function createJSONResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle GET request (for testing and authorization)
 */
function doGet(e) {
  return createJSONResponse({
    success: true,
    message: 'Google Apps Script is deployed and authorized',
    instructions: 'This endpoint accepts POST requests with annotations data',
    example: {
      method: 'POST',
      body: {
        annotations: [
          {
            id: 'es-cu-0',
            rowIndex: 2,
            rankings: ['ca', 'no', 'ad', 'an', 'bo', 'pa', 'op']
          }
        ]
      }
    }
  });
}

/**
 * Handle OPTIONS request for CORS preflight
 * Note: Google Apps Script handles CORS automatically for "Anyone" access
 */
function doOptions() {
  return createJSONResponse({ message: 'CORS preflight' });
}

/**
 * Handle POST request to update annotations
 * Each sentence needs 3 annotations (Annotator_1, Annotator_2, Annotator_3)
 * Uses the first available annotator column for each sentence
 */
function doPost(e) {
  try {
    // Parse request data
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return createJSONResponse({
        error: 'Invalid JSON in request body',
        details: parseError.toString()
      });
    }
    
    const annotations = data.annotations;
    
    if (!annotations || !Array.isArray(annotations)) {
      return createJSONResponse({
        error: 'Invalid data: annotations must be an array'
      });
    }
    
    // Open spreadsheet
    let spreadsheet;
    try {
      spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    } catch (sheetError) {
      return createJSONResponse({
        error: 'Failed to open spreadsheet',
        details: sheetError.toString()
      });
    }
    
    const sheet = spreadsheet.getSheetByName('Sheet1');
    
    if (!sheet) {
      return createJSONResponse({
        error: 'Sheet1 not found in spreadsheet'
      });
    }
    
    // Get sheet headers to find column positions
    const lastCol = sheet.getLastColumn();
    const sheetHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const idColIndex = sheetHeaders.findIndex(h => h.toString().toLowerCase() === 'id') + 1;
    
    if (idColIndex === 0) {
      return createJSONResponse({
        error: 'ID column not found in sheet headers'
      });
    }
    
    // Find or create Annotator columns (max 3: Annotator_1, Annotator_2, Annotator_3)
    const annotatorColNames = ['Annotator_1', 'Annotator_2', 'Annotator_3'];
    const annotatorColIndices = {};
    let lastAnnotatorCol = lastCol;
    
    // Find existing annotator columns or create them
    for (let i = 0; i < annotatorColNames.length; i++) {
      const colName = annotatorColNames[i];
      let colIndex = sheetHeaders.findIndex(h => 
        h.toString().trim().toLowerCase() === colName.toLowerCase()
      ) + 1;
      
      if (colIndex === 0) {
        // Column doesn't exist, create it
        lastAnnotatorCol = lastCol + i + 1;
        colIndex = lastAnnotatorCol;
        sheet.getRange(1, colIndex).setValue(colName);
        // Update sheetHeaders array for subsequent checks
        sheetHeaders.push(colName);
      }
      
      annotatorColIndices[colName] = colIndex;
    }
    
    // Get all ID values to find row numbers
    const lastRow = sheet.getLastRow();
    const idRange = sheet.getRange(1, idColIndex, lastRow, 1);
    const idValues = idRange.getValues();
    
    // Get all annotator column values to check what's already filled
    const annotatorRanges = {};
    const annotatorValues = {};
    for (const colName of annotatorColNames) {
      const colIndex = annotatorColIndices[colName];
      annotatorRanges[colName] = sheet.getRange(2, colIndex, lastRow - 1, 1); // Start from row 2 (skip header)
      annotatorValues[colName] = annotatorRanges[colName].getValues();
    }
    
    // Update rows
    const updates = [];
    
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
        // Find which annotator column to use for this row
        // Use the first column that doesn't have a value for this row
        let targetColName = null;
        let targetColIndex = null;
        
        for (const colName of annotatorColNames) {
          const colIndex = annotatorColIndices[colName];
          const valueIndex = rowNum - 2; // Adjust for header row (row 1) and array index (0-based)
          
          if (valueIndex >= 0 && valueIndex < annotatorValues[colName].length) {
            const existingValue = annotatorValues[colName][valueIndex][0];
            
            // Check if this cell is empty or only whitespace
            if (!existingValue || existingValue.toString().trim() === '') {
              targetColName = colName;
              targetColIndex = colIndex;
              break;
            }
          } else {
            // Row is beyond current data, use this column
            targetColName = colName;
            targetColIndex = colIndex;
            break;
          }
        }
        
        if (!targetColName) {
          // All 3 annotator columns are filled for this row
          updates.push({
            id: ann.id,
            success: false,
            error: `All 3 annotator columns are already filled for this sentence`
          });
          continue;
        }
        
        try {
          // Validate that rankings are column names, not translations
          const rankings = ann.rankings || [];
          
          // Debug: check if rankings is empty
          if (!rankings || rankings.length === 0) {
            throw new Error('Rankings array is empty. Annotation data: ' + JSON.stringify({
              id: ann.id,
              hasRankings: !!ann.rankings,
              rankingsType: typeof ann.rankings
            }));
          }
          
          // Check if rankings look like column names (short, 2-3 chars) or translations (long sentences)
          const looksLikeTranslations = rankings.some(r => r && r.length > 20);
          
          if (looksLikeTranslations) {
            throw new Error('Received translation text instead of column names. Rankings: ' + JSON.stringify(rankings.slice(0, 2)));
          }
          
          // Convert rankings array to comma-separated string (e.g., "ca,no,ad,an,bo,pa,op")
          const rankingString = rankings.join(',');
          
          if (!rankingString || rankingString.trim() === '') {
            throw new Error('Ranking string is empty after joining. Rankings: ' + JSON.stringify(rankings));
          }
          
          // Update the cell with the ranking string
          const targetCell = sheet.getRange(rowNum, targetColIndex);
          targetCell.setValue(rankingString);
          
          // Force flush to ensure write
          SpreadsheetApp.flush();
          
          // Verify the write
          const verifyValue = targetCell.getValue();
          
          updates.push({
            id: ann.id,
            row: rowNum,
            column: targetColName,
            columnIndex: targetColIndex,
            ranking: rankingString,
            verified: verifyValue,
            rankingsReceived: rankings,
            success: true
          });
        } catch (updateError) {
          updates.push({
            id: ann.id,
            row: rowNum,
            success: false,
            error: `Failed to update row ${rowNum}: ${updateError.toString()}`,
            rankingsReceived: ann.rankings,
            rankingsType: typeof ann.rankings
          });
        }
      } else {
        updates.push({
          id: ann.id,
          success: false,
          error: `Row not found for ID: ${ann.id}`
        });
      }
    }
    
    return createJSONResponse({
      success: true,
      updates: updates
    });
    
  } catch (error) {
    return createJSONResponse({
      error: 'Unexpected error',
      details: error.toString(),
      stack: error.stack
    });
  }
}
