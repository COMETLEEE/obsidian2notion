require('dotenv').config();
const { markdownToBlocks } = require('@tryfabric/martian');
const fs = require('fs/promises');
const path = require('path');
const { getOrCreateDatabaseForPath, fetchAllExistingPages, notion, callWithRetry } = require('./src/notion');
const { uploadFileToS3 } = require('./src/s3');
const { findMarkdownFiles } = require('./src/utils');
const config = require('./config');

/**
 * Resolves the full path of an image, supporting both relative paths and a global attachments folder.
 * @param {string} imagePath - The path from the markdown link.
 * @param {string} markdownFilePath - The path of the markdown file being processed.
 * @returns {Promise<string|null>} The resolved full path to the image, or null if it doesn't exist.
 */
async function resolveImagePath(imagePath, markdownFilePath) {
    const decodedPath = decodeURIComponent(imagePath);

    // 1. Try resolving relative to the markdown file's directory
    const relativePath = path.resolve(path.dirname(markdownFilePath), decodedPath);
    try {
        await fs.access(relativePath);
        return relativePath;
    } catch (e) {
        // Not found, proceed to next step
    }

    // 2. Try resolving from the global attachments folder
    const attachmentPath = path.join(config.markdownBaseDir, config.attachmentsDir, decodedPath);
    try {
        await fs.access(attachmentPath);
        return attachmentPath;
    } catch (e) {
        // Not found, proceed to next step
    }
    
    console.warn(`    ⚠️  Could not find image: ${decodedPath}`);
    return null;
}


/**
 * Processes a single markdown file: uploads images and creates a Notion page.
 * @param {string} filePath - The absolute path to the markdown file.
 * @param {Set<string>} existingPages - A set of keys for pages that already exist in Notion.
 */
async function processSingleFile(filePath, existingPages) {
    const pageTitle = path.basename(filePath, '.md');
    const relativePath = path.dirname(path.relative(config.markdownBaseDir, filePath));
    const dbTitle = relativePath === '.' ? config.rootDatabaseName : relativePath;
    const pageKey = `${dbTitle}/${pageTitle}`;

    if (existingPages.has(pageKey)) {
        console.log(`⏭️  Skipping (already exists): ${pageTitle}`);
        return;
    }

    try {
        const databaseId = await getOrCreateDatabaseForPath(relativePath);

        console.log(`Processing: ${pageTitle}`);
        let markdownContent = await fs.readFile(filePath, 'utf8');
        
        const imageRegex = /!\[(.*?)\]\((?!https?:\/\/)(.*?)\)|!\[\[(.*?)(?:\|.*?)?\]\]/g;
        
        const imageMatches = [...markdownContent.matchAll(imageRegex)];
        let successfulUploadCount = 0;

        if (imageMatches.length > 0) {
            console.log(`  Found ${imageMatches.length} local image(s) in ${pageTitle}`);
            const uploadPromises = imageMatches.map(match => {
                return (async () => {
                    const originalLinkText = match[0];
                    let altText = '';
                    let originalImagePath = '';

                    if (match[2] !== undefined) { 
                        altText = match[1];
                        originalImagePath = match[2];
                    } else if (match[3] !== undefined) {
                        originalImagePath = match[3];
                        altText = path.basename(originalImagePath);
                    }

                    if (!originalImagePath) return null;

                    try {
                        const fullImagePath = await resolveImagePath(originalImagePath, filePath);
                        if (fullImagePath) {
                            const s3Url = await uploadFileToS3(fullImagePath);
                            if (s3Url) {
                                return { original: originalLinkText, replacement: `![${altText}](${s3Url})` };
                            }
                        }
                    } catch (e) {
                        console.error(`    ❌ ERROR processing image link "${originalImagePath}": ${e.message}`);
                    }
                    return null;
                })();
            });

            const uploadResults = await Promise.all(uploadPromises);
            for (const result of uploadResults) {
                if (result) {
                    markdownContent = markdownContent.replace(result.original, result.replacement);
                    successfulUploadCount++;
                }
            }
        }

        const notionBlocks = markdownToBlocks(markdownContent);
        const stats = await fs.stat(filePath);
        const creationDate = stats.birthtime.toISOString().split('T')[0];

        const firstChunk = notionBlocks.slice(0, 100);
        const remainingChunks = [];
        for (let i = 100; i < notionBlocks.length; i += 100) {
            remainingChunks.push(notionBlocks.slice(i, i + 100));
        }

        const newPage = await callWithRetry(() => notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
                'Name': { title: [{ text: { content: pageTitle } }] },
                'Has Images': { checkbox: successfulUploadCount > 0 },
                'Created Date': { date: { start: creationDate } },
            },
            children: firstChunk,
        }));

        for (const chunk of remainingChunks) {
            await callWithRetry(() => notion.blocks.children.append({
                block_id: newPage.id,
                children: chunk,
            }));
        }

        console.log(`✅ Synced: ${pageTitle}`);
    } catch (error) {
        console.error(`❌ ERROR syncing "${pageTitle}": ${error.message}`);
    }
}

/**
 * Main function to process all Markdown files and sync them to Notion.
 */
async function processAllMarkdown() {
  try {
    const allFiles = await findMarkdownFiles(config.markdownBaseDir);
    
    if (allFiles.length === 0) {
      console.log('No Markdown files found.');
      return;
    }
    
    const existingPages = await fetchAllExistingPages();

    console.log(`\nFound ${allFiles.length} local files. Starting sync with concurrency of ${config.concurrencyLimit}...\n`);

    for (let i = 0; i < allFiles.length; i += config.concurrencyLimit) {
        const batch = allFiles.slice(i, i + config.concurrencyLimit);
        const promises = batch.map(filePath => processSingleFile(filePath, existingPages));
        await Promise.all(promises);
    }

    console.log('\nAll files processed! 🚀');
  } catch (error) {
    console.error('A critical error occurred:', error);
  }
}

// Run the script
processAllMarkdown();
