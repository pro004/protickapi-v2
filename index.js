const express = require('express');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.enable("trust proxy");
app.set("json spaces", 2);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

// Serve static files from web directory
app.use(express.static(path.join(__dirname, 'web')));

// Load settings
const settingsPath = path.join(__dirname, 'settings.json');
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
} catch (error) {
  console.log('Using default settings');
  settings = {
    apiSettings: { operator: "Xrotick" },
    name: "Xrotick API",
    version: "2.0.0"
  };
}

// Dynamic API request tracking system
let apiRequestCounts = {};
let apiMetadata = {};

// Function to register API for tracking
function registerApiForTracking(path, name, description, category = 'api') {
  if (!apiRequestCounts.hasOwnProperty(path)) {
    apiRequestCounts[path] = 0;
    apiMetadata[path] = {
      name: name || path,
      description: description || `${name || path} endpoint`,
      category: category
    };
    console.log(chalk.green(`📊 Registered for tracking: ${name} -> ${path}`));
  }
}

// Auto-categorize API based on keywords in name/path
function getApiCategory(name, path) {
  const nameAndPath = (name + ' ' + path).toLowerCase();
  
  if (nameAndPath.includes('download') || nameAndPath.includes('dl')) return 'downloader';
  if (nameAndPath.includes('search') || nameAndPath.includes('youtube') || nameAndPath.includes('video')) return 'media';
  if (nameAndPath.includes('ai') || nameAndPath.includes('gpt') || nameAndPath.includes('jamba')) return 'ai';
  if (nameAndPath.includes('anime') || nameAndPath.includes('manga') || nameAndPath.includes('chara')) return 'anime';
  if (nameAndPath.includes('game') || nameAndPath.includes('archive') || nameAndPath.includes('cannon')) return 'game';
  if (nameAndPath.includes('example') || nameAndPath.includes('sample') || nameAndPath.includes('test')) return 'example';
  if (nameAndPath.includes('text') || nameAndPath.includes('util')) return 'utility';
  
  return 'api'; // default category
}

// Dynamic API request tracking middleware
app.use('/api', (req, res, next) => {
  // Skip tracking for stats, info, and settings endpoints
  if (req.path === '/stats' || req.path === '/info' || req.path.includes('settings')) {
    return next();
  }
  
  const apiPath = req.path.substring(1); // Remove leading slash
  
  // Auto-register any new API that hasn't been tracked yet
  if (!apiRequestCounts.hasOwnProperty(apiPath)) {
    // Try to get name from loaded modules or use path as fallback
    let apiName = apiPath;
    let description = `${apiPath} endpoint`;
    
    // Look for the API in loaded modules to get better metadata
    const foundModule = apiModules.find(module => {
      return module.path === apiPath || 
             module.endpoint === `/api/${apiPath}` ||
             module.name.toLowerCase().replace(/\s+/g, '') === apiPath.toLowerCase();
    });
    
    if (foundModule) {
      apiName = foundModule.name;
      description = foundModule.desc || foundModule.description || description;
    }
    
    const category = getApiCategory(apiName, apiPath);
    registerApiForTracking(apiPath, apiName, description, category);
  }
  
  // Track the request
  if (apiRequestCounts.hasOwnProperty(apiPath)) {
    apiRequestCounts[apiPath]++;
    console.log(chalk.cyan(`📈 API Request: ${apiPath} (Count: ${apiRequestCounts[apiPath]})`));
  }
  
  next();
});



// JSON response middleware
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (data) {
    if (data && typeof data === 'object') {
      const responseData = {
        status: data.status,
        operator: (settings.apiSettings && settings.apiSettings.operator) || "Xrotick",
        ...data
      };
      return originalJson.call(this, responseData);
    }
    return originalJson.call(this, data);
  };
  next();
});

// Load API modules
const apiFolder = path.join(__dirname, 'api');
let totalRoutes = 0;
const apiModules = [];
const apiUsageStats = {};

console.log(chalk.blue('🔄 Loading API modules...'));

// Function to load a single API file
function loadApiFile(filePath, fileName) {
  try {
    // Clear cache
    delete require.cache[require.resolve(filePath)];
    const module = require(filePath);
    
    if (!module.meta || !module.onStart || typeof module.onStart !== 'function') {
      console.warn(chalk.red(`⚠️  Invalid module: ${fileName} - Missing meta or onStart`));
      return false;
    }

    const basePath = module.meta.path.split('?')[0];
    const routePath = '/api' + basePath;
    const method = (module.meta.method || 'get').toLowerCase();
    
    // Register the route
    app[method](routePath, (req, res) => {
      const apiName = module.meta.name;
      if (!apiUsageStats[apiName]) {
        apiUsageStats[apiName] = 0;
      }
      apiUsageStats[apiName]++;
      
      module.onStart({ req, res });
    });
    
    const moduleData = {
      name: module.meta.name,
      desc: module.meta.description,
      description: module.meta.description,
      category: module.meta.category,
      path: basePath.substring(1), // Remove leading slash for tracking
      endpoint: routePath,
      author: module.meta.author,
      method: module.meta.method || 'get'
    };
    
    apiModules.push(moduleData);
    
    // Auto-register this API for tracking
    const trackingPath = basePath.substring(1); // Remove leading slash
    const category = getApiCategory(module.meta.name, trackingPath);
    registerApiForTracking(trackingPath, module.meta.name, module.meta.description, category);
    
    totalRoutes++;
    console.log(chalk.green(`✅ ${module.meta.name} (${method.toUpperCase()}) -> ${routePath}`));
    return true;
    
  } catch (error) {
    console.error(chalk.red(`❌ Error loading ${fileName}: ${error.message}`));
    return false;
  }
}

// Load main API files
if (fs.existsSync(apiFolder)) {
  const apiFiles = fs.readdirSync(apiFolder).filter(file => file.endsWith('.js'));
  console.log(chalk.yellow(`📁 Found ${apiFiles.length} API files in main directory`));
  
  // Sort files alphabetically to ensure consistent loading order
  apiFiles.sort().forEach(file => {
    const filePath = path.join(apiFolder, file);
    console.log(chalk.cyan(`📝 Processing: ${file}`));
    const success = loadApiFile(filePath, file);
    if (!success) {
      console.error(chalk.red(`⚠️  Failed to load ${file}`));
    }
  });
  
  // Load example subfolder APIs
  const exampleFolder = path.join(apiFolder, 'example');
  if (fs.existsSync(exampleFolder)) {
    console.log(chalk.yellow('📁 Loading example APIs...'));
    const subFolders = fs.readdirSync(exampleFolder);
    subFolders.forEach(subFolder => {
      const subFolderPath = path.join(exampleFolder, subFolder);
      if (fs.statSync(subFolderPath).isDirectory()) {
        const subFiles = fs.readdirSync(subFolderPath).filter(f => f.endsWith('.js'));
        subFiles.forEach(file => {
          const filePath = path.join(subFolderPath, file);
          console.log(chalk.cyan(`📝 Processing: example/${subFolder}/${file}`));
          loadApiFile(filePath, `example/${subFolder}/${file}`);
        });
      }
    });
  }
}

console.log(chalk.bgGreen.black(`\n🎉 API Loading Complete! Total Routes: ${totalRoutes}\n`));

// Create routes object for API info
const apiRoutes = {};
apiModules.forEach(module => {
  if (!apiRoutes[module.category]) {
    apiRoutes[module.category] = { name: module.category, items: [] };
  }
  apiRoutes[module.category].items.push({
    name: module.name,
    desc: module.description,
    path: module.path,
    author: module.author,
    method: module.method
  });
});

// Core endpoints
app.get('/settings.json', (req, res) => {
  res.json(settings);
});

// Live API statistics endpoint
app.get('/api/stats', (req, res) => {
  // Sort APIs by request count to get top APIs
  const sortedApis = Object.entries(apiRequestCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([apiKey, count], index) => ({
      id: apiKey,
      name: apiMetadata[apiKey]?.name || apiKey,
      description: apiMetadata[apiKey]?.description || `${apiKey} endpoint`,
      category: apiMetadata[apiKey]?.category || 'api',
      requests: count,
      rank: index + 1
    }));

  const totalRequests = Object.values(apiRequestCounts).reduce((sum, count) => sum + count, 0);
  
  res.json({
    status: true,
    message: 'Live API statistics',
    data: {
      topApis: sortedApis,
      totalRequests: totalRequests,
      totalEndpoints: Object.keys(apiRequestCounts).length,
      lastUpdated: new Date().toISOString(),
      allApis: Object.keys(apiRequestCounts).length
    }
  });
});

app.get('/api/info', (req, res) => {
  const { key } = req.query;
  
  if (key !== 'sexy') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Invalid key parameter.',
      operator: 'Xrotick'
    });
  }
  
  res.json({ 
    success: true,
    totalRoutes: totalRoutes,
    routes: apiRoutes,
    operator: settings.apiSettings?.operator || 'Xrotick',
    version: settings.version || '2.0.0',
    name: settings.name || 'Xrotick API',
    description: settings.description || 'Simple and Easy-to-Use API Documentation'
  });
});



// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'docs.html'));
});

app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'docs.html'));
});



// Error handlers
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'web', '404.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).sendFile(path.join(__dirname, 'web', '500.html'));
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(chalk.bgGreen.black(`\n🚀 Xrotick API Server running on http://0.0.0.0:${PORT}`));
  console.log(chalk.bgBlue.white(`📚 API Documentation: http://0.0.0.0:${PORT}/docs`));
  console.log(chalk.bgMagenta.white(`📊 Total APIs loaded: ${totalRoutes}`));
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

module.exports = app;