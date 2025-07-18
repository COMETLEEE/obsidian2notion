const fs = require('fs/promises');
const path = require('path');

/**
 * A utility function to add a delay.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A wrapper for Notion API calls to handle rate limiting, conflicts, and temporary server errors (like 502).
 * @param {Function} apiCall - The Notion API function to call.
 * @param {number} retries - The number of retries to attempt.
 * @returns {Promise<any>} The result of the API call.
 */
async function callWithRetry(apiCall, retries = 5) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return await apiCall();
        } catch (error) {
            // Check for rate limits, conflicts, or any 5xx server errors
            if (error.code === 'conflict_error' || error.code === 'rate_limited' || (error.status && error.status >= 500)) {
                attempt++;
                if (attempt >= retries) {
                    throw error; // Rethrow the error after the last attempt
                }
                const waitTime = Math.pow(2, attempt) * 1000; // Increased base wait time
                console.log(`  ... Notion API error (${error.status || error.code}). Retrying in ${waitTime/1000}s (Attempt ${attempt}/${retries-1})`);
                await delay(waitTime);
            } else {
                throw error; // Rethrow other errors immediately
            }
        }
    }
}

/**
 * Recursively finds all Markdown files in a directory.
 * @param {string} dir - The directory to search.
 * @returns {Promise<string[]>} A list of absolute paths to Markdown files.
 */
async function findMarkdownFiles(dir) {
  let markdownFiles = [];
  try {
    const items = await fs.readdir(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        markdownFiles = markdownFiles.concat(await findMarkdownFiles(fullPath));
      } else if (path.extname(item).toLowerCase() === '.md') {
        markdownFiles.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}: ${error.message}`);
  }
  return markdownFiles;
}

module.exports = {
    delay,
    callWithRetry,
    findMarkdownFiles,
};
