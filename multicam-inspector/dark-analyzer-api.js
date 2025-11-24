const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp'); // We'll need to install this: npm install sharp
const cors = require('cors');

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

// Base path to hangar snapshots
const HANGAR_BASE_PATH = '/Users/oliverwallin/hangar_snapshots';

// Removed sharpness calculation - focusing only on brightness analysis

// Calculate image brightness using different methods
async function calculateImageBrightness(imagePath, method = 'average') {
  try {
    const image = sharp(imagePath);
    const { data, info } = await image
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let brightness = 0;

    switch (method) {
      case 'average':
        const totalBrightness = data.reduce((sum, pixel) => sum + pixel, 0);
        brightness = totalBrightness / data.length;
        break;

      case 'histogram':
        const histogram = new Array(256).fill(0);
        data.forEach(pixel => histogram[pixel]++);
        
        // Calculate percentage of dark pixels (below 50)
        const totalPixels = data.length;
        const darkPixels = histogram.slice(0, 50).reduce((sum, count) => sum + count, 0);
        brightness = 255 * (1 - darkPixels / totalPixels); // Invert so lower = darker
        break;

      case 'roi':
        // Analyze center 50% of image
        const { width, height } = info;
        const startX = Math.floor(width * 0.25);
        const startY = Math.floor(height * 0.25);
        const endX = Math.floor(width * 0.75);
        const endY = Math.floor(height * 0.75);
        
        let roiBrightness = 0;
        let roiPixels = 0;
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const pixelIndex = y * width + x;
            if (pixelIndex < data.length) {
              roiBrightness += data[pixelIndex];
              roiPixels++;
            }
          }
        }
        brightness = roiPixels > 0 ? roiBrightness / roiPixels : 0;
        break;
    }

    return Math.round(brightness);
  } catch (error) {
    console.error('Error calculating brightness for', imagePath, ':', error.message);
    return null;
  }
}

// Get all hangar folders
app.get('/api/hangars', async (req, res) => {
  try {
    const entries = await fs.readdir(HANGAR_BASE_PATH, { withFileTypes: true });
    const hangars = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name);
    
    res.json({ hangars });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all session folders for a specific hangar
app.get('/api/hangars/:hangar/sessions', async (req, res) => {
  try {
    const { hangar } = req.params;
    const hangarPath = path.join(HANGAR_BASE_PATH, hangar);
    
    // Check if hangar exists
    try {
      await fs.access(hangarPath);
    } catch {
      return res.status(404).json({ error: 'Hangar not found' });
    }

    const entries = await fs.readdir(hangarPath, { withFileTypes: true });
    const sessions = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const sessionPath = path.join(hangarPath, entry.name);
        
        try {
          const files = await fs.readdir(sessionPath);
          const imageFiles = files.filter(file => 
            file.toLowerCase().endsWith('.jpg') || 
            file.toLowerCase().endsWith('.jpeg') || 
            file.toLowerCase().endsWith('.png')
          );

          if (imageFiles.length > 0) {
            // Get session stats
            const stats = await fs.stat(sessionPath);
            
            sessions.push({
              name: entry.name,
              path: sessionPath,
              imageCount: imageFiles.length,
              imageFiles: imageFiles,
              created: stats.birthtime,
              modified: stats.mtime
            });
          }
        } catch (error) {
          console.error(`Error reading session ${entry.name}:`, error.message);
        }
      }
    }

    // Sort by creation date (newest first)
    sessions.sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({ hangar, sessions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analyze brightness for a specific session
app.post('/api/analyze-session', async (req, res) => {
  try {
    const { sessionPath, method = 'average', threshold = 100 } = req.body;

    if (!sessionPath) {
      return res.status(400).json({ error: 'Session path is required' });
    }

    // Check if session exists
    try {
      await fs.access(sessionPath);
    } catch {
      return res.status(404).json({ error: 'Session not found' });
    }

    const files = await fs.readdir(sessionPath);
    const imageFiles = files.filter(file => 
      file.toLowerCase().endsWith('.jpg') || 
      file.toLowerCase().endsWith('.jpeg') || 
      file.toLowerCase().endsWith('.png')
    );

    if (imageFiles.length === 0) {
      return res.json({
        sessionPath,
        images: [],
        darkImageCount: 0,
        avgBrightness: 0,
        flagged: false
      });
    }

    const images = [];
    let totalBrightness = 0;
    let darkCount = 0;

    for (const imageFile of imageFiles) {
      const imagePath = path.join(sessionPath, imageFile);
      
      try {
        const brightness = await calculateImageBrightness(imagePath, method);
        
        if (brightness !== null) {
          const isDark = brightness < threshold;
          
          images.push({
            name: imageFile,
            path: imagePath,
            brightness: brightness,
            isDark: isDark
          });

          totalBrightness += brightness;
          if (isDark) darkCount++;
        }
      } catch (error) {
        console.error(`Error analyzing ${imageFile}:`, error.message);
      }
    }

    const avgBrightness = images.length > 0 ? Math.round(totalBrightness / images.length) : 0;
    const flagged = darkCount > 0;

    res.json({
      sessionPath,
      method,
      threshold,
      images,
      darkImageCount: darkCount,
      avgBrightness,
      flagged,
      analysisDate: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch analyze multiple sessions
app.post('/api/analyze-batch', async (req, res) => {
  try {
    const { hangar, method = 'average', threshold = 40, limit } = req.body;

    if (!hangar) {
      return res.status(400).json({ error: 'Hangar is required' });
    }

    // Get sessions for the hangar
    const sessionsResponse = await new Promise((resolve) => {
      app._router.handle({
        method: 'GET',
        url: `/api/hangars/${hangar}/sessions`,
        params: { hangar }
      }, {
        json: resolve,
        status: () => ({ json: resolve })
      });
    });

    if (sessionsResponse.error) {
      return res.status(500).json(sessionsResponse);
    }

    const sessions = sessionsResponse.sessions;
    const sessionsToAnalyze = limit ? sessions.slice(0, limit) : sessions;
    const results = [];

    // Send progress updates
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked'
    });

    for (let i = 0; i < sessionsToAnalyze.length; i++) {
      const session = sessionsToAnalyze[i];
      
      try {
        const analysisResult = await new Promise(async (resolve) => {
          const files = await fs.readdir(session.path);
          const imageFiles = files.filter(file => 
            file.toLowerCase().endsWith('.jpg') || 
            file.toLowerCase().endsWith('.jpeg') || 
            file.toLowerCase().endsWith('.png')
          );

          if (imageFiles.length === 0) {
            return resolve({
              sessionName: session.name,
              sessionPath: session.path,
              images: [],
              darkImageCount: 0,
              avgBrightness: 0,
              flagged: false
            });
          }

          const images = [];
          let totalBrightness = 0;
          let darkCount = 0;

          for (const imageFile of imageFiles) {
            const imagePath = path.join(session.path, imageFile);
            
            try {
              const brightness = await calculateImageBrightness(imagePath, method);
              
              if (brightness !== null) {
                const isDark = brightness < threshold;
                
                images.push({
                  name: imageFile,
                  brightness: brightness,
                  isDark: isDark
                });

                totalBrightness += brightness;
                if (isDark) darkCount++;
              }
            } catch (error) {
              console.error(`Error analyzing ${imageFile}:`, error.message);
            }
          }

          const avgBrightness = images.length > 0 ? Math.round(totalBrightness / images.length) : 0;
          const flagged = darkCount > 0;

          resolve({
            sessionName: session.name,
            sessionPath: session.path,
            imageCount: images.length,
            images: images,
            darkImageCount: darkCount,
            avgBrightness,
            flagged,
            created: session.created
          });
        });

        results.push(analysisResult);

        // Send progress update
        const progress = {
          type: 'progress',
          current: i + 1,
          total: sessionsToAnalyze.length,
          session: analysisResult.sessionName,
          flagged: analysisResult.flagged
        };
        res.write(JSON.stringify(progress) + '\n');

      } catch (error) {
        console.error(`Error analyzing session ${session.name}:`, error.message);
      }
    }

    // Send final results
    const finalResult = {
      type: 'complete',
      hangar,
      method,
      threshold,
      totalSessions: results.length,
      flaggedSessions: results.filter(r => r.flagged).length,
      totalDarkImages: results.reduce((sum, r) => sum + r.darkImageCount, 0),
      results: results,
      analysisDate: new Date().toISOString()
    };

    res.write(JSON.stringify(finalResult) + '\n');
    res.end();

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete flagged sessions (DANGEROUS - use with caution)
app.post('/api/delete-sessions', async (req, res) => {
  try {
    const { sessionPaths, confirmBackup = false, confirmDelete = false } = req.body;

    if (!confirmBackup || !confirmDelete) {
      return res.status(400).json({ 
        error: 'Both confirmBackup and confirmDelete must be true' 
      });
    }

    if (!Array.isArray(sessionPaths) || sessionPaths.length === 0) {
      return res.status(400).json({ error: 'Session paths array is required' });
    }

    const results = [];

    for (const sessionPath of sessionPaths) {
      try {
        await fs.access(sessionPath);
        await fs.rm(sessionPath, { recursive: true, force: true });
        results.push({ sessionPath, deleted: true, error: null });
      } catch (error) {
        results.push({ sessionPath, deleted: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.deleted).length;
    const errorCount = results.filter(r => !r.deleted).length;

    res.json({
      message: `Deleted ${successCount} sessions, ${errorCount} errors`,
      results
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve images from hangar sessions
app.get('/api/image/:hangar/:session/:filename', async (req, res) => {
  try {
    const { hangar, session, filename } = req.params;
    const imagePath = path.join(HANGAR_BASE_PATH, hangar, session, filename);
    
    console.log(`Attempting to serve image: ${imagePath}`);
    
    // Check if file exists
    try {
      await fs.access(imagePath);
      console.log(`Image file exists: ${imagePath}`);
    } catch (error) {
      console.log(`Image file not found: ${imagePath}`);
      return res.status(404).json({ error: 'Image not found', path: imagePath });
    }
    
    // Set appropriate headers
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (ext === '.png') {
      res.setHeader('Content-Type', 'image/png');
    } else {
      res.setHeader('Content-Type', 'image/jpeg'); // default
    }
    
    // Send the file using absolute path
    res.sendFile(path.resolve(imagePath));
    
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    hangarBasePath: HANGAR_BASE_PATH
  });
});

app.listen(PORT, () => {
  console.log(`🌙 Dark Image Analyzer API running on http://localhost:${PORT}`);
  console.log(`📁 Monitoring hangar snapshots at: ${HANGAR_BASE_PATH}`);
});

module.exports = app;