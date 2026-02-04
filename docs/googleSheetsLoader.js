/* googleSheetsLoader.js
   Reusable module for fetching data from Google Sheets via the Visualization API.
*/

const GoogleSheetsLoader = (() => {
  const SPREADSHEET_ID = '1lFPZ5yyC6Zt1_d8MxOriGBH4v9G07bXetwjCtWGcPUw';

  /**
   * Builds a Google Sheets Visualization API URL.
   * @param {string} sheetName - The name of the sheet tab.
   * @param {string} query - The SQL-like query (e.g., 'SELECT P', 'SELECT B').
   * @returns {string} - The full URL.
   */
  function buildUrl(sheetName, query) {
    return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tq=${encodeURIComponent(query)}`;
  }

  /**
   * Parses Google's Visualization API response.
   * Google returns: google.visualization.Query.setResponse({...});
   * @param {string} text - The raw response text.
   * @returns {object|null} - Parsed JSON object or null if parsing fails.
   */
  function parseGvizResponse(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) return null;
    const jsonString = text.substring(start, end + 1);
    return JSON.parse(jsonString);
  }

  /**
   * Fetches data from a Google Sheet.
   * @param {object} options - Configuration options.
   * @param {string} options.sheetName - Name of the sheet tab.
   * @param {string} options.query - SQL-like query (e.g., 'SELECT P', 'SELECT B').
   * @param {boolean} [options.cache=false] - Whether to use cache (default: no-store).
   * @returns {Promise<Array>} - Array of rows from the response.
   */
  async function fetchSheet({ sheetName, query, cache = false }) {
    try {
      const url = buildUrl(sheetName, query);
      const res = await fetch(url, { cache: cache ? 'default' : 'no-store' });
      
      if (!res.ok) {
        console.error(`Failed to load sheet "${sheetName}". Status:`, res.status);
        return [];
      }

      const text = await res.text();
      const apiResponse = parseGvizResponse(text);
      const rows = apiResponse?.table?.rows;
      
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.error(`Error fetching sheet "${sheetName}":`, e);
      return [];
    }
  }

  /**
   * Fetches a single cell value from a Google Sheet.
   * @param {object} options - Configuration options.
   * @param {string} options.sheetName - Name of the sheet tab.
   * @param {string} options.cell - Cell reference (e.g., 'B2').
   * @param {boolean} [options.cache=false] - Whether to use cache.
   * @returns {Promise<string|null>} - The cell value or null.
   */
  async function fetchCell({ sheetName, cell, cache = false }) {
    // Parse cell reference (e.g., 'B2' -> column B, row 2)
    const match = cell.match(/^([A-Z]+)(\d+)$/i);
    if (!match) {
      console.error('Invalid cell reference:', cell);
      return null;
    }

    const column = match[1].toUpperCase();
    const row = parseInt(match[2], 10);
    
    // Build query to get specific cell: SELECT column LIMIT 1 OFFSET (row-1)
    // Note: OFFSET is 0-indexed, and there's usually a header row
    const query = `SELECT ${column} LIMIT 1 OFFSET ${row - 1}`;
    
    const rows = await fetchSheet({ sheetName, query, cache });
    
    if (rows.length === 0) return null;
    
    const value = rows[0]?.c?.[0]?.v ?? null;
    return value !== null ? String(value) : null;
  }

  // Public API
  return {
    fetchSheet,
    fetchCell,
    parseGvizResponse,
    SPREADSHEET_ID
  };
})();

// Export for use in other scripts
window.GoogleSheetsLoader = GoogleSheetsLoader;

