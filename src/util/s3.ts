import s3 from '../aws'
import path from 'path'
import fs from 'fs'
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
var mime = require('mime-types')

export async function uploadFile(
  Bucket: string,
  Key: string,
  filepath: string
) {
  const ContentType = mime.lookup(filepath) || 'application/octet-stream'
  const fileSize = fs.statSync(filepath).size

  // Define the chunk size - S3 requires each part to be at least 5MB (except the last part)
  const partSize = 5 * 1024 * 1024 // 5MB
  const numParts = Math.ceil(fileSize / partSize)

  try {
    // Step 1: Start multipart upload to get the upload ID
    const { UploadId } = await s3.createMultipartUpload({
      Bucket,
      Key,
      ContentType,
      ACL: 'public-read',
    })

    // Step 2: Split the file into parts and upload each part
    const partPromises = []

    for (let i = 0; i < numParts; i++) {
      const start = i * partSize
      const end = (i + 1) * partSize < fileSize ? (i + 1) * partSize : fileSize
      // Create a stream for this particular part
      const partStream = fs.createReadStream(filepath, { start, end: end - 1 })

      // Upload the part
      const partPromise = s3.uploadPart({
        Bucket,
        Key,
        PartNumber: i + 1,
        UploadId,
        Body: partStream,
      })

      partPromises.push(partPromise)
    }

    // Wait for all parts to be uploaded to get their ETags
    const uploadedParts = (await Promise.all(partPromises)).map(
      (part, index) => ({
        ETag: part.ETag,
        PartNumber: index + 1,
      })
    )

    // Step 3: Complete the multipart upload
    const completeResponse = await s3.completeMultipartUpload({
      Bucket,
      Key,
      UploadId,
      MultipartUpload: { Parts: uploadedParts },
    })

    return completeResponse.Location
  } catch (error) {
    console.error('Error with multipart upload', error)
    throw error
  }
}

export async function uploadFolder(
  Bucket: string,
  folderPath: string,
  s3FolderPath = ''
) {
  const files = await fs.promises.readdir(folderPath, { withFileTypes: true })
  const uploadPromises = []

  for (const file of files) {
    const localPath = path.join(folderPath, file.name)
    if (file.isDirectory()) {
      // If it's a directory, make a recursive call
      const uploadPromise = uploadFolder(
        Bucket,
        localPath,
        `${s3FolderPath}${file.name}/`
      )
      uploadPromises.push(uploadPromise)
    } else {
      // If it's a file, prepare to upload it
      const Key = `${s3FolderPath}${file.name}`
      const uploadPromise = uploadFile(Bucket, Key, localPath)
      uploadPromises.push(uploadPromise)
    }
  }

  // Use Promise.all to upload all files/directories in parallel
  // Note: To handle rejections and continue, consider using Promise.allSettled
  await Promise.all(uploadPromises)
}

export async function deleteFolder(bucketName: string, folderPath: string) {
  try {
    // Ensure the folder path ends with a '/'
    const folderPrefix = folderPath.endsWith('/')
      ? folderPath
      : `${folderPath}/`

    // List all objects within the folder
    const listResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: folderPrefix,
      })
    )

    // Check if there are any contents to delete
    if (listResponse.Contents && listResponse.Contents.length > 0) {
      const objectsToDelete = listResponse.Contents.map((content) => ({
        Key: content.Key,
      }))

      // Delete the objects
      await s3.deleteObjects({
        Bucket: bucketName,
        Delete: {
          Objects: objectsToDelete,
          Quiet: false,
        },
      })
    }
  } catch (error) {
    console.error(`Error deleting folder: ${folderPath} `, error)
  }
}

export async function overriteFolder(
  bucketName: string,
  folderPath: string,
  key: string
) {
  try {
    await deleteFolder(bucketName, key)
  } catch (error) {
    console.error('Error deleting folder', error)
  }
  await uploadFolder(bucketName, folderPath, key)
}

export async function overriteFile(
  bucketName: string,
  filepath: string,
  key: string
) {
  try {
    await s3.deleteObject({
      Bucket: bucketName,
      Key: key,
    })
  } catch (error) {
    console.error('Error deleting object', error)
  }
  await uploadFile(bucketName, key, filepath)
}
