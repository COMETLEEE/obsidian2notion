# Notion Sync & Backup Toolkit

A comprehensive collection of Node.js scripts for syncing between Notion, markdown files, and managing your Notion workspace. Perfect for backing up Notion to Obsidian, syncing markdown files to Notion, and maintaining your knowledge base.

## 🌟 Features

- **📤 Markdown to Notion Sync**: Upload markdown files and images to Notion databases
- **📥 Notion to Markdown Backup**: Complete workspace backup in Obsidian-compatible format
- **🧹 Database Cleanup**: Remove duplicate and unwanted pages
- **📁 Centralized Attachments**: Organize images in a single attachments folder
- **⚡ Incremental Sync**: Only process changed files for faster operations
- **🔄 Batch Processing**: Handle large workspaces efficiently
- **🖼️ Image Management**: Download, upload, and organize images automatically

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Scripts Overview](#scripts-overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [File Structure](#file-structure)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd notion-importer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your Notion integration token
   ```

4. **Configure your setup**
   ```bash
   # Edit config.js to match your folder structure
   ```

5. **Run your first backup**
   ```bash
   npm run backup
   ```

## 📜 Scripts Overview

### 🔄 sync-to-notion.js
**Purpose**: Upload markdown files and images to Notion databases

**Features**:
- Converts markdown to Notion blocks
- Uploads images to S3 and links them in Notion
- Creates databases based on folder structure
- Handles nested directories
- Supports frontmatter metadata

**Usage**:
```bash
node sync-to-notion.js
# or
npm start
```

**Best For**: 
- Moving your Obsidian vault to Notion
- Regular sync from markdown files to Notion
- Bulk import of documentation

---

### 📥 notion-backup.js
**Purpose**: Complete backup of Notion workspace to markdown format

**Features**:
- Exports all databases and pages
- Downloads all images locally
- Creates Obsidian-compatible markdown
- Incremental backup support (only changed files)
- Preserves metadata and creation dates
- Centralized attachments folder

**Usage**:
```bash
node notion-backup.js
# or
npm run backup
```

**Output Structure**:
```
notion-backup/
├── README.md
├── Attachments/           # All images in one place
├── Database Name 1/
│   ├── Page 1.md
│   ├── Page 2.md
│   └── ...
├── Database Name 2/
└── .backup-state.json     # Tracks changes for incremental sync
```

**Best For**:
- Creating backups of your Notion workspace
- Migrating from Notion to Obsidian
- Archiving important content

---

### 🧹 notion-page-cleanup.js
**Purpose**: Clean up and organize Notion databases

**Features**:
- Remove duplicate pages
- Delete empty or unwanted content
- Batch operations for efficiency
- Safe dry-run mode
- Detailed logging of actions

**Usage**:
```bash
node notion-page-cleanup.js
# or
npm run cleanup
```

**Best For**:
- Cleaning up after bulk imports
- Removing test pages
- Database maintenance

## 🛠️ Installation

### Prerequisites
- Node.js 14+ 
- npm or yarn
- Notion account with integration access
- (Optional) AWS account for S3 image hosting

### Step-by-Step Setup

#### 1. Clone and Install

```bash
git clone https://github.com/your-username/notion-importer.git
cd notion-importer
npm install
```

#### 2. Notion Setup

**Create a Notion Integration:**
1. Go to [www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **New integration**
3. Name it (e.g., "Markdown Sync")
4. Copy the **Internal Integration Secret** (this is your `NOTION_TOKEN`)

**Set Up Your Database:**
1. Create a new database in Notion
2. Copy the Database ID from the URL: `https://www.notion.so/your-workspace/DATABASE_ID?v=...`
3. Add these exact property names to your database:
   - **Name** (Title) - *automatically exists*
   - **Path** (Text) - *for file paths*
   - **Has Images** (Checkbox) - *tracks image content*
   - **Created Date** (Date) - *file creation date*

**Share Database with Integration:**
1. On your database page, click **Share**
2. Click **Invite** and select your integration
3. Grant access to the integration

#### 3. AWS S3 Setup (Optional - for Image Hosting)

> ⚠️ **Privacy Note**: This method makes your images publicly accessible on the internet to anyone with the direct link. While links are long and unguessable, they are not private. This is the trade-off for automated, permanent image hosting in Notion.

**Create S3 Bucket:**
1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click **Create bucket**
3. Choose a globally unique name (e.g., `yourname-notion-assets`)
4. Select a region near you (e.g., `us-west-2`)

**Make Bucket Public:**
1. Click on your bucket → **Permissions** tab
2. Under **Block public access**, click **Edit**
3. Uncheck "Block all public access" → **Save changes** → type `confirm`
4. Under **Bucket policy**, click **Edit** and paste:
   ```json
   {
       "Version": "2012-10-17",
       "Statement": [
           {
               "Effect": "Allow",
               "Principal": "*",
               "Action": "s3:GetObject",
               "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
           }
       ]
   }
   ```
   Replace `YOUR_BUCKET_NAME` with your actual bucket name.

**Create IAM User:**
1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. **Users** → **Create user** → name it `notion-s3-uploader`
3. **Attach policies directly** → **Create policy**
4. Use JSON editor and paste:
   ```json
   {
       "Version": "2012-10-17",
       "Statement": [
           {
               "Effect": "Allow",
               "Action": "s3:PutObject",
               "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
           }
       ]
   }
   ```
5. Name the policy `NotionS3UploadAccess` and attach to user
6. Go to user → **Security credentials** → **Create access key** (CLI option)
7. Copy both **Access key ID** and **Secret access key**

#### 4. Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env
```

Edit `.env` with your values:
```bash
# Required: Notion Integration Token
NOTION_TOKEN=secret_1234567890abcdef...

# Optional: S3 Configuration (for permanent image hosting)
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
S3_BUCKET_NAME=your-notion-images-bucket
S3_REGION=us-east-1
S3_DOMAIN=your-bucket.s3.amazonaws.com

# Optional: Testing and debugging
DRY_RUN=false
DEBUG=false
```

## ⚙️ Configuration

### Environment Variables (.env)

```bash
# Required: Notion Integration Token
NOTION_TOKEN=secret_1234567890abcdef...

# Optional: S3 Configuration (for image uploads)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=your-bucket-name
S3_REGION=us-east-1

# Optional: S3 Domain (for migration scripts)
S3_DOMAIN=your-bucket.s3.amazonaws.com

# Optional: Dry run mode (for testing)
DRY_RUN=false
```

### Configuration File (config.js)

```javascript
module.exports = {
  // Base directory for markdown files
  markdownBaseDir: path.join(__dirname, 'my-markdown-files'),
  
  // Attachments folder name
  attachmentsDir: 'Attachments',
  
  // Processing limits
  concurrencyLimit: 5,
  
  // Root database name
  rootDatabaseName: 'Root',
};
```

### Project Folder Structure

Create your markdown files in the recommended structure:

```
notion-importer/
├── my-markdown-files/          # Your markdown content
│   ├── Projects/
│   │   ├── Project A.md
│   │   └── Project B.md
│   ├── Notes/
│   │   ├── Meeting Notes.md
│   │   └── Research.md
│   └── Attachments/            # Centralized images folder
│       ├── screenshot1.png
│       ├── diagram.jpg
│       └── document.pdf
├── notion-backup/              # Generated backups
├── src/                        # Script utilities
├── .env                        # Your configuration
└── config.js                   # Folder settings
```

**Important Notes:**
- Create a `my-markdown-files` folder for your content
- Use an `Attachments` subfolder for all images
- Folder names become Notion database names
- File names become Notion page titles

## 📖 Usage Examples

### Example 1: Backup Your Notion Workspace

```bash
# Full backup
npm run backup

# The script will:
# 1. Find all databases in your workspace
# 2. Export each page as markdown
# 3. Download all images to Attachments/
# 4. Create an index file
# 5. Save state for incremental backups
```

### Example 2: Sync Markdown Files to Notion

```bash
# Sync your markdown folder to Notion
npm start

# The script will:
# 1. Scan your markdown files directory
# 2. Create databases for each folder
# 3. Upload markdown content as Notion pages
# 4. Upload images to S3 and link them
```

### Example 3: Clean Up Notion Database

```bash
# Review and clean databases
npm run cleanup

# The script will:
# 1. Show you duplicate or empty pages
# 2. Ask for confirmation before deletion
# 3. Clean up the database structure
```

## 📁 File Structure

```
notion-importer/
├── README.md                    # This file
├── BACKUP_README.md            # Detailed backup documentation
├── package.json                # Node.js dependencies and scripts
├── config.js                   # Main configuration file
├── .env                        # Environment variables (create this)
├── .gitignore                  # Git ignore patterns
│
├── src/                        # Core utilities
│   ├── notion.js              # Notion API wrapper
│   ├── utils.js               # Helper functions
│   └── s3.js                  # S3 upload utilities
│
├── sync-to-notion.js          # 📤 Main sync script
├── notion-backup.js           # 📥 Backup script
├── notion-page-cleanup.js     # 🧹 Cleanup script
│
├── my-markdown-files/         # 📝 Your markdown content
├── notion-backup/             # 📥 Backup output directory
└── temp-s3-images/           # 🖼️ Temporary image storage
```

## 🎯 Common Use Cases

### 📱 Digital Note Migration
- **From Obsidian to Notion**: Use `sync-to-notion.js`
- **From Notion to Obsidian**: Use `notion-backup.js`
- **Cross-platform sync**: Regular backups and syncs

### 📚 Documentation Management
- **Team knowledge base**: Sync docs to Notion for collaboration
- **Personal wiki**: Backup Notion to markdown for local access
- **Content archival**: Regular automated backups

### 🏢 Workspace Organization
- **Database cleanup**: Remove duplicates and test content
- **Structure optimization**: Reorganize with cleanup tools
- **Bulk operations**: Process hundreds of pages efficiently

## 🔧 Advanced Configuration

### Custom Block Conversion

Modify `src/utils.js` to customize how different block types are converted:

```javascript
// Example: Custom heading conversion
function convertHeading(block) {
    const level = block.heading_1 ? 1 : block.heading_2 ? 2 : 3;
    const text = extractText(block[`heading_${level}`].rich_text);
    return `${'#'.repeat(level)} ${text}\n\n`;
}
```

### Image Processing Options

Configure image handling in your scripts:

```javascript
// High quality images
const imageOptions = {
    quality: 95,
    maxWidth: 2048,
    format: 'webp'
};

// Fast processing
const imageOptions = {
    quality: 75,
    maxWidth: 1024,
    format: 'jpeg'
};
```

## 🚨 Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| **"Integration not found"** | Check your `NOTION_TOKEN` in `.env` file |
| **"Object not found"** | Ensure integration has access to pages/databases |
| **Images not uploading** | Verify S3 credentials and bucket permissions |
| **Rate limiting errors** | Scripts include delays, but very large workspaces may need longer delays |
| **Out of memory** | Process smaller batches or increase Node.js memory limit |

### Debug Mode

Enable detailed logging:

```bash
DEBUG=true npm run backup
```

### Performance Tuning

For large workspaces:

```javascript
// In config.js
module.exports = {
    concurrencyLimit: 3,        // Reduce concurrent operations
    delayBetweenRequests: 500,  // Add delays between API calls
    maxRetries: 5,              // Increase retry attempts
};
```

## 📊 Script Comparison

| Feature | sync-to-notion | notion-backup | notion-page-cleanup |
|---------|----------------|---------------|-------------------|
| **Direction** | Markdown → Notion | Notion → Markdown | Notion → Notion |
| **Images** | Upload to S3 | Download locally | N/A |
| **Incremental** | ❌ | ✅ | N/A |
| **Bulk Operations** | ✅ | ✅ | ✅ |
| **Dry Run** | ❌ | ❌ | ✅ |
| **Best For** | Initial migration | Regular backups | Maintenance |

## 🛡️ Security & Privacy

- **API Keys**: Never commit `.env` files to version control
- **Rate Limits**: Scripts respect Notion API limits
- **Data Safety**: Backup scripts create read-only operations
- **Dry Run**: Test cleanup operations before making changes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Add tests if applicable
5. Commit your changes: `git commit -m 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/notion-importer.git
cd notion-importer

# Install dependencies
npm install

# Create test environment
cp .env.example .env.test
# Add test credentials

# Run tests (if available)
npm test
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Notion API](https://developers.notion.com/) for the excellent API
- [Obsidian](https://obsidian.md/) for inspiration on markdown organization
- The open-source community for various utilities and patterns

## 📞 Support

- 🐛 **Bug Reports**: [Create an issue](https://github.com/your-username/notion-importer/issues)
- 💡 **Feature Requests**: [Create an issue](https://github.com/your-username/notion-importer/issues)
- 💬 **Questions**: [Discussions](https://github.com/your-username/notion-importer/discussions)

---

**Made with ❤️ for the knowledge management community**
