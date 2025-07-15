Of course. Here is the complete, final `README.md` file that explains the entire setup from start to finish, including the stable, public S3 bucket method for permanent image hosting.

-----

# Markdown to Notion Sync with Public S3 Image Hosting

This script provides a robust solution for recursively importing a local directory of Markdown files (such as an Obsidian vault) into a Notion database.

It automatically handles local image attachments by uploading them to a **public AWS S3 bucket**. This method generates permanent, stable links for your images, ensuring they never break or expire in Notion.

**Important Privacy Note:** This method makes your images publicly accessible on the internet to anyone who has the direct link. While the links are long and unguessable, they are not private. This is the trade-off for having a fully automated script with permanent images in Notion.

### Features

  * **Recursive Sync:** Finds all `.md` files in a nested directory structure.
  * **Permanent Image Hosting:** Uploads local images to a public AWS S3 bucket for stable, non-expiring links.
  * **Duplicate Prevention:** Checks for existing notes based on their title and folder path to avoid creating duplicates.
  * **Metadata Sync:** Automatically sets a "Created Date," "Path," and a "Has Images" checkbox in Notion.

## Setup and Installation

### Prerequisites

  * [Node.js](https://nodejs.org/en/) installed on your machine.
  * An [AWS (Amazon Web Services)](https://aws.amazon.com) account.

### Step 1: Notion Setup

1.  **Create a Notion Integration:**

      * Go to [www.notion.so/my-integrations](https://www.notion.so/my-integrations) and create a new integration.
      * Copy the **Internal Integration Secret**. This is your `NOTION_KEY`.

2.  **Create a Notion Database:**

      * Create a new database in Notion.
      * Copy the **Database ID** from the URL (`https://www.notion.so/your-workspace/DATABASE_ID?v=...`).

3.  **Add Required Properties to the Database:**

      * Go to your database, click the `...` menu \> **Properties**.
      * Ensure you have the following properties (names must be an exact match):
          * `Path` (Type: `Text`)
          * `Has Images` (Type: `Checkbox`)
          * `Created Date` (Type: `Date`)

4.  **Share the Database with Your Integration:**

      * On your database page, click the `Share` button, then `Invite`, and select your integration.

### Step 2: AWS S3 Setup (for Public Image Hosting)

1.  **Create an S3 Bucket:**

      * Go to the [AWS S3 Console](https://s3.console.aws.amazon.com/s3/home).
      * Click **Create bucket**.
      * **Bucket name:** Choose a globally unique name (e.g., `yourname-notion-public-assets`).
      * **AWS Region:** Choose one near you (e.g., `us-west-2`).

2.  **Make the Bucket Public:**

      * Click on your newly created bucket and go to the **Permissions** tab.
      * Under **Block public access (bucket settings)**, click **Edit**.
      * **Uncheck** the "Block all public access" box and click **Save changes**. Type `confirm` when prompted.
      * Scroll down to **Bucket policy** and click **Edit**. Paste the following policy, replacing `YOUR_UNIQUE_BUCKET_NAME` with your actual bucket name:
        ```json
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": "s3:GetObject",
                    "Resource": "arn:aws:s3:::YOUR_UNIQUE_BUCKET_NAME/*"
                }
            ]
        }
        ```
      * Click **Save changes**.

3.  **Create a Script User (IAM):**

      * Go to the [AWS IAM Console](https://console.aws.amazon.com/iam/home).
      * Create a new user named `notion-s3-uploader`.
      * Select **Attach policies directly**, then click **Create policy**.
      * In the **JSON** editor, paste the following policy, replacing `YOUR_UNIQUE_BUCKET_NAME` again:
        ```json
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": "s3:PutObject",
                    "Resource": "arn:aws:s3:::YOUR_UNIQUE_BUCKET_NAME/*"
                }
            ]
        }
        ```
      * Name the policy `NotionS3UploadOnlyAccess`, create it, and attach it to your user.

4.  **Get Your Access Keys:**

      * Go to your new user's page, open the **Security credentials** tab, and create an access key for the **Command Line Interface (CLI)**.
      * Copy and save both the **Access key ID** and the **Secret access key**.

### Step 3: Local Project Setup

1.  Create a project folder (e.g., `notion-sync-system`).
2.  Inside it, create a folder named `my-markdown-files` where you'll put your notes.
3.  Create a file named `sync-to-notion.js`.
4.  Open your terminal in the project folder and run:
    ```bash
    npm install @notionhq/client @tryfabric/martian axios @aws-sdk/client-s3
    ```

## The Final Script (`sync-to-notion.js`)

Copy the entire code below and paste it into your `sync-to-notion.js` file.

```javascript
// A script to recursively find Markdown files, upload their local images to a public AWS S3 bucket,
// and sync the final content to a Notion database.

const { Client } = require('@notionhq/client');
const { markdownToBlocks } = require('@tryfabric/martian');
const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// --- CONFIGURATION ---
const NOTION_KEY = 'YOUR_NOTION_INTEGRATION_SECRET_HERE';
const NOTION_DATABASE_ID = 'YOUR_NOTION_DATABASE_ID_HERE';

// -- AWS S3 Configuration --
const AWS_ACCESS_KEY_ID = 'YOUR_AWS_ACCESS_KEY_ID_HERE';
const AWS_SECRET_ACCESS_KEY = 'YOUR_AWS_SECRET_ACCESS_KEY_HERE';
const AWS_S3_BUCKET_NAME = 'YOUR_UNIQUE_S3_BUCKET_NAME_HERE';
const AWS_S3_REGION = 'us-west-2'; // The region where you created your bucket
// ----------------------------------------------------

const notion = new Client({ auth: NOTION_KEY });
const s3Client = new S3Client({
  region: AWS_S3_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});
const markdownBaseDir = path.join(__dirname, 'my-markdown-files');

/**
 * Uploads a file to a public S3 bucket and returns its permanent URL.
 * @param {string} filePath - The absolute path to the file to upload.
 * @returns {Promise<string|null>} The permanent public URL for the S3 object.
 */
async function uploadFileToS3(filePath) {
  const fileName = path.basename(filePath);
  try {
    const fileData = await fs.readFile(filePath);

    if (fileData.length === 0) {
      console.log(`    ⚠️  Skipping ${fileName} (file is empty).`);
      return null;
    }

    const key = `${Date.now()}_${fileName.replace(/ /g, "_")}`;

    const putCommand = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: key,
      Body: fileData,
    });
    await s3Client.send(putCommand);

    const publicUrl = `https://s3.${AWS_S3_REGION}.amazonaws.com/${AWS_S3_BUCKET_NAME}/${key}`;
    
    console.log(`    ⬆️  Uploaded ${fileName} to S3.`);
    return publicUrl;

  } catch (error) {
    console.error(`    ❌ ERROR uploading ${fileName} to S3:`, error.message);
    return null;
  }
}

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
  } catch (error) { console.error(`Error reading directory ${dir}: ${error.message}`); }
  return markdownFiles;
}

async function getExistingPageKeys(databaseId) {
  const existingKeys = new Set();
  let nextCursor = undefined;
  try {
    do {
      const response = await notion.databases.query({
        database_id: databaseId,
        start_cursor: nextCursor,
        page_size: 100,
      });
      for (const page of response.results) {
        if (page.properties.Name?.title?.[0]?.plain_text && page.properties.Path?.rich_text?.[0]?.plain_text) {
          const title = page.properties.Name.title[0].plain_text;
          const pagePath = page.properties.Path.rich_text[0].plain_text;
          const uniqueKey = `${pagePath}/${title}`;
          existingKeys.add(uniqueKey);
        }
      }
      nextCursor = response.next_cursor;
    } while (nextCursor);
  } catch (error) { console.error(`Could not query Notion database. Error: ${error.message}`); }
  console.log(`Found ${existingKeys.size} existing pages in Notion.`);
  return existingKeys;
}

async function processAllMarkdown() {
  try {
    const existingPages = await getExistingPageKeys(NOTION_DATABASE_ID);
    const allFiles = await findMarkdownFiles(markdownBaseDir);

    if (allFiles.length === 0) {
      console.log('No Markdown files found.');
      return;
    }
    console.log(`\nFound ${allFiles.length} local files. Starting sync...\n`);

    for (const filePath of allFiles) {
      const pageTitle = path.basename(filePath, '.md');
      const relativePath = path.dirname(path.relative(markdownBaseDir, filePath));
      const uniqueKey = `${relativePath}/${pageTitle}`;

      if (existingPages.has(uniqueKey)) {
        console.log(`⏭️  Skipping (already exists): ${pageTitle}`);
        continue;
      }

      console.log(`\nProcessing: ${pageTitle}`);
      let successfulUploadCount = 0;

      try {
        let markdownContent = await fs.readFile(filePath, 'utf8');
        const imageRegex = /!\[(.*?)\]\((?!https?:\/\/)(.*?)\)/g;
        const imageMatches = [...markdownContent.matchAll(imageRegex)];

        if (imageMatches.length > 0) {
            console.log(`  Found ${imageMatches.length} local image(s) to upload...`);
            for (const match of imageMatches) {
                const originalLinkText = match[0];
                const altText = match[1];
                const originalImagePath = match[2];
                try {
                    const decodedImagePath = decodeURIComponent(originalImagePath);
                    const fullImagePath = path.join(markdownBaseDir, decodedImagePath);
                    const s3Url = await uploadFileToS3(fullImagePath);
                    if (s3Url) {
                        const newLinkText = `![${altText}](${s3Url})`;
                        markdownContent = markdownContent.replace(originalLinkText, newLinkText);
                        successfulUploadCount++;
                    }
                } catch (e) {
                    console.error(`    ❌ ERROR processing image link "${originalImagePath}": ${e.message}`);
                }
            }
        }

        const notionBlocks = markdownToBlocks(markdownContent);
        const stats = await fs.stat(filePath);
        const creationDate = stats.birthtime.toISOString().split('T')[0];
        
        await notion.pages.create({
          parent: { database_id: NOTION_DATABASE_ID },
          properties: {
            'Name': { title: [{ text: { content: pageTitle } }] },
            'Path': { rich_text: [{ text: { content: relativePath } }] },
            'Has Images': { checkbox: successfulUploadCount > 0 },
            'Created Date': { date: { start: creationDate } },
          },
          children: notionBlocks,
        });

        if (successfulUploadCount > 0) {
            console.log(`✅ Synced with ${successfulUploadCount} image(s): ${pageTitle}`);
        } else {
            console.log(`✅ Synced: ${pageTitle}`);
        }
      } catch (error) {
        console.error(`❌ ERROR syncing "${pageTitle}": ${error.message}`);
      }
    }
    console.log('\nAll files processed! 🚀');
  } catch (error) {
    console.error('A critical error occurred:', error);
  }
}

processAllMarkdown();
```

## Usage

1.  Fill in all the configuration variables at the top of the script.
2.  Place your entire vault of markdown notes and attachment folders into the `my-markdown-files` directory.
3.  Run the script from your terminal:
    ```bash
    node sync-to-notion.js
    ```

The script will begin syncing your notes and uploading images, skipping any notes that already exist in Notion.
