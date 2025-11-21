# Translation Ranker

A web application for annotating and reranking translation options from a Google Sheet. The app automatically loads 5 random examples from the sheet, allows users to rerank translations via drag-and-drop, and saves annotations back to the Google Sheet.

## Features

- 📊 Auto-loads from Google Sheet: [https://docs.google.com/spreadsheets/d/1C28DqXCkz8DqCeuCF5ibNqiq50l4K4XKp5TnjIGPYbU](https://docs.google.com/spreadsheets/d/1C28DqXCkz8DqCeuCF5ibNqiq50l4K4XKp5TnjIGPYbU)
- 🎲 Shows 5 random examples for annotation
- 🎯 Interactive drag-and-drop reranking of 7 translations
- 💾 Saves annotations directly back to Google Sheet
- 🚀 Ready for Vercel deployment

## Google Sheet Format

The Google Sheet should have the following columns:
- Column A: `id` - Unique identifier for each row (e.g., "es-cu-0")
- Column B: `sentence` - The original sentence in Spanish
- Columns C-I: 7Translations (columns: ad, an, bo, ca, op, pa, no)

After annotation, new columns will be added:
- `ranked_translation_1` through `ranked_translation_7` - The reranked translations in order

## Configuration

Set the sheet IDs via environment variables so you only have to change them once:

| Scope | Variable | Description |
| --- | --- | --- |
| Client (Next.js) | `NEXT_PUBLIC_GOOGLE_SHEET_ID` | Spreadsheet ID used when loading data |
| Client (optional) | `NEXT_PUBLIC_GOOGLE_SHEET_GID` | Specific tab GID (defaults to `0`) |
| Server (API route) | `GOOGLE_SHEET_ID` | Used when the fallback CSV fetch runs; falls back to `NEXT_PUBLIC_GOOGLE_SHEET_ID` |
| Server (optional) | `GOOGLE_SHEET_GID` | Tab GID for server-side CSV fetch |

Create an `.env.local` file for local development:

```
NEXT_PUBLIC_GOOGLE_SHEET_ID=your_sheet_id
NEXT_PUBLIC_GOOGLE_SHEET_GID=0
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/...
GOOGLE_SHEET_ID=your_sheet_id   # optional override
GOOGLE_SHEET_GID=0              # optional override
```

Remember to set the same variables in your Vercel project settings.

## Setup Instructions

### 1. Local Development

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Set Up Google Apps Script (Required for Sheet Updates)

To enable saving annotations back to Google Sheets, you need to deploy a Google Apps Script:

1. Open your Google Sheet: [https://docs.google.com/spreadsheets/d/1C28DqXCkz8DqCeuCF5ibNqiq50l4K4XKp5TnjIGPYbU](https://docs.google.com/spreadsheets/d/1C28DqXCkz8DqCeuCF5ibNqiq50l4K4XKp5TnjIGPYbU)

2. Go to **Extensions** > **Apps Script**

3. Delete any existing code and paste the contents of `google-apps-script.js` from this repository

4. Update the `SHEET_ID` in the script if needed (keep it in sync with the env vars above)

5. Click **Save** (💾 icon) and give your project a name

6. Click **Deploy** > **New deployment**

7. Click the gear icon ⚙️ next to "Select type" and choose **Web app**

8. Configure:
   - **Execute as**: Me
   - **Who has access**: Anyone

9. Click **Deploy**

10. Copy the **Web app URL** that appears

11. **Authorize the script** when prompted (click "Authorize access" and grant permissions)

### 3. Deploy to Vercel

#### Option 1: Deploy via Vercel Dashboard

1. Push your code to a GitHub repository

2. Go to [Vercel](https://vercel.com) and sign in

3. Click **New Project**

4. Import your GitHub repository

5. Vercel will automatically detect Next.js

6. **Add Environment Variable**:
   - Name: `GOOGLE_APPS_SCRIPT_URL`
   - Value: The Web app URL you copied from Google Apps Script

7. Click **Deploy**

#### Option 2: Deploy via Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Add environment variable:
```bash
vercel env add GOOGLE_APPS_SCRIPT_URL
```
Enter the Web app URL when prompted.

## How It Works

1. **Auto-Load**: When a user visits the website, it automatically loads data from the configured Google Sheet

2. **Random Selection**: The app selects 5 random rows from the sheet for annotation

3. **Annotation**: Users see all 5 sentences at once and can drag-and-drop to rerank the 7 translations for each sentence

4. **Submit**: When users click "Submit Annotations", the rankings are saved to new columns in the Google Sheet:
   - `ranked_translation_1` (best translation)
   - `ranked_translation_2` through `ranked_translation_7` (in descending order)

5. **Next Batch**: After successful submission, the app loads 5 new random examples

## Google Sheet Permissions

The Google Sheet needs to be:
- **Publicly readable** (for the app to fetch data via CSV export)
- **Editable by the Google Apps Script** (the script runs with your permissions)

To make the sheet publicly readable:
1. Open the sheet
2. Click **Share** button
3. Click **Change to anyone with the link**
4. Set permission to **Viewer**
5. Click **Done**

## Troubleshooting

### Annotations aren't saving to the sheet

1. Verify that `GOOGLE_APPS_SCRIPT_URL` is set in Vercel environment variables
2. Check that the Google Apps Script is deployed and accessible
3. Verify the script has permission to edit the sheet
4. Check browser console and Vercel logs for errors

### Sheet not loading

1. Verify the sheet is publicly accessible (View access)
2. Check the sheet ID is correct in the code
3. Ensure the sheet has the required columns (id, sentence, and 7 translation columns)

## Technologies

- Next.js 14 (App Router)
- React 18
- TypeScript
- react-beautiful-dnd (drag and drop)
- Google Apps Script (for sheet updates)
- Vercel (hosting)

## License

MIT
