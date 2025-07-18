const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs/promises');
const path = require('path');

const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

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
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: fileData,
    });
    await s3Client.send(putCommand);

    const publicUrl = `https://s3.${process.env.AWS_S3_REGION}.amazonaws.com/${process.env.AWS_S3_BUCKET_NAME}/${key}`;
    
    console.log(`    ⬆️  Uploaded ${fileName} to S3.`);
    return publicUrl;

  } catch (error) {
    console.error(`    ❌ ERROR uploading ${fileName} to S3:`, error.message);
    return null;
  }
}

module.exports = {
    uploadFileToS3,
};
