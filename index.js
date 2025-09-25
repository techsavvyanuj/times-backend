import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import cloudinary from './cloudinaryConfig.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Configure CORS
app.use(cors({
  origin: [
    'https://www.timesnowindia24.live',
    'https://timesnowindiaadmin-main.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use('/uploads', express.static('uploads'));

// Add a test endpoint to verify CORS
app.get('/api/test', (req, res) => {
  res.json({ message: 'CORS is working' })
});

// Health check endpoint for AWS
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Configure multer for video uploads
// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure the uploads directory exists
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads', { recursive: true });
    }
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const filename = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, Date.now() + '_' + filename);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /mp4|mov|avi|wmv/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Video files only!'));
  }
});

// Multer for breaking-news: allow both small preview videos and image thumbnails
const breakingNewsUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    console.log('Processing breaking news file:', file.originalname, 'MIME:', file.mimetype); // Debug log
    
    // Video types
    const videoExtTypes = /mp4|mov|avi|wmv/;
    const videoMimeTypes = /video\/(mp4|quicktime|avi|x-msvideo)/;
    
    // Image types  
    const imageExtTypes = /jpeg|jpg|png|gif|webp/;
    const imageMimeTypes = /image\/(jpeg|jpg|png|gif|webp)/;
    
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Check if it's a valid video file
    const isValidVideo = videoExtTypes.test(ext) && videoMimeTypes.test(file.mimetype);
    
    // Check if it's a valid image file
    const isValidImage = imageExtTypes.test(ext) && imageMimeTypes.test(file.mimetype);
    
    if (isValidVideo || isValidImage) {
      return cb(null, true);
    }
    
    cb(new Error(`Invalid file type. Only video (MP4, MOV, AVI, WMV) and image (JPEG, JPG, PNG, GIF, WebP) files are allowed. Got: ${file.mimetype} with extension: ${ext}`));
  }
});

// --- Simple JSON file storage ---
const DATA_FILE = './data.json';
function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      posters: [],
      breakingNews: [],
      featuredStories: [],
      categories: [],
      users: [],
      media: [],
      news: [],
      staticPages: [],
      tickers: [],
      tools: [],
      ads: []
    };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Activity Logger ---
function logActivity(type, title, user = 'Admin User', status = 'completed') {
  const data = readData();
  if (!data.activities) data.activities = [];
  
  const activity = {
    id: Date.now(),
    type,
    title,
    user,
    status,
    timestamp: new Date().toISOString()
  };
  
  data.activities.unshift(activity); // Add to beginning
  data.activities = data.activities.slice(0, 50); // Keep only last 50 activities
  writeData(data);
  return activity;
}

// --- Helper function to upload to Cloudinary ---
async function uploadToCloudinary(file, folder) {
  if (!file || !file.path) {
    console.error('Invalid file provided to uploadToCloudinary');
    throw new Error('Invalid file provided for upload');
  }

  try {
    console.log(`Attempting to upload file: ${file.originalname} to Cloudinary...`);
    const result = await cloudinary.uploader.upload(file.path, {
      folder: folder,
      resource_type: "auto",
      timeout: 60000 // 60 seconds timeout
    });
    console.log(`Successfully uploaded to Cloudinary. URL: ${result.secure_url}`);
    
    // Clean up the local file
    try {
      fs.unlinkSync(file.path);
    } catch (unlinkError) {
      console.error('Error cleaning up local file:', unlinkError);
      // Don't throw here, as the upload was successful
    }
    
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }
}

// --- Authentication Endpoints ---
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const data = readData();
  const user = data.users.find(u => u.username === username && u.password === password);
  
  if (user) {
    res.json({ success: true, user: { ...user, password: undefined } });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// --- Posters Endpoints ---
const posterUpload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    console.log('Processing file:', file.originalname, 'MIME:', file.mimetype); // Debug log
    
    // Support modern image formats
    const imageExtTypes = /jpeg|jpg|png|gif|webp|avif/;
    const imageMimeTypes = /image\/(jpeg|jpg|png|gif|webp|avif)/;
    
    const ext = path.extname(file.originalname).toLowerCase();
    const extname = imageExtTypes.test(ext);
    const mimetype = imageMimeTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error(`Invalid file type. Only JPEG, JPG, PNG, GIF, WebP, and AVIF are allowed. Got: ${file.mimetype} with extension: ${ext}`));
  }
});

app.get('/api/posters', (req, res) => {
  try {
    const data = readData();
    // Ensure we always have 3 posters
    const posters = data.posters || [];
    while (posters.length < 3) {
      posters.push({ id: posters.length + 1, title: '', image: '', link: '' });
    }
    console.log('Sending posters:', posters); // Debug log
    res.json(posters);
  } catch (error) {
    console.error('Error fetching posters:', error);
    res.status(500).json({ error: 'Failed to fetch posters' });
  }
});

app.post('/api/posters', posterUpload.fields([
  { name: 'posterImage1', maxCount: 1 },
  { name: 'posterImage2', maxCount: 1 },
  { name: 'posterImage3', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Received poster update request');
    console.log('Files:', req.files);
    console.log('Body:', req.body);
    
    if (!req.files) {
      console.log('No files received');
    }
    
    // Ensure the data file exists
    const data = readData();
    if (!data.posters) {
      data.posters = [];
    }
    
    const posters = [];

    // Process each poster (up to 3)
    for (let i = 1; i <= 3; i++) {
      const title = req.body[`poster${i}Title`];
      const link = req.body[`poster${i}Link`];
      let imageUrl = req.body[`poster${i}ImageUrl`];

      // Handle file uploads
      const files = req.files ? req.files[`posterImage${i}`] : [];
      
      if (files && files.length > 0) {
        try {
          imageUrl = await uploadToCloudinary(files[0], 'posters');
          console.log(`Successfully uploaded image for poster ${i}:`, imageUrl);
        } catch (uploadError) {
          console.error(`Error uploading file for poster ${i}:`, uploadError);
          throw uploadError; // Propagate the error
        }
      }

      posters.push({
        id: i,
        title: title || '',
        image: imageUrl || '',
        link: link || ''
      });
    }

    // Save all posters
    data.posters = posters;
    writeData(data);
    console.log('Updated posters:', posters);
    res.json(posters);
  } catch (error) {
    console.error('Error updating posters:', error);
    res.status(500).json({ error: 'Failed to update posters: ' + error.message });
  }
});

// --- Breaking News Endpoints ---
app.get('/api/breaking-news', (req, res) => {
  const data = readData();
  res.json(data.breakingNews);
});

app.post('/api/breaking-news', breakingNewsUpload.any(), async (req, res) => {
    try {
      console.log('Received breaking-news POST request');
      console.log('Body:', req.body);
      console.log('Files:', req.files);
      const { headline, shortDescription, fullDescription, category, state, youtubeUrl } = req.body;
      const data = readData();
      
     const filesArray = req.files || [];
     const filesByField = {};
     filesArray.forEach(f => {
       if (!filesByField[f.fieldname]) filesByField[f.fieldname] = [];
       filesByField[f.fieldname].push(f);
     });

     let videoUrl = '';
     let thumbnailUrl = '';

     if (filesByField.video && filesByField.video[0]) {
       try {
         videoUrl = await uploadToCloudinary(filesByField.video[0], 'breaking-news');
       } catch (err) {
         console.error('Error uploading breaking news video:', err);
         return res.status(500).json({ error: 'Failed to upload video', details: err.message });
       }
     }

     if (filesByField.thumbnail && filesByField.thumbnail[0]) {
       try {
         thumbnailUrl = await uploadToCloudinary(filesByField.thumbnail[0], 'breaking-news-thumbnails');
       } catch (err) {
         console.error('Error uploading thumbnail:', err);
         return res.status(500).json({ error: 'Failed to upload thumbnail', details: err.message });
       }
     }

      const newNews = {
        id: Date.now(),
        headline,
        shortDescription,
        fullDescription,
        category,
        state,
        videoUrl,
        thumbnail: thumbnailUrl || '',
        youtubeUrl: youtubeUrl || '',
        timestamp: new Date().toISOString()
      };

      data.breakingNews.unshift(newNews);
      writeData(data);
      res.json(newNews);
    } catch (error) {
      console.error('Failed to add breaking news:', error);
      res.status(500).json({ error: 'Failed to add breaking news', details: error.message });
    }
});

// Update existing breaking news item (allows replacing video/thumbnail)
app.put('/api/breaking-news/:id', breakingNewsUpload.any(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = readData();
    const idx = data.breakingNews.findIndex(b => b.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Breaking news not found' });

    console.log('Received breaking-news PUT request for id:', id);
    console.log('Body:', req.body);
    console.log('Files:', req.files);

    const { headline, shortDescription, fullDescription, category, state, youtubeUrl } = req.body;

    // map files by fieldname
    const filesArray = req.files || [];
    const filesByField = {};
    filesArray.forEach(f => {
      if (!filesByField[f.fieldname]) filesByField[f.fieldname] = [];
      filesByField[f.fieldname].push(f);
    });

    let existing = data.breakingNews[idx];
    let videoUrl = existing.videoUrl || '';
    let thumbnailUrl = existing.thumbnail || '';

    // If new video uploaded, replace
    if (filesByField.video && filesByField.video[0]) {
      try {
        videoUrl = await uploadToCloudinary(filesByField.video[0], 'breaking-news');
      } catch (err) {
        console.error('Error uploading updated video:', err);
        return res.status(500).json({ error: 'Failed to upload video', details: err.message });
      }
    }

    // If new thumbnail uploaded, replace
    if (filesByField.thumbnail && filesByField.thumbnail[0]) {
      try {
        thumbnailUrl = await uploadToCloudinary(filesByField.thumbnail[0], 'breaking-news-thumbnails');
      } catch (err) {
        console.error('Error uploading updated thumbnail:', err);
        return res.status(500).json({ error: 'Failed to upload thumbnail', details: err.message });
      }
    }

    // Update fields if provided
    data.breakingNews[idx] = {
      ...existing,
      headline: headline !== undefined ? headline : existing.headline,
      shortDescription: shortDescription !== undefined ? shortDescription : existing.shortDescription,
      fullDescription: fullDescription !== undefined ? fullDescription : existing.fullDescription,
      category: category !== undefined ? category : existing.category,
      state: state !== undefined ? state : existing.state,
      youtubeUrl: youtubeUrl !== undefined ? youtubeUrl : existing.youtubeUrl,
      videoUrl,
      thumbnail: thumbnailUrl,
      timestamp: new Date().toISOString()
    };

    writeData(data);
    res.json(data.breakingNews[idx]);
  } catch (error) {
    console.error('Failed to update breaking news:', error);
    res.status(500).json({ error: 'Failed to update breaking news', details: error.message });
  }
});

// Delete breaking news item
app.delete('/api/breaking-news/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = readData();
    const idx = data.breakingNews.findIndex(b => b.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Breaking news not found' });
    data.breakingNews.splice(idx, 1);
    writeData(data);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete breaking news:', error);
    res.status(500).json({ error: 'Failed to delete breaking news' });
  }
});

// Get breaking news by category
app.get('/api/breaking-news/category/:category', (req, res) => {
  try {
    const { category } = req.params;
    const data = readData();
    const filteredNews = data.breakingNews.filter(news => 
      news.category && news.category.toLowerCase() === category.toLowerCase()
    );
    res.json(filteredNews);
  } catch (error) {
    console.error('Failed to fetch breaking news by category:', error);
    res.status(500).json({ error: 'Failed to fetch breaking news by category' });
  }
});

// --- Featured Stories Endpoints ---
// Get all featured stories
app.get('/api/featured-stories', (req, res) => {
  try {
    const data = readData();
    res.json(data.featuredStories || []);
  } catch (error) {
    console.error('Failed to fetch featured stories:', error);
    res.status(500).json({ error: 'Failed to fetch featured stories' });
  }
});

// Create featured story
app.post('/api/featured-stories', posterUpload.single('image'), async (req, res) => {
  try {
    console.log('Received featured story POST request');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    
    const { title, description, content, category, state, excerpt, priority } = req.body;
    
    let imageUrl = '';
    // Handle image upload
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file, 'featured-stories');
      } catch (err) {
        console.error('Error uploading featured story image:', err);
        return res.status(500).json({ error: 'Failed to upload image', details: err.message });
      }
    }

    const data = readData();
    const newStory = {
      id: Date.now(),
      title,
      description,
      content: content || description,
      category,
      state,
      excerpt: excerpt || description,
      imageUrl,
      priority: priority ? Number(priority) : 1,
      views: '0',
      timestamp: new Date().toISOString()
    };

    if (!data.featuredStories) data.featuredStories = [];
    data.featuredStories.push(newStory);
    writeData(data);
    
    // Log activity
    logActivity('featured-story', `New featured story published: "${title.substring(0, 50)}${title.length > 50 ? '...' : ''}"`, 'Admin User', 'published');
    
    res.status(201).json(newStory);
  } catch (error) {
    console.error('Failed to create featured story:', error);
    res.status(500).json({ error: 'Failed to create featured story', details: error.message });
  }
});

// Update featured story
app.put('/api/featured-stories/:id', posterUpload.single('image'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, content, category, state, excerpt, priority } = req.body;
    
    const data = readData();
    const storyIdx = data.featuredStories.findIndex(s => s.id === id);
    if (storyIdx === -1) return res.status(404).json({ error: 'Featured story not found' });

    let imageUrl = data.featuredStories[storyIdx].imageUrl;
    
    // Handle image upload
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file, 'featured-stories');
      } catch (err) {
        console.error('Error uploading featured story image:', err);
        return res.status(500).json({ error: 'Failed to upload image', details: err.message });
      }
    }

    // Update the story
    data.featuredStories[storyIdx] = {
      ...data.featuredStories[storyIdx],
      title,
      description,
      content: content || description,
      category,
      state,
      excerpt: excerpt || description,
      imageUrl,
      priority: priority ? Number(priority) : data.featuredStories[storyIdx].priority,
      timestamp: new Date().toISOString()
    };

    writeData(data);
    
    // Log activity
    logActivity('featured-story', `Featured story updated: "${title.substring(0, 50)}${title.length > 50 ? '...' : ''}"`, 'Admin User', 'updated');
    
    res.json(data.featuredStories[storyIdx]);
  } catch (error) {
    console.error('Failed to update featured story:', error);
    res.status(500).json({ error: 'Failed to update featured story', details: error.message });
  }
});

// Delete featured story
app.delete('/api/featured-stories/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = readData();
    if (!data.featuredStories) data.featuredStories = [];
    
    const idx = data.featuredStories.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Featured story not found' });
    
    const deletedStory = data.featuredStories[idx];
    data.featuredStories.splice(idx, 1);
    writeData(data);
    
    // Log activity
    logActivity('featured-story', `Featured story deleted: "${deletedStory.title.substring(0, 50)}${deletedStory.title.length > 50 ? '...' : ''}"`, 'Admin User', 'deleted');
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete featured story:', error);
    res.status(500).json({ error: 'Failed to delete featured story' });
  }
});

// Get featured stories by category
app.get('/api/featured-stories/category/:category', (req, res) => {
  try {
    const { category } = req.params;
    const data = readData();
    const filteredStories = (data.featuredStories || []).filter(story => 
      story.category && story.category.toLowerCase() === category.toLowerCase()
    );
    res.json(filteredStories);
  } catch (error) {
    console.error('Failed to fetch featured stories by category:', error);
    res.status(500).json({ error: 'Failed to fetch featured stories by category' });
  }
});

// Get all content by category (breaking news + featured stories + regular news)
app.get('/api/category/:category', (req, res) => {
  try {
    const { category } = req.params;
    const data = readData();
    
    // Filter breaking news by category
    const breakingNews = (data.breakingNews || []).filter(news => 
      news.category && news.category.toLowerCase() === category.toLowerCase()
    );
    
    // Filter featured stories by category
    const featuredStories = (data.featuredStories || []).filter(story => 
      story.category && story.category.toLowerCase() === category.toLowerCase()
    );
    
    // Filter regular news by category
    const regularNews = (data.news || []).filter(news => 
      news.category && news.category.toLowerCase() === category.toLowerCase()
    );
    
    res.json({
      breakingNews,
      featuredStories,
      news: regularNews,
      category
    });
  } catch (error) {
    console.error('Failed to fetch content by category:', error);
    res.status(500).json({ error: 'Failed to fetch content by category' });
  }
});

// --- Category Management Endpoints ---
app.get('/api/categories', (req, res) => {
  const data = readData();
  res.json(data.categories);
});

app.post('/api/categories', (req, res) => {
  const { name, description } = req.body;
  const data = readData();
  const newCategory = {
    id: Date.now(),
    name,
    description,
    timestamp: new Date().toISOString()
  };
  data.categories.push(newCategory);
  writeData(data);
  res.json(newCategory);
});

// --- Media Management Endpoints ---
app.post('/api/media', posterUpload.single('file'), async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = await uploadToCloudinary(req.file, 'media');
    const data = readData();
    const newMedia = {
      id: Date.now(),
      title,
      description,
      url: fileUrl,
      type: req.file.mimetype,
      timestamp: new Date().toISOString()
    };

    data.media.push(newMedia);
    writeData(data);
    res.json(newMedia);
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

// --- Activity Endpoints ---
app.get('/api/activities', (req, res) => {
  const data = readData();
  res.json(data.activities || []);
});

// --- News Management Endpoints ---
app.get('/api/news', (req, res) => {
  const data = readData();
  res.json(data.news);
});

app.post('/api/news', posterUpload.single('image'), async (req, res) => {
  try {
    const { title, content, category } = req.body;
    let imageUrl = '';
    // Prefer image URL provided in body (from admin form), otherwise upload file if present
    if (req.body.imageUrl) {
      imageUrl = req.body.imageUrl;
    } else if (req.file) {
      imageUrl = await uploadToCloudinary(req.file, 'news');
    }

    const data = readData();
    const newNews = {
      id: Date.now(),
      title,
      content,
      category,
      imageUrl,
      timestamp: new Date().toISOString()
    };

    data.news.push(newNews);
    writeData(data);
    
    // Log activity
    logActivity('news', `New article published: "${title.substring(0, 50)}${title.length > 50 ? '...' : ''}"`, 'Admin User', 'published');
    
    res.json(newNews);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add news' });
  }
});

// Update existing news item
app.put('/api/news/:id', posterUpload.single('image'), async (req, res) => {
  try {
    const newsId = Number(req.params.id);
    const data = readData();
    const idx = data.news.findIndex(n => n.id === newsId);
    if (idx === -1) return res.status(404).json({ error: 'News not found' });

    const { title, content, category, imageUrl } = req.body;
    let finalImageUrl = imageUrl || data.news[idx].imageUrl || '';

    if (req.file) {
      finalImageUrl = await uploadToCloudinary(req.file, 'news');
    }

    data.news[idx] = {
      ...data.news[idx],
      title: title || data.news[idx].title,
      content: content || data.news[idx].content,
      category: category || data.news[idx].category,
      imageUrl: finalImageUrl,
      timestamp: new Date().toISOString()
    };

    writeData(data);
    
    // Log activity
    logActivity('news', `Article updated: "${data.news[idx].title.substring(0, 50)}${data.news[idx].title.length > 50 ? '...' : ''}"`, 'Admin User', 'updated');
    
    res.json(data.news[idx]);
  } catch (error) {
    console.error('Failed to update news:', error);
    res.status(500).json({ error: 'Failed to update news' });
  }
});

// Delete news item
app.delete('/api/news/:id', (req, res) => {
  try {
    const newsId = Number(req.params.id);
    const data = readData();
    const idx = data.news.findIndex(n => n.id === newsId);
    if (idx === -1) return res.status(404).json({ error: 'News not found' });
    
    const deletedNews = data.news[idx];
    data.news.splice(idx, 1);
    writeData(data);
    
    // Log activity
    logActivity('news', `Article deleted: "${deletedNews.title.substring(0, 50)}${deletedNews.title.length > 50 ? '...' : ''}"`, 'Admin User', 'deleted');
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete news' });
  }
});

// --- Static Pages Endpoints ---
app.get('/api/static-pages', (req, res) => {
  const data = readData();
  res.json(data.staticPages);
});

app.post('/api/static-pages', (req, res) => {
  const { title, content, slug } = req.body;
  const data = readData();
  const newPage = {
    id: Date.now(),
    title,
    content,
    slug,
    timestamp: new Date().toISOString()
  };
  data.staticPages.push(newPage);
  writeData(data);
  res.json(newPage);
});

// --- Ticker Management Endpoints ---
app.get('/api/tickers', (req, res) => {
  const data = readData();
  res.json(data.tickers);
});

app.post('/api/tickers', (req, res) => {
  const { text, type } = req.body;
  const data = readData();
  const newTicker = {
    id: Date.now(),
    text,
    type,
    active: true,
    timestamp: new Date().toISOString()
  };
  data.tickers.push(newTicker);
  writeData(data);
  res.json(newTicker);
});

// --- Ads Management Endpoints ---
app.get('/api/ads', (req, res) => {
  const data = readData();
  res.json(data.ads);
});

app.post('/api/ads', posterUpload.single('image'), async (req, res) => {
  try {
    const { title, placement, startDate, endDate, url } = req.body;
    let imageUrl = '';
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file, 'ads');
    }

    const data = readData();
    const newAd = {
      id: Date.now(),
      title,
      placement,
      imageUrl,
      url,
      startDate,
      endDate,
      active: true,
      timestamp: new Date().toISOString()
    };

    data.ads.push(newAd);
    writeData(data);
    res.json(newAd);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add advertisement' });
  }
});

// --- User Management Endpoints ---
app.get('/api/users', (req, res) => {
  const data = readData();
  res.json(data.users.map(user => ({ ...user, password: undefined })));
});

app.post('/api/users', (req, res) => {
  const { username, password, role, email } = req.body;
  const data = readData();
  
  if (data.users.some(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const newUser = {
    id: Date.now(),
    username,
    password,
    role,
    email,
    timestamp: new Date().toISOString()
  };
  
  data.users.push(newUser);
  writeData(data);
  res.json({ ...newUser, password: undefined });
});

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});
