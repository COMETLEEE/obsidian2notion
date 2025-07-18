const { Client } = require('@notionhq/client');
const { callWithRetry } = require('./utils');

const notion = new Client({ auth: process.env.NOTION_KEY });

/**
 * Creates a new Notion database inside the parent page.
 * @param {string} title - The title for the new database.
 * @returns {Promise<string>} The ID of the newly created database.
 */
async function createNotionDatabase(title) {
    console.log(`  Creating new Notion database titled: "${title}"`);
    const response = await callWithRetry(() => notion.databases.create({
        parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
        title: [{ type: 'text', text: { content: title } }],
        properties: {
            'Name': { title: {} },
            'Has Images': { checkbox: {} },
            'Created Date': { date: {} },
        },
    }));
    return response.id;
}

/**
 * Checks if a page with a given title already exists in a specific database.
 * @param {string} databaseId - The ID of the database to search.
 * @param {string} pageTitle - The title of the page to check for.
 * @returns {Promise<boolean>} True if the page exists, false otherwise.
 */
async function doesPageExist(databaseId, pageTitle) {
    const response = await callWithRetry(() => notion.databases.query({
        database_id: databaseId,
        filter: {
            property: 'Name',
            title: {
                equals: pageTitle,
            },
        },
    }));
    return response.results.length > 0;
}

const databasePromiseCache = new Map();

/**
 * Gets the ID of a Notion database for a given path, creating it if it doesn't exist.
 * @param {string} relativePath - The path to the file, relative to the base directory.
 * @returns {Promise<string>} The Notion database ID.
 */
function getOrCreateDatabaseForPath(relativePath) {
    const dbTitle = relativePath === '.' ? 'Root' : relativePath;

    if (databasePromiseCache.has(dbTitle)) {
        return databasePromiseCache.get(dbTitle);
    }

    const promise = (async () => {
        const response = await callWithRetry(() => notion.blocks.children.list({ block_id: process.env.NOTION_PARENT_PAGE_ID }));
        const existingDb = response.results.find(block => 
            block.type === 'child_database' && block.child_database.title === dbTitle
        );

        if (existingDb) {
            console.log(`  Found existing database for path: "${dbTitle}"`);
            return existingDb.id;
        } else {
            return await createNotionDatabase(dbTitle);
        }
    })();

    databasePromiseCache.set(dbTitle, promise);
    return promise;
}

/**
 * Fetches all pages from all databases under the parent page and returns a set of unique keys.
 * @returns {Promise<Set<string>>} A set of unique keys for existing pages (e.g., "DatabaseTitle/PageTitle").
 */
async function fetchAllExistingPages() {
    console.log('Fetching all existing pages from Notion to speed up sync...');
    const existingKeys = new Set();
    
    const dbsResponse = await callWithRetry(() => notion.blocks.children.list({ block_id: process.env.NOTION_PARENT_PAGE_ID }));
    const databaseBlocks = dbsResponse.results.filter(block => block.type === 'child_database');

    for (const dbBlock of databaseBlocks) {
        const dbTitle = dbBlock.child_database.title;
        const dbId = dbBlock.id;
        let nextCursor = undefined;
        
        do {
            const response = await notion.databases.query({
                database_id: dbId,
                start_cursor: nextCursor,
                page_size: 100,
            });

            for (const page of response.results) {
                const pageTitle = page.properties.Name?.title?.[0]?.plain_text;
                if (pageTitle) {
                    const uniqueKey = `${dbTitle}/${pageTitle}`;
                    existingKeys.add(uniqueKey);
                }
            }
            nextCursor = response.next_cursor;
        } while (nextCursor);
    }
    
    console.log(`Found ${existingKeys.size} existing pages across ${databaseBlocks.length} databases.`);
    return existingKeys;
}

module.exports = {
    notion,
    createNotionDatabase,
    doesPageExist,
    getOrCreateDatabaseForPath,
    callWithRetry,
    fetchAllExistingPages,
};
