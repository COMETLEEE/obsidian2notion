require('dotenv').config();
const { Client } = require('@notionhq/client');

async function findAllDatabases(parentPageId) {
    const notion = new Client({ auth: process.env.NOTION_KEY });
    const databases = [];
    
    async function searchInPage(pageId, depth = 0) {
        const indent = '  '.repeat(depth);
        console.log(`${indent}🔍 Searching for databases (depth: ${depth})...`);
        
        try {
            // Handle pagination to get ALL blocks
            let allBlocks = [];
            let nextCursor = undefined;
            
            do {
                const response = await notion.blocks.children.list({
                    block_id: pageId,
                    start_cursor: nextCursor,
                    page_size: 100
                });
                allBlocks = allBlocks.concat(response.results);
                nextCursor = response.next_cursor;
                
                if (nextCursor) {
                    console.log(`${indent}   📄 Found ${response.results.length} blocks, getting more...`);
                }
            } while (nextCursor);
            
            console.log(`${indent}   📊 Total blocks found: ${allBlocks.length}`);
            
            for (const block of allBlocks) {
                if (block.type === 'child_database') {
                    databases.push({
                        id: block.id,
                        title: block.child_database?.title || 'Untitled Database'
                    });
                    console.log(`${indent}📊 Found database: "${block.child_database?.title}" (depth: ${depth})`);
                } else if (block.type === 'child_page') {
                    console.log(`${indent}📄 Searching sub-page: "${block.child_page?.title}" (depth: ${depth})`);
                    await searchInPage(block.id, depth + 1);
                }
            }
        } catch (error) {
            console.warn(`${indent}❌ Could not access page ${pageId}:`, error.message);
        }
    }
    
    await searchInPage(parentPageId);
    return databases;
}

async function countImagesInBlock(notion, blockId) {
    let images = 0;
    let cursor;
    
    do {
        const blocks = await notion.blocks.children.list({
            block_id: blockId,
            start_cursor: cursor,
            page_size: 100
        });
        
        for (const block of blocks.results) {
            if (block.type === 'image') {
                images++;
            }
            
            if (block.has_children) {
                images += await countImagesInBlock(notion, block.id);
            }
        }
        
        cursor = blocks.next_cursor;
    } while (cursor);
    
    return images;
}

async function countAllImages() {
    const notion = new Client({ auth: process.env.NOTION_KEY });
    const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
    
    console.log('🔍 Finding databases...');
    const databases = await findAllDatabases(parentPageId);
    console.log(`Found ${databases.length} databases total\n`);
    
    let totalImages = 0;
    
    for (const database of databases) {
        console.log(`📊 Scanning database: ${database.title}`);
        let allPages = [];
        let cursor;
        
        // Get all pages from this database with pagination
        do {
            const response = await notion.databases.query({
                database_id: database.id,
                start_cursor: cursor,
                page_size: 100
            });
            
            allPages = allPages.concat(response.results);
            cursor = response.next_cursor;
            console.log(`   Found ${allPages.length} pages so far...`);
        } while (cursor);
        
        console.log(`🔍 Scanning ${allPages.length} pages for images...`);
        
        for (const page of allPages) {
            let pageImages = 0;
            let blockCursor;
            
            do {
                const blocks = await notion.blocks.children.list({
                    block_id: page.id,
                    start_cursor: blockCursor,
                    page_size: 100
                });
                
                for (const block of blocks.results) {
                    if (block.type === 'image') {
                        pageImages++;
                        totalImages++;
                    }
                    
                    // Check for nested blocks (like in columns, callouts, etc.)
                    if (block.has_children) {
                        const nestedImages = await countImagesInBlock(notion, block.id);
                        pageImages += nestedImages;
                        totalImages += nestedImages;
                    }
                }
                
                blockCursor = blocks.next_cursor;
            } while (blockCursor);
            
            if (pageImages > 0) {
                const title = page.properties.Name?.title?.[0]?.plain_text || 'Untitled';
                console.log(`   📄 "${title}": ${pageImages} images`);
            }
        }
        console.log(`   Database "${database.title}" total: ${totalImages} images\n`);
    }
    
    console.log(`\n📈 TOTAL IMAGES FOUND: ${totalImages}`);
    console.log(`📁 Images in backup folder: 387`);
    console.log(`❓ Missing: ${totalImages - 387}`);
}

countAllImages().catch(console.error);
