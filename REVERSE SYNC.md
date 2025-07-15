Just for fun I had Gemini do a reverse sync script if you want to try it out. I haven't tested it yet

Of course. Creating a reverse script is an excellent way to make this a true two-way synchronization system. This script will do the opposite of the first one: it will fetch all the pages from your Notion database, convert them to Markdown, and save them as local files.

This is perfect for pulling down edits you make in Notion on your phone or web browser and syncing them back to your local Obsidian vault.

Here is the complete `README.md` file for the reverse script, including all setup instructions and the final code.

-----

# Notion to Markdown Sync (Reverse)

This script synchronizes your Notion database back to your local file system. It fetches all pages, converts their content to Markdown, downloads any images to a local `Attachments` folder, and saves the result as `.md` files, preserving your folder structure.

This is the "reverse" of the Markdown-to-Notion script. It's designed to pull changes made in Notion back down to a local vault, making it compatible with Obsidian.

### Features

  * **Fetches All Pages:** Queries your entire Notion database.
  * **Notion to Markdown Conversion:** Converts Notion's block format into clean, standard Markdown.
  * **Local Image Handling:** Downloads images from Notion's cache, saves them locally, and creates relative Markdown links.
  * **Preserves Folder Structure:** Uses the "Path" property in your database to recreate the correct folder structure locally.
  * **Update Detection:** Compares the "Last Edited Time" from Notion with the local file's modification time to only sync pages that have been updated.

## Setup and Installation

### Prerequisites

  * [Node.js](https://nodejs.org/en/) installed on your machine.
  * Your Notion database must have the same properties as the uploader script: `Path` (Text), `Has Images` (Checkbox), and `Created Date` (Date).

### Step 1: Local Project Setup

1.  This script should be placed in the same `notion-importer` project folder you created for the first script.
2.  Create a file named `sync-from-notion.js`.
3.  Open your terminal, navigate into the `notion-importer` folder, and run this command to install the necessary packages:
    ```bash
    npm install @notionhq/client notion-to-md axios
    ```

## The Final Script

Copy the entire code block below and paste it into your `sync-from-notion.js` file.

```javascript
// A script to fetch all pages from a Notion database, convert them to Markdown,
// download their images, and save them as local .md files.

const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');
const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');

// --- CONFIGURATION ---
const NOTION_KEY = 'YOUR_NOTION_INTEGRATION_SECRET_HERE';
const NOTION_DATABASE_ID = 'YOUR_NOTION_DATABASE_ID_HERE';
// ----------------------------------------------------

const notion = new Client({ auth: NOTION_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });
const markdownBaseDir = path.join(__dirname, 'my-markdown-files');
const attachmentsDir = path.join(markdownBaseDir, 'Attachments');

/**
 * Downloads an image from a URL and saves it locally.
 * @param {string} fileUrl - The URL of the image to download.
 * @param {string} fileName - The desired name for the saved file.
 * @returns {Promise<string|null>} The local relative path to the image, or null on error.
 */
async function downloadImage(fileUrl, fileName) {
  try {
    const sanitizedName = fileName.split('?')[0]; // Remove URL parameters
    const localPath = path.join(attachmentsDir, sanitizedName);
    
    // Ensure the attachments directory exists
    await fs.mkdir(attachmentsDir, { recursive: true });

    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream',
    });

    const writer = require('fs').createWriteStream(localPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(`Attachments/${sanitizedName}`));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`    ❌ ERROR downloading image ${fileName}: ${error.message}`);
    return null;
  }
}

/**
 * Main function to fetch all pages and sync them locally.
 */
async function syncFromNotion() {
  try {
    console.log('Fetching all pages from Notion...');
    const allPages = [];
    let nextCursor = undefined;

    // 1. Fetch all pages from the Notion database
    do {
      const response = await notion.databases.query({
        database_id: NOTION_DATABASE_ID,
        start_cursor: nextCursor,
      });
      allPages.push(...response.results);
      nextCursor = response.next_cursor;
    } while (nextCursor);

    console.log(`Found ${allPages.length} total pages. Starting sync...\n`);

    for (const page of allPages) {
      const pageTitle = page.properties.Name.title[0]?.plain_text;
      const relativePath = page.properties.Path.rich_text[0]?.plain_text || '.';
      const notionLastEdited = new Date(page.last_edited_time);

      if (!pageTitle) {
        console.log('Skipping page with no title.');
        continue;
      }

      const localFilePath = path.join(markdownBaseDir, relativePath, `${pageTitle}.md`);

      // 2. Check if the local file needs updating
      try {
        const stats = await fs.stat(localFilePath);
        if (notionLastEdited <= stats.mtime) {
          console.log(`⏭️  Skipping (up-to-date): ${pageTitle}`);
          continue;
        }
      } catch (error) {
        // File doesn't exist, so we'll create it. No action needed.
      }
      
      console.log(`\nProcessing: ${pageTitle}`);

      // 3. Convert Notion page to Markdown blocks
      const mdblocks = await n2m.pageToMarkdown(page.id);
      let mdString = n2m.toMarkdownString(mdblocks);

      // 4. Download images and update links
      const imageRegex = /!\[(.*?)\]\((https?:\/\/.*?)\)/g;
      const imageMatches = [...mdString.matchAll(imageRegex)];

      if (imageMatches.length > 0) {
        console.log(`  Found ${imageMatches.length} image(s) to download...`);
        for (const match of imageMatches) {
            const originalLinkText = match[0];
            const imageUrl = match[2];
            const imageName = path.basename(new URL(imageUrl).pathname);

            const localImagePath = await downloadImage(imageUrl, imageName);
            if (localImagePath) {
                // Replace the Notion URL with a local relative link
                mdString = mdString.replace(imageUrl, localImagePath);
            }
        }
      }

      // 5. Save the final Markdown to a local file
      await fs.mkdir(path.dirname(localFilePath), { recursive: true });
      await fs.writeFile(localFilePath, mdString);
      console.log(`✅ Synced: ${pageTitle}`);
    }

    console.log('\nAll files processed! 🚀');
  } catch (error) {
    console.error('A critical error occurred:', error);
  }
}

// Run the script
syncFromNotion();
```

## Usage

1.  Fill in the `NOTION_KEY` and `NOTION_DATABASE_ID` placeholders in the script.
2.  Run the script from your terminal:
    ```bash
    node sync-from-notion.js
    ```

The script will fetch every page from your Notion database. If a local file doesn't exist or if the Notion page has been edited more recently than the local file, it will overwrite the local file with the latest content from Notion.
