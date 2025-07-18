# Contributing to Notion Sync & Backup Toolkit

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites
- Node.js 14 or higher
- npm or yarn
- A Notion account with integration access
- Basic knowledge of JavaScript and the Notion API

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/notion-sync-backup-toolkit.git
   cd notion-sync-backup-toolkit
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your test Notion integration token
   ```

4. **Create a test workspace**
   - Set up a separate Notion workspace for testing
   - Create test databases and pages
   - Never test with production data

## 🛠️ Development Guidelines

### Code Style
- Use consistent indentation (2 spaces)
- Follow existing naming conventions
- Add comments for complex logic
- Use descriptive variable and function names

### File Organization
```
src/
├── notion.js       # Notion API wrapper and utilities
├── utils.js        # General helper functions
└── s3.js          # S3-related utilities

# Main scripts
sync-to-notion.js       # Markdown → Notion sync
notion-backup.js        # Notion → Markdown backup  
notion-page-cleanup.js  # Database maintenance
```

### Adding New Features

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Write your code**
   - Follow existing patterns
   - Add error handling
   - Include logging for debugging

3. **Test thoroughly**
   - Test with different data types
   - Test error conditions
   - Test with large datasets

4. **Update documentation**
   - Update README.md if needed
   - Add inline code comments
   - Document any new configuration options

## 🧪 Testing

### Manual Testing Checklist

Before submitting a PR, test the following scenarios:

#### For sync-to-notion.js:
- [ ] Empty markdown files
- [ ] Files with various markdown syntax
- [ ] Files with images
- [ ] Files with frontmatter
- [ ] Large files (>1MB)
- [ ] Files with special characters in names
- [ ] Nested folder structures

#### For notion-backup.js:
- [ ] Empty databases
- [ ] Databases with various block types
- [ ] Databases with images
- [ ] Large databases (100+ pages)
- [ ] Nested page structures
- [ ] Incremental backup functionality

#### For notion-page-cleanup.js:
- [ ] Dry run mode
- [ ] Duplicate page detection
- [ ] Empty page detection
- [ ] Batch deletion
- [ ] Error handling

### Testing with Real Data

1. **Create a test workspace**
   - Use a separate Notion workspace
   - Create sample databases and pages
   - Include various content types

2. **Use small datasets first**
   - Start with 1-2 pages
   - Gradually increase complexity
   - Monitor API rate limits

3. **Always backup before testing**
   - Export test data before running scripts
   - Never test with irreplaceable content

## 📝 Code Patterns

### Error Handling
```javascript
try {
    const result = await notionClient.someOperation();
    console.log('✅ Operation successful');
    return result;
} catch (error) {
    console.error('❌ Operation failed:', error.message);
    // Don't throw unless absolutely necessary
    return null;
}
```

### API Rate Limiting
```javascript
async function callWithRetry(apiCall, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiCall();
        } catch (error) {
            if (error.code === 'rate_limited' && i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                continue;
            }
            throw error;
        }
    }
}
```

### Progress Logging
```javascript
console.log('🚀 Starting operation...');
console.log('📊 Processing 50 items...');
console.log('  ✅ Processed item 1/50');
console.log('  ❌ Failed item 2/50: reason');
console.log('🎉 Operation complete: 48/50 successful');
```

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment details**
   - Node.js version
   - Operating system
   - Package version

2. **Steps to reproduce**
   - Exact commands run
   - Input data characteristics
   - Expected vs actual behavior

3. **Error logs**
   - Full error messages
   - Stack traces
   - Console output

4. **Configuration**
   - Relevant config.js settings
   - Environment variables (excluding secrets)

## 💡 Feature Requests

For new features, please:

1. **Check existing issues** to avoid duplicates
2. **Describe the use case** clearly
3. **Explain the expected behavior**
4. **Consider implementation complexity**
5. **Suggest API changes** if needed

## 🔧 Common Development Tasks

### Adding a New Block Type

1. **Update the conversion logic** in `src/utils.js`:
   ```javascript
   function convertBlock(block) {
       switch (block.type) {
           case 'your_new_type':
               return convertYourNewType(block);
           // ... existing cases
       }
   }
   ```

2. **Add the conversion function**:
   ```javascript
   function convertYourNewType(block) {
       // Convert Notion block to markdown
       return markdownString;
   }
   ```

3. **Test with sample data**

### Adding Configuration Options

1. **Add to config.js**:
   ```javascript
   module.exports = {
       // ... existing options
       yourNewOption: 'default_value',
   };
   ```

2. **Use in your script**:
   ```javascript
   const config = require('./config');
   const setting = config.yourNewOption;
   ```

3. **Document in README.md**

### Improving Performance

- **Batch API calls** when possible
- **Use concurrent processing** with limits
- **Cache frequently accessed data**
- **Monitor memory usage** for large datasets

## 📦 Pull Request Process

1. **Update documentation** as needed
2. **Test thoroughly** with various scenarios
3. **Follow the existing code style**
4. **Write clear commit messages**
5. **Keep PRs focused** on a single feature/fix

### Commit Message Format
```
type: brief description

Longer explanation if needed
- Detail 1
- Detail 2

Closes #issue-number
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## 📞 Getting Help

- **Check existing issues** first
- **Join discussions** for questions
- **Ask in PR comments** for code-specific help
- **Tag maintainers** for urgent issues

## 🎯 Areas Needing Help

Current priorities:
- [ ] **Performance optimization** for large workspaces
- [ ] **Additional block type support** 
- [ ] **Better error recovery** mechanisms
- [ ] **Automated testing** setup
- [ ] **Documentation improvements**
- [ ] **Example configurations** for common use cases

Thank you for contributing! 🙏
