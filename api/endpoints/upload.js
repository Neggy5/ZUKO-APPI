'use strict';

const crypto = require('crypto');
const multer = require('multer');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const MAX_UPLOAD_BYTES = Math.max(
  1,
  Number(process.env.UPLOAD_MAX_FILE_BYTES || process.env.YTDLP_MAX_FILE_BYTES || 100 * 1024 * 1024)
);
const URL_TTL = Math.min(
  90 * 24 * 60 * 60,
  Math.max(60, Number(process.env.UPLOAD_URL_TTL || 7 * 24 * 60 * 60))
);

const bucketName = String(
  process.env.BUCKET_NAME ||
  process.env.RAILWAY_BUCKET_NAME ||
  process.env.BUCKET ||
  process.env.AWS_S3_BUCKET_NAME ||
  ''
).trim();

const endpoint = String(
  process.env.BUCKET_ENDPOINT ||
  process.env.ENDPOINT ||
  process.env.AWS_ENDPOINT_URL ||
  ''
).trim();

const accessKeyId = String(
  process.env.BUCKET_ACCESS_KEY_ID ||
  process.env.ACCESS_KEY_ID ||
  process.env.AWS_ACCESS_KEY_ID ||
  ''
).trim();

const secretAccessKey = String(
  process.env.BUCKET_SECRET_ACCESS_KEY ||
  process.env.SECRET_ACCESS_KEY ||
  process.env.AWS_SECRET_ACCESS_KEY ||
  ''
).trim();

const region = String(
  process.env.BUCKET_REGION ||
  process.env.REGION ||
  process.env.AWS_DEFAULT_REGION ||
  'auto'
).trim();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }
}).single('file');

function configured() {
  return Boolean(bucketName && endpoint && accessKeyId && secretAccessKey);
}

function client() {
  if (!configured()) {
    throw new Error(
      'Upload storage is not configured. Add Railway Bucket credentials to the service variables.'
    );
  }
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: String(process.env.BUCKET_FORCE_PATH_STYLE || 'false').toLowerCase() === 'true',
    credentials: { accessKeyId, secretAccessKey }
  });
}

function safeName(name) {
  const base = String(name || 'upload.bin').split(/[\\/]/).pop();
  return base.replace(/[^\w.\- ]/g, '_').slice(0, 160) || 'upload.bin';
}

function contentType(file) {
  const value = String(file?.mimetype || 'application/octet-stream').toLowerCase();
  return value.startsWith('application/x-msdownload') ? 'application/octet-stream' : value;
}

function makeKey(file) {
  const ext = (() => {
    const name = safeName(file.originalname);
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(i).toLowerCase() : '';
  })();
  return `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext}`;
}

async function execute({ req, res }) {
  return new Promise((resolve, reject) => {
    upload(req, res, async (err) => {
      try {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return resolve({
              statusCode: 413,
              data: {
                status: false,
                error: `File is too large. Maximum is ${MAX_UPLOAD_BYTES} bytes.`
              }
            });
          }
          return resolve({ statusCode: 400, data: { status: false, error: err.message } });
        }

        if (!req.file) {
          return resolve({
            statusCode: 400,
            data: {
              status: false,
              error: 'file is required. Send multipart/form-data with field "file".'
            }
          });
        }

        const key = makeKey(req.file);
        const s3 = client();

        await s3.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: req.file.buffer,
          ContentType: contentType(req.file),
          ContentDisposition: `inline; filename="${safeName(req.file.originalname)}"`
        }));

        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
            ResponseContentType: contentType(req.file)
          }),
          { expiresIn: URL_TTL }
        );

        return resolve({
          status: true,
          message: 'File uploaded successfully.',
          filename: safeName(req.file.originalname),
          mimetype: contentType(req.file),
          size: req.file.size,
          key,
          url,
          expiresIn: URL_TTL
        });
      } catch (error) {
        return reject(error);
      }
    });
  });
}

module.exports = {
  name: 'File Upload',
  method: 'POST',
  path: '/v1/upload',
  category: 'Upload',
  description: 'Upload one file to a Railway S3-compatible Bucket and receive a temporary media URL.',
  execute
};
