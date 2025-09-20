import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'diuimvolk',
  api_key: process.env.CLOUDINARY_API_KEY || '951173624257878',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'qwr0k9B9Qo7uFo43hqtnm-41OUc'
});

export default cloudinary;
