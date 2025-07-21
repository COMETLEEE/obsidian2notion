require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { findMarkdownFiles } = require('./src/utils');
const config = require('./config');

/**
 * Resolves the full path of an attachment
 */
async function resolveAttachmentPath(attachmentPath, markdownFilePath) {
    const decodedPath = decodeURIComponent(attachmentPath);

    // 1. Try resolving relative to the markdown file's directory
    const relativePath = path.resolve(path.dirname(markdownFilePath), decodedPath);
    try {
        await fs.access(relativePath);
        return relativePath;
    } catch (e) {
        // Not found, proceed to next step
    }

    // 2. Try resolving from the global attachments folder
    const attachmentPath2 = path.join(config.markdownBaseDir, config.attachmentsDir, decodedPath);
    try {
        await fs.access(attachmentPath2);
        return attachmentPath2;
    } catch (e) {
        // Not found
    }
    
    return null;
}

/**
 * Find all files with non-image attachments
 */
async function findNonImageAttachments() {
    console.log('🔍 Finding ALL files with non-image attachments...\n');
    
    const allFiles = await findMarkdownFiles(config.markdownBaseDir);
    const filesWithNonImages = [];
    
    // Image extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    
    // Regex to match all attachments
    const attachmentRegex = /!\[(.*?)\]\((?!https?:\/\/)(.*?)\)|!\[\[(.*?)(?:\|.*?)?\]\]/g;
    
    console.log(`Scanning ${allFiles.length} markdown files...\n`);
    
    let processedCount = 0;
    for (const filePath of allFiles) {
        processedCount++;
        if (processedCount % 500 === 0) {
            console.log(`Processed ${processedCount}/${allFiles.length} files...`);
        }
        
        try {
            const markdownContent = await fs.readFile(filePath, 'utf8');
            const attachmentMatches = [...markdownContent.matchAll(attachmentRegex)];
            
            if (attachmentMatches.length > 0) {
                const nonImageAttachments = [];
                
                for (const match of attachmentMatches) {
                    let attachmentPath = '';
                    if (match[2] !== undefined) {
                        attachmentPath = match[2];
                    } else if (match[3] !== undefined) {
                        attachmentPath = match[3];
                    }
                    
                    if (attachmentPath) {
                        const ext = path.extname(attachmentPath).toLowerCase();
                        const isImage = imageExtensions.includes(ext);
                        
                        if (!isImage) {
                            // Try to resolve the full path
                            const fullPath = await resolveAttachmentPath(attachmentPath, filePath);
                            
                            nonImageAttachments.push({
                                referencedPath: attachmentPath,
                                extension: ext,
                                fullPath: fullPath,
                                exists: !!fullPath
                            });
                        }
                    }
                }
                
                if (nonImageAttachments.length > 0) {
                    const relativePath = path.relative(config.markdownBaseDir, filePath);
                    filesWithNonImages.push({
                        markdownFile: relativePath,
                        fullPath: filePath,
                        attachments: nonImageAttachments
                    });
                }
            }
        } catch (error) {
            // Skip files we can't read
        }
    }
    
    console.log(`\nScan complete!\n`);
    
    // Organize results
    const foundAttachments = [];
    const missingAttachments = [];
    
    filesWithNonImages.forEach(file => {
        file.attachments.forEach(attachment => {
            const item = {
                markdownFile: file.markdownFile,
                referencedPath: attachment.referencedPath,
                extension: attachment.extension,
                fullPath: attachment.fullPath
            };
            
            if (attachment.exists) {
                foundAttachments.push(item);
            } else {
                missingAttachments.push(item);
            }
        });
    });
    
    // Display results
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 NON-IMAGE ATTACHMENTS SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📁 Files with non-image attachments: ${filesWithNonImages.length}`);
    console.log(`📎 Non-image attachments found: ${foundAttachments.length}`);
    console.log(`❌ Non-image attachments missing: ${missingAttachments.length}\n`);
    
    // Group by file type
    const byExtension = new Map();
    foundAttachments.forEach(item => {
        const ext = item.extension || '(no extension)';
        if (!byExtension.has(ext)) {
            byExtension.set(ext, []);
        }
        byExtension.get(ext).push(item);
    });
    
    if (foundAttachments.length > 0) {
        console.log(`📈 FOUND ATTACHMENTS BY TYPE:\n`);
        const sortedExtensions = Array.from(byExtension.entries()).sort((a, b) => b[1].length - a[1].length);
        
        sortedExtensions.forEach(([ext, items]) => {
            const extDisplay = ext || '(no extension)';
            console.log(`📎 ${extDisplay.toUpperCase()} Files (${items.length}):`);
            console.log(`${'─'.repeat(40)}`);
            
            items.forEach((item, index) => {
                const relativeFullPath = path.relative(process.cwd(), item.fullPath);
                console.log(`${index + 1}. ${item.markdownFile}`);
                console.log(`   📄 Referenced: ${item.referencedPath}`);
                console.log(`   📁 Location: ${relativeFullPath}`);
                console.log('');
            });
        });
    }
    
    if (missingAttachments.length > 0) {
        console.log(`\n❌ MISSING ATTACHMENTS (${missingAttachments.length}):`);
        console.log(`${'─'.repeat(40)}`);
        missingAttachments.forEach((item, index) => {
            console.log(`${index + 1}. ${item.markdownFile}`);
            console.log(`   ❌ Missing: ${item.referencedPath} (${item.extension || 'no ext'})`);
            console.log('');
        });
    }
    
    // Create a clean list for manual upload
    if (foundAttachments.length > 0) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📋 ATTACHMENT PATHS FOR MANUAL UPLOAD`);
        console.log(`${'='.repeat(60)}`);
        const uniquePaths = [...new Set(foundAttachments.map(item => item.fullPath))];
        uniquePaths.forEach((fullPath, index) => {
            const relativePath = path.relative(process.cwd(), fullPath);
            console.log(`${index + 1}. ${relativePath}`);
        });
        console.log(`\n💡 Total unique files to upload: ${uniquePaths.length}`);
    }
    
    return {
        filesWithNonImages,
        foundAttachments,
        missingAttachments
    };
}

findNonImageAttachments().catch(console.error);
