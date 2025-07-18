require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { notion, callWithRetry } = require('./src/notion');
const config = require('./config');

// --- CONFIGURATION ---
const NOTION_PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;
const BACKUP_DIR = path.join(__dirname, 'notion-backup');
const ATTACHMENTS_DIR = path.join(BACKUP_DIR, 'Attachments');
const MAX_CONCURRENT_DOWNLOADS = 5;
const BACKUP_STATE_FILE = path.join(BACKUP_DIR, '.backup-state.json');
// ----------------------------------------------------

/**
 * Loads the backup state from previous runs
 * @returns {Promise<Object>} Backup state object
 */
async function loadBackupState() {
    try {
        const stateData = await fs.readFile(BACKUP_STATE_FILE, 'utf8');
        return JSON.parse(stateData);
    } catch (error) {
        // If file doesn't exist or is corrupted, return empty state
        return {
            lastBackup: null,
            pages: {} // pageId -> { lastModified, filePath }
        };
    }
}

/**
 * Saves the backup state for future runs
 * @param {Object} state - Backup state object
 * @returns {Promise<void>}
 */
async function saveBackupState(state) {
    try {
        await fs.writeFile(BACKUP_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.error('Warning: Could not save backup state:', error.message);
    }
}

/**
 * Checks if a page needs to be updated based on last modified time
 * @param {object} page - Notion page object
 * @param {object} backupState - Current backup state
 * @returns {boolean} True if page needs updating
 */
function needsUpdate(page, backupState) {
    const pageId = page.id;
    const currentModified = page.last_edited_time;
    
    if (!backupState.pages[pageId]) {
        // Page hasn't been backed up before
        return true;
    }
    
    const lastBackedUpModified = backupState.pages[pageId].lastModified;
    return currentModified !== lastBackedUpModified;
}

/**
 * Downloads an image from a URL and saves it locally
 * @param {string} url - The image URL
 * @param {string} filePath - Local file path to save the image
 * @returns {Promise<boolean>} Success status
 */
async function downloadImage(url, filePath) {
    return new Promise((resolve) => {
        const file = require('fs').createWriteStream(filePath);
        
        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(true);
                });
            } else {
                file.close();
                resolve(false);
            }
        }).on('error', (err) => {
            file.close();
            console.error(`Error downloading image: ${err.message}`);
            resolve(false);
        });
    });
}

/**
 * Generates a safe filename from a string
 * @param {string} title - The original title
 * @returns {string} Safe filename
 */
function generateSafeFilename(title) {
    if (!title) return 'untitled';
    
    return title
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
        .substring(0, 200); // Limit length
}

/**
 * Converts Notion blocks to Markdown
 * @param {Array} blocks - Array of Notion blocks
 * @param {Set} downloadedImages - Set to track downloaded images
 * @returns {Promise<string>} Markdown content
 */
async function blocksToMarkdown(blocks, downloadedImages) {
    let markdown = '';
    let imageCounter = 1;
    
    for (const block of blocks) {
        switch (block.type) {
            case 'paragraph':
                const paragraphText = block.paragraph.rich_text.map(rt => {
                    let text = rt.plain_text;
                    if (rt.annotations.bold) text = `**${text}**`;
                    if (rt.annotations.italic) text = `*${text}*`;
                    if (rt.annotations.code) text = `\`${text}\``;
                    if (rt.annotations.strikethrough) text = `~~${text}~~`;
                    if (rt.href) text = `[${text}](${rt.href})`;
                    return text;
                }).join('');
                markdown += `${paragraphText}\n\n`;
                break;
                
            case 'heading_1':
                const h1Text = block.heading_1.rich_text.map(rt => rt.plain_text).join('');
                markdown += `# ${h1Text}\n\n`;
                break;
                
            case 'heading_2':
                const h2Text = block.heading_2.rich_text.map(rt => rt.plain_text).join('');
                markdown += `## ${h2Text}\n\n`;
                break;
                
            case 'heading_3':
                const h3Text = block.heading_3.rich_text.map(rt => rt.plain_text).join('');
                markdown += `### ${h3Text}\n\n`;
                break;
                
            case 'bulleted_list_item':
                const bulletText = block.bulleted_list_item.rich_text.map(rt => rt.plain_text).join('');
                markdown += `- ${bulletText}\n`;
                break;
                
            case 'numbered_list_item':
                const numberedText = block.numbered_list_item.rich_text.map(rt => rt.plain_text).join('');
                markdown += `1. ${numberedText}\n`;
                break;
                
            case 'to_do':
                const todoText = block.to_do.rich_text.map(rt => rt.plain_text).join('');
                const checked = block.to_do.checked ? 'x' : ' ';
                markdown += `- [${checked}] ${todoText}\n`;
                break;
                
            case 'quote':
                const quoteText = block.quote.rich_text.map(rt => rt.plain_text).join('');
                markdown += `> ${quoteText}\n\n`;
                break;
                
            case 'code':
                const codeText = block.code.rich_text.map(rt => rt.plain_text).join('');
                const language = block.code.language || '';
                markdown += `\`\`\`${language}\n${codeText}\n\`\`\`\n\n`;
                break;
                
            case 'divider':
                markdown += `---\n\n`;
                break;
                
            case 'image':
                try {
                    let imageUrl;
                    if (block.image.type === 'external') {
                        imageUrl = block.image.external.url;
                    } else if (block.image.type === 'file') {
                        imageUrl = block.image.file.url;
                    }
                    
                    if (imageUrl) {
                        if (!downloadedImages.has(imageUrl)) {
                            // Download new image
                            const imageExtension = path.extname(new URL(imageUrl).pathname) || '.jpg';
                            const imageName = `image_${Date.now()}_${imageCounter}${imageExtension}`;
                            const imagePath = path.join(ATTACHMENTS_DIR, imageName);
                            
                            console.log(`  📷 Downloading image: ${imageName}`);
                            const success = await downloadImage(imageUrl, imagePath);
                            
                            if (success) {
                                downloadedImages.set(imageUrl, imageName);
                                markdown += `![${imageName}](Attachments/${imageName})\n\n`;
                                imageCounter++;
                            } else {
                                console.log(`  ❌ Failed to download image: ${imageUrl}`);
                                markdown += `![Image failed to download](${imageUrl})\n\n`;
                            }
                        } else {
                            // Use existing downloaded image
                            const imageName = downloadedImages.get(imageUrl);
                            markdown += `![${imageName}](Attachments/${imageName})\n\n`;
                        }
                    }
                } catch (error) {
                    console.error(`Error processing image: ${error.message}`);
                    markdown += `![Image error]()\n\n`;
                }
                break;
                
            case 'embed':
                if (block.embed.url) {
                    markdown += `[Embedded content](${block.embed.url})\n\n`;
                }
                break;
                
            case 'bookmark':
                if (block.bookmark.url) {
                    markdown += `[Bookmark](${block.bookmark.url})\n\n`;
                }
                break;
                
            case 'table':
                // Handle tables - basic implementation
                markdown += `<!-- Table block found - manual conversion may be needed -->\n\n`;
                break;
                
            default:
                // For unsupported block types, add a comment
                if (block.type) {
                    markdown += `<!-- Unsupported block type: ${block.type} -->\n\n`;
                }
                break;
        }
        
        // Handle child blocks recursively
        if (block.has_children) {
            try {
                const childBlocks = await callWithRetry(() => 
                    notion.blocks.children.list({ block_id: block.id })
                );
                const childMarkdown = await blocksToMarkdown(childBlocks.results, downloadedImages);
                markdown += childMarkdown;
            } catch (error) {
                console.error(`Error fetching child blocks: ${error.message}`);
            }
        }
    }
    
    return markdown;
}

/**
 * Exports a single page to markdown
 * @param {object} page - Notion page object
 * @param {string} databaseDir - Directory for this database
 * @param {Map} downloadedImages - Map to track downloaded images (URL -> filename)
 * @param {object} backupState - Current backup state
 * @returns {Promise<boolean>} True if page was exported, false if skipped
 */
async function exportPage(page, databaseDir, downloadedImages, backupState) {
    const title = page.properties.Name?.title?.[0]?.text?.content || 'Untitled';
    const safeTitle = generateSafeFilename(title);
    const pageFileName = `${safeTitle}.md`;
    const pageFilePath = path.join(databaseDir, pageFileName);
    
    // Check if page needs updating
    if (!needsUpdate(page, backupState)) {
        console.log(`  ⏭️  Skipping (no changes): ${title}`);
        return false;
    }
    
    console.log(`  📄 Exporting: ${title}`);
    
    try {
        // Get page content
        const blocks = await callWithRetry(() => 
            notion.blocks.children.list({ block_id: page.id })
        );
        
        // Convert to markdown
        let markdown = `# ${title}\n\n`;
        
        // Add metadata
        markdown += `---\n`;
        markdown += `notion_id: ${page.id}\n`;
        if (page.properties['Created Date']?.date?.start) {
            markdown += `created: ${page.properties['Created Date'].date.start}\n`;
        }
        if (page.last_edited_time) {
            markdown += `modified: ${page.last_edited_time.split('T')[0]}\n`;
        }
        markdown += `---\n\n`;
        
        // Convert blocks to markdown
        const contentMarkdown = await blocksToMarkdown(blocks.results, downloadedImages);
        markdown += contentMarkdown;
        
        // Write the markdown file
        await fs.writeFile(pageFilePath, markdown, 'utf8');
        
        // Update backup state for this page
        backupState.pages[page.id] = {
            lastModified: page.last_edited_time,
            filePath: pageFilePath,
            title: title
        };
        
        // Save state after each page to prevent loss on interruption
        await saveBackupState(backupState);
        
        return true;
        
    } catch (error) {
        console.error(`  ❌ Error exporting page "${title}": ${error.message}`);
        return false;
    }
}

/**
 * Exports all pages from a database
 * @param {string} databaseId - Notion database ID
 * @param {string} databaseTitle - Database title for directory naming
 * @param {Map} downloadedImages - Map to track downloaded images (URL -> filename)
 * @param {object} backupState - Current backup state
 * @returns {Promise<{exported: number, skipped: number}>} Export statistics
 */
async function exportDatabase(databaseId, databaseTitle, downloadedImages, backupState) {
    const safeDatabaseTitle = generateSafeFilename(databaseTitle);
    const databaseDir = path.join(BACKUP_DIR, safeDatabaseTitle);
    
    console.log(`\n📊 Exporting database: ${databaseTitle}`);
    
    // Create database directory
    await fs.mkdir(databaseDir, { recursive: true });
    
    // Get all pages from database
    let allPages = [];
    let nextCursor = undefined;
    
    do {
        const response = await callWithRetry(() => 
            notion.databases.query({
                database_id: databaseId,
                start_cursor: nextCursor,
            })
        );
        allPages.push(...response.results);
        nextCursor = response.next_cursor;
    } while (nextCursor);
    
    console.log(`  Found ${allPages.length} pages to check`);
    
    let exportedCount = 0;
    let skippedCount = 0;
    
    // Export each page (or skip if unchanged)
    for (const page of allPages) {
        const wasExported = await exportPage(page, databaseDir, downloadedImages, backupState);
        
        if (wasExported) {
            exportedCount++;
        } else {
            skippedCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`  ✅ Exported: ${exportedCount}, Skipped: ${skippedCount}`);
    
    return { exported: exportedCount, skipped: skippedCount };
}

/**
 * Recursively finds all databases within a page and its sub-pages
 * @param {string} pageId - The ID of the page to search
 * @param {number} depth - Current depth for logging purposes
 * @returns {Promise<Array>} Array of database objects with {id, title}
 */
async function findAllDatabases(pageId, depth = 0) {
    const indent = '  '.repeat(depth);
    console.log(`${indent}🔍 Searching for databases${depth === 0 ? ' in workspace...' : '...'}`);
    
    let databases = [];
    
    try {
        const response = await callWithRetry(() => notion.blocks.children.list({ block_id: pageId }));
        
        for (const block of response.results) {
            if (block.type === 'child_database') {
                databases.push({
                    id: block.id,
                    title: block.child_database.title
                });
                console.log(`${indent}📊 Found database: "${block.child_database.title}"`);
            } else if (block.type === 'child_page') {
                console.log(`${indent}📄 Searching sub-page: "${block.child_page.title}"`);
                const subDatabases = await findAllDatabases(block.id, depth + 1);
                databases = databases.concat(subDatabases);
            }
        }
    } catch (error) {
        console.error(`${indent}❌ Error searching page: ${error.message}`);
    }
    
    return databases;
}

/**
 * Removes backup files for pages that no longer exist in Notion
 * @param {object} backupState - Current backup state
 * @param {Set} currentPageIds - Set of page IDs that currently exist
 * @returns {Promise<number>} Number of files cleaned up
 */
async function cleanupOrphanedFiles(backupState, currentPageIds) {
    let cleanedUp = 0;
    
    for (const [pageId, pageInfo] of Object.entries(backupState.pages)) {
        if (!currentPageIds.has(pageId)) {
            // This page no longer exists in Notion, remove its backup file
            try {
                if (pageInfo.filePath && await fs.access(pageInfo.filePath).then(() => true).catch(() => false)) {
                    await fs.unlink(pageInfo.filePath);
                    console.log(`  🗑️  Removed orphaned file: ${pageInfo.title}`);
                    cleanedUp++;
                }
                
                // Remove from backup state
                delete backupState.pages[pageId];
            } catch (error) {
                console.error(`Error cleaning up file for ${pageInfo.title}:`, error.message);
            }
        }
    }
    
    return cleanedUp;
}

/**
 * Main backup function
 */
async function runBackup() {
    console.log('🚀 Starting Notion backup...\n');
    
    try {
        // Create backup directory
        await fs.mkdir(BACKUP_DIR, { recursive: true });
        await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
        
        console.log(`📁 Backup directory: ${BACKUP_DIR}`);
        
        // Load previous backup state
        const backupState = await loadBackupState();
        console.log(`📋 Loaded backup state: ${Object.keys(backupState.pages).length} pages tracked`);
        
        if (backupState.lastBackup) {
            console.log(`📅 Last backup: ${new Date(backupState.lastBackup).toLocaleString()}`);
        } else {
            console.log(`📅 This is the first backup`);
        }
        
        // Find all databases
        const databases = await findAllDatabases(NOTION_PARENT_PAGE_ID);
        
        if (databases.length === 0) {
            console.log('❌ No databases found under the specified parent page.');
            return;
        }
        
        console.log(`\n✅ Found ${databases.length} database(s) total.`);
        
        // Update backup start time
        backupState.lastBackup = new Date().toISOString();
        await saveBackupState(backupState);
        
        // Track downloaded images to avoid duplicates (URL -> filename)
        const downloadedImages = new Map();
        
        // Track statistics
        let totalExported = 0;
        let totalSkipped = 0;
        const currentPageIds = new Set();
        
        // Export each database
        for (const database of databases) {
            // Save state before processing each database
            await saveBackupState(backupState);
            
            const stats = await exportDatabase(database.id, database.title, downloadedImages, backupState);
            totalExported += stats.exported;
            totalSkipped += stats.skipped;
            
            // Collect all current page IDs for cleanup
            const response = await callWithRetry(() => 
                notion.databases.query({ database_id: database.id })
            );
            response.results.forEach(page => currentPageIds.add(page.id));
        }
        
        // Clean up files for pages that no longer exist
        console.log('\n🧹 Cleaning up orphaned files...');
        const cleanedUp = await cleanupOrphanedFiles(backupState, currentPageIds);
        
        // Update backup state
        backupState.lastBackup = new Date().toISOString();
        await saveBackupState(backupState);
        
        // Create an index file
        const indexContent = `# Notion Backup\n\nBackup created: ${new Date().toISOString()}\nLast backup: ${backupState.lastBackup}\n\n## Statistics\n\n- Total pages tracked: ${Object.keys(backupState.pages).length}\n- Exported this run: ${totalExported}\n- Skipped (no changes): ${totalSkipped}\n- Cleaned up: ${cleanedUp}\n\n## Databases\n\n${databases.map(db => `- [${db.title}](./${generateSafeFilename(db.title)}/)`).join('\n')}\n`;
        await fs.writeFile(path.join(BACKUP_DIR, 'README.md'), indexContent, 'utf8');
        
        console.log('\n🎉 Backup completed successfully!');
        console.log(`📁 Backup location: ${BACKUP_DIR}`);
        console.log(`📊 Exported ${databases.length} databases`);
        console.log(`� Exported: ${totalExported} pages`);
        console.log(`⏭️  Skipped: ${totalSkipped} pages (no changes)`);
        console.log(`🗑️  Cleaned up: ${cleanedUp} orphaned files`);
        console.log(`�📷 Downloaded ${downloadedImages.size} unique images`);
        
        if (totalSkipped > 0) {
            console.log(`\n⚡ Incremental backup saved time by skipping ${totalSkipped} unchanged pages!`);
        }
        
    } catch (error) {
        console.error('\n❌ Backup failed:', error.message);
        console.error(error.stack);
    }
}

// Run the backup if this file is executed directly
if (require.main === module) {
    runBackup();
}

module.exports = { runBackup };
