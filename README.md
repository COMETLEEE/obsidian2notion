Of course\! It was a fantastic debugging journey with a great result. Condensing our work into a shareable format for others is an excellent idea.

Here is a complete summary structured like a `README.md` file that you could post on GitHub. It explains the purpose of the script, details all the setup steps, and includes the final, working code.

-----

# Markdown to Notion Sync with Private Image Uploads

This script provides a robust solution for recursively importing a local directory of Markdown files into a Notion database. It automatically handles local image attachments by uploading them to a **private AWS S3 bucket** and replacing the local links with secure, expiring links, ensuring your images remain private.

This project was developed to solve the challenge of importing a large vault of notes (e.g., from Obsidian) with local image attachments into Notion without making those images public. It avoids using unstable, undocumented internal Notion APIs in favor of the official Notion API and the reliable AWS S3 service.

### Features

  * **Recursive Sync:** Finds all `.md` files in a nested directory structure.
  * **Private Image Hosting:** Uploads local images found in your notes to a private AWS S3 bucket.
  * **Secure Image Linking:** Uses temporary pre-signed URLs to allow Notion to access and cache the images without making them public.
  * **Duplicate Prevention:** Checks for existing notes based on their title and folder path to avoid creating duplicates on subsequent runs.
  * **Metadata Sync:** Automatically sets a "Created Date" and a "Path" property in Notion based on the file's metadata and location.
  * **Image Indicator:** Sets a "Has Images" checkbox in Notion for any note that contains uploaded images.

## Setup and Installation

### Prerequisites

  * [Node.js](https://nodejs.org/en/) installed on your machine.
  * An [AWS (Amazon Web Services)](https://aws.amazon.com) account.

### Step 1: Notion Setup

1.  **Create a Notion Integration:**

      * Go to [www.notion.so/my-integrations](https://www.notion.so/my-integrations) and click "New integration".
      * Give it a name (e.g., "Markdown Importer") and submit.
      * Copy the **Internal Integration Secret**. This is your `NOTION_KEY`.

2.  **Create a Notion Database:**

      * Create a new, empty database in Notion.
      * Copy the **Database ID**. You can find this in the URL of your database page. It's the long string of characters between your workspace name and the `?v=...`.
          * `https://www.notion.so/your-workspace/THIS_IS_THE_DATABASE_ID?v=...`

3.  **Add Required Properties to the Database:**

      * Go to your new database, click the `...` menu \> **Properties**.
      * Add the following properties (the names must be an exact match):
          * `Path` (Type: `Text`)
          * `Has Images` (Type: `Checkbox`)
          * `Created Date` (Type: `Date`)

4.  **Share the Database with Your Integration:**

      * On your database page, click the `...` menu and select "Add connections".
      * Find and select the integration you created in the first step.

### Step 2: AWS S3 Setup (for Private Image Hosting)

1.  **Create a Private S3 Bucket:**

      * Go to the [AWS S3 Console](https://s3.console.aws.amazon.com/s3/home).
      * Click **Create bucket**.
      * **Bucket name:** Choose a globally unique name (e.g., `yourname-notion-importer-assets`).
      * **AWS Region:** Choose one near you (e.g., `us-west-2`).
      * **Block Public Access:** **Leave this checked.** This is essential for keeping your files private.
      * Click **Create bucket**.

2.  **Create an IAM User for the Script:**

      * Go to the [AWS IAM Console](https://console.aws.amazon.com/iam/home).
      * Navigate to **Users** and click **Create user**. Name it `notion-importer-user`.
      * On the next screen, select **Attach policies directly**, then click **Create policy**.
      * In the new tab, select the **JSON** editor and paste the following policy. **Remember to replace `YOUR_UNIQUE_BUCKET_NAME` with your actual bucket name.**
        ```json
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:PutObject",
                        "s3:GetObject"
                    ],
                    "Resource": "arn:aws:s3:::YOUR_UNIQUE_BUCKET_NAME/*"
                }
            ]
        }
        ```
      * Click through the next steps, name the policy `NotionImporterS3Access`, and create it.
      * Go back to the user creation tab, refresh the policy list, select the policy you just created, and finish creating the user.

3.  **Get Your Access Keys:**

      * Click on the new `notion-importer-user`.
      * Go to the **Security credentials** tab and click **Create access key**.
      * Select **Command Line Interface (CLI)**, check the confirmation box, and proceed.
      * Copy and save the **Access key ID** and the **Secret access key** in a secure place.

### Step 3: Local Project Setup

1.  Create a project folder on your computer (e.g., `notion-importer`).
2.  Inside it, create a folder named `my-markdown-files`. Place all your notes and their attachment folders inside `my-markdown-files`.
3.  Create a file named `sync-to-notion.js` inside the `notion-importer` folder.
4.  Open your terminal, navigate into the `notion-importer` folder, and run this command to install all necessary packages:
    ```bash
    npm install @notionhq/client @tryfabric/martian axios @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
    ```

## The Final Script

Copy the entire code block below and paste it into your `sync-to-notion.js` file.

```javascript
// A script to recursively find Markdown files, upload their local images to a private AWS S3 bucket,
// and sync the final content to a Notion database using pre-signed URLs.

const { Client } = require('@notionhq/client');
const { markdownToBlocks } = require('@tryfabric/martian');
const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');


// --- CONFIGURATION ---
const NOTION_KEY = 'YOUR_NOTION_INTEGRATION_SECRET_HERE';
const NOTION_DATABASE_ID = 'YOUR_NOTION_DATABASE_ID_HERE';

// -- AWS S3 Configuration --
// For better security, use environment variables instead of hardcoding keys.
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
 * Uploads a file to a private S3 bucket and generates a temporary pre-signed URL.
 * @param {string} filePath - The absolute path to the file to upload.
 * @returns {Promise<string|null>} A temporary, secure URL for the S3 object, or null on error.
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

    const getCommand = new GetObjectCommand({
        Bucket: AWS_S3_BUCKET_NAME,
        Key: key
    });
    
    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
    
    console.log(`    ⬆️  Uploaded ${fileName} to S3.`);
    return signedUrl;

  } catch (error) {
    console.error(`    ❌ ERROR uploading ${fileName} to S3:`, error.message);
    return null;
  }
}

/**
 * Recursively finds all Markdown files in a directory.
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

/**
 * Fetches existing pages to prevent creating duplicates.
 */
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
  } catch (error) {
    console.error(`Could not query Notion database. Check your NOTION_KEY and NOTION_DATABASE_ID. Error: ${error.message}`);
  }
  console.log(`Found ${existingKeys.size} existing pages in Notion.`);
  return existingKeys;
}

/**
 * Main function to process all Markdown files and sync them to Notion.
 */
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
                    // This assumes image links are relative to the vault root, e.g., (Attachments/image.png)
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

// Run the script
processAllMarkdown();
```

## Usage

1.  Fill in all the `YOUR_..._HERE` placeholders in the configuration section at the top of the `sync-to-notion.js` file.
2.  Place all your markdown notes and attachment folders into the `my-markdown-files` directory.
3.  Run the script from your terminal:
    ```bash
    node sync-to-notion.js
    ```

The script will then begin syncing your notes and privately uploading your images.
