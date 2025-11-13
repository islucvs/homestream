const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const app = express();
const PORT = 80;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/videos', express.static('videos'));

// Paths
const VIDEOS_DIR = path.join(__dirname, 'videos');
const MOVIES_DIR = path.join(VIDEOS_DIR, 'movies');
const SERIES_DIR = path.join(VIDEOS_DIR, 'series');
const METADATA_FILE = path.join(__dirname, 'data', 'metadata.csv');
const DATA_DIR = path.join(__dirname, 'data');

// Ensure directories exist
if (!fs.existsSync(MOVIES_DIR)) fs.mkdirSync(MOVIES_DIR, { recursive: true });
if (!fs.existsSync(SERIES_DIR)) fs.mkdirSync(SERIES_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Initialize metadata CSV if it doesn't exist
if (!fs.existsSync(METADATA_FILE)) {
    const header = 'type,series,filename,title,season,episode,customTitle\n';
    fs.writeFileSync(METADATA_FILE, header);
}

// CSV writer configuration
const csvWriter = createCsvWriter({
    path: METADATA_FILE,
    header: [
        {id: 'type', title: 'type'},
        {id: 'series', title: 'series'},
        {id: 'filename', title: 'filename'},
        {id: 'title', title: 'title'},
        {id: 'season', title: 'season'},
        {id: 'episode', title: 'episode'},
        {id: 'customTitle', title: 'customTitle'}
    ]
});

// Helper function to read metadata
function readMetadata() {
    return new Promise((resolve, reject) => {
        const metadata = [];
        if (!fs.existsSync(METADATA_FILE)) {
            resolve(metadata);
            return;
        }

        fs.createReadStream(METADATA_FILE)
            .pipe(csv())
            .on('data', (data) => metadata.push(data))
            .on('end', () => resolve(metadata))
            .on('error', reject);
    });
}

// Helper function to write metadata
async function writeMetadata(metadata) {
    await csvWriter.writeRecords(metadata);
}

// Parse season number from folder name (Portuguese support)
function parseSeasonNumber(folderName) {
    const patterns = [
        /Temporada[\s\.]*(\d+)/i,
        /temporada[\s\.]*(\d+)/i,
        /Temp[\s\.]*(\d+)/i,
        /temp[\s\.]*(\d+)/i,
        /Season[\s\.]*(\d+)/i,
        /season[\s\.]*(\d+)/i,
        /S(\d+)/i,
        /s(\d+)/i,
        /T(\d+)/i,
        /t(\d+)/i,
        /(\d+)/
    ];

    for (const pattern of patterns) {
        const match = folderName.match(pattern);
        if (match) {
            return parseInt(match[1]);
        }
    }
    
    return 1;
}

// Parse episode number from filename
function parseEpisodeNumber(filename) {
    const numbers = filename.match(/\d+/g);
    if (numbers && numbers.length >= 1) {
        return parseInt(numbers[0]);
    }
    return 1;
}

// API Routes

// Get movies only
app.get('/api/movies', async (req, res) => {
    try {
        const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
        const { search } = req.query;
        
        // Read metadata
        const metadata = await readMetadata();
        const metadataMap = new Map();
        metadata.forEach(item => {
            metadataMap.set(item.filename, item);
        });

        let movies = [];

        // Scan movies
        if (fs.existsSync(MOVIES_DIR)) {
            try {
                const movieFiles = fs.readdirSync(MOVIES_DIR).filter(file => 
                    videoExtensions.some(ext => file.toLowerCase().endsWith(ext))
                );

                for (const filename of movieFiles) {
                    const meta = metadataMap.get(filename);
                    const title = filename.replace(/\.[^/.]+$/, "");
                    
                    const movie = {
                        type: 'movie',
                        filename,
                        path: `/videos/movies/${encodeURIComponent(filename)}`,
                        title: meta?.title || title,
                        customTitle: meta?.customTitle || title,
                        originalFormat: path.extname(filename).toLowerCase()
                    };

                    // Apply search filter
                    if (search) {
                        const searchTerm = search.toLowerCase();
                        const searchableText = [
                            movie.customTitle,
                            movie.title,
                            movie.filename
                        ].join(' ').toLowerCase();
                        
                        if (searchableText.includes(searchTerm)) {
                            movies.push(movie);
                        }
                    } else {
                        movies.push(movie);
                    }
                }
            } catch (error) {
                console.error('Error reading movies directory:', error);
            }
        }

        res.json({
            movies: movies,
            total: movies.length
        });
    } catch (error) {
        console.error('Error reading movies:', error);
        res.status(500).json({ error: 'Failed to read movies' });
    }
});

// Get series only
app.get('/api/series', async (req, res) => {
    try {
        const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
        const { search } = req.query;
        
        // Read metadata
        const metadata = await readMetadata();
        const metadataMap = new Map();
        metadata.forEach(item => {
            metadataMap.set(item.filename, item);
        });

        const series = {};

        // Scan series
        if (fs.existsSync(SERIES_DIR)) {
            try {
                const seriesFolders = fs.readdirSync(SERIES_DIR, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                for (const seriesName of seriesFolders) {
                    // Apply search filter to series name
                    if (search && !seriesName.toLowerCase().includes(search.toLowerCase())) {
                        continue;
                    }

                    try {
                        const seriesPath = path.join(SERIES_DIR, seriesName);
                        
                        // Look for season folders
                        const seasonFolders = fs.readdirSync(seriesPath, { withFileTypes: true })
                            .filter(dirent => dirent.isDirectory())
                            .map(dirent => dirent.name);

                        const seasons = {};

                        // If no season folders, treat the series folder as season 1
                        if (seasonFolders.length === 0) {
                            const episodeFiles = fs.readdirSync(seriesPath).filter(file => 
                                videoExtensions.some(ext => file.toLowerCase().endsWith(ext))
                            );

                            const episodes = [];
                            for (const filename of episodeFiles) {
                                const meta = metadataMap.get(filename);
                                const title = filename.replace(/\.[^/.]+$/, "");
                                const episodeNumber = parseEpisodeNumber(filename);
                                
                                const episode = {
                                    type: 'episode',
                                    series: seriesName,
                                    filename,
                                    path: `/videos/series/${encodeURIComponent(seriesName)}/${encodeURIComponent(filename)}`,
                                    title: meta?.title || title,
                                    customTitle: meta?.customTitle || title,
                                    season: 1,
                                    episode: meta?.episode || episodeNumber,
                                    originalFormat: path.extname(filename).toLowerCase()
                                };

                                if (search) {
                                    const searchTerm = search.toLowerCase();
                                    const searchableText = [
                                        episode.customTitle,
                                        episode.title,
                                        episode.filename,
                                        seriesName
                                    ].join(' ').toLowerCase();
                                    
                                    if (searchableText.includes(searchTerm)) {
                                        episodes.push(episode);
                                    }
                                } else {
                                    episodes.push(episode);
                                }
                            }

                            episodes.sort((a, b) => a.episode - b.episode);
                            
                            if (episodes.length > 0) {
                                seasons[1] = episodes;
                            }
                        } else {
                            // Process each season folder
                            for (const seasonFolder of seasonFolders) {
                                const seasonNumber = parseSeasonNumber(seasonFolder);
                                
                                const seasonPath = path.join(seriesPath, seasonFolder);
                                const episodeFiles = fs.readdirSync(seasonPath).filter(file => 
                                    videoExtensions.some(ext => file.toLowerCase().endsWith(ext))
                                );

                                const episodes = [];
                                for (const filename of episodeFiles) {
                                    const meta = metadataMap.get(filename);
                                    const title = filename.replace(/\.[^/.]+$/, "");
                                    const episodeNumber = parseEpisodeNumber(filename);
                                    
                                    const episode = {
                                        type: 'episode',
                                        series: seriesName,
                                        filename,
                                        path: `/videos/series/${encodeURIComponent(seriesName)}/${encodeURIComponent(seasonFolder)}/${encodeURIComponent(filename)}`,
                                        title: meta?.title || title,
                                        customTitle: meta?.customTitle || title,
                                        season: seasonNumber,
                                        episode: meta?.episode || episodeNumber,
                                        originalFormat: path.extname(filename).toLowerCase()
                                    };

                                    if (search) {
                                        const searchTerm = search.toLowerCase();
                                        const searchableText = [
                                            episode.customTitle,
                                            episode.title,
                                            episode.filename,
                                            seriesName,
                                            `temporada ${seasonNumber}`
                                        ].join(' ').toLowerCase();
                                        
                                        if (searchableText.includes(searchTerm)) {
                                            episodes.push(episode);
                                        }
                                    } else {
                                        episodes.push(episode);
                                    }
                                }

                                episodes.sort((a, b) => a.episode - b.episode);
                                
                                if (episodes.length > 0) {
                                    seasons[seasonNumber] = episodes;
                                }
                            }
                        }

                        // Only add series if it has episodes
                        const totalEpisodes = Object.values(seasons).reduce((total, season) => total + season.length, 0);
                        if (totalEpisodes > 0) {
                            series[seriesName] = {
                                name: seriesName,
                                seasons: seasons,
                                totalEpisodes: totalEpisodes
                            };
                        }
                    } catch (seriesError) {
                        console.error(`Error reading series folder "${seriesName}":`, seriesError);
                    }
                }
            } catch (error) {
                console.error('Error reading series directory:', error);
            }
        }

        res.json({
            series: series,
            totalSeries: Object.keys(series).length
        });
    } catch (error) {
        console.error('Error reading series:', error);
        res.status(500).json({ error: 'Failed to read series' });
    }
});

// Update content title
app.put('/api/content/:filename/title', async (req, res) => {
    try {
        const { filename } = req.params;
        const { customTitle, type, series, season, episode } = req.body;

        if (!customTitle) {
            return res.status(400).json({ error: 'Title is required' });
        }

        // Read current metadata
        const metadata = await readMetadata();
        const metadataMap = new Map();
        metadata.forEach(item => {
            metadataMap.set(item.filename, item);
        });

        // Update or add metadata
        const title = filename.replace(/\.[^/.]+$/, "");
        const existingMeta = metadataMap.get(filename) || {};
        metadataMap.set(filename, {
            ...existingMeta,
            type: type || 'movie',
            series: series || '',
            filename,
            title,
            season: season || 1,
            episode: episode || 1,
            customTitle
        });

        // Convert back to array and write
        const updatedMetadata = Array.from(metadataMap.values());
        await writeMetadata(updatedMetadata);

        res.json({ success: true, filename, customTitle });
    } catch (error) {
        console.error('Error updating title:', error);
        res.status(500).json({ error: 'Failed to update title' });
    }
});

// Update series title
app.put('/api/series/:seriesName/title', async (req, res) => {
    try {
        const { seriesName } = req.params;
        const { newTitle } = req.body;

        if (!newTitle) {
            return res.status(400).json({ error: 'New title is required' });
        }

        // Read current metadata
        const metadata = await readMetadata();
        
        // Update all episodes of this series
        const updatedMetadata = metadata.map(item => {
            if (item.series === seriesName) {
                return {
                    ...item,
                    series: newTitle
                };
            }
            return item;
        });

        await writeMetadata(updatedMetadata);

        res.json({ success: true, oldTitle: seriesName, newTitle });
    } catch (error) {
        console.error('Error updating series title:', error);
        res.status(500).json({ error: 'Failed to update series title' });
    }
});

// Export metadata
app.get('/api/metadata/export', async (req, res) => {
    try {
        const metadata = await readMetadata();
        const csvContent = ['type,series,filename,title,season,episode,customTitle'];
        metadata.forEach(item => {
            csvContent.push(`${item.type},${item.series},${item.filename},${item.title},${item.season},${item.episode},${item.customTitle}`);
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=video_metadata.csv');
        res.send(csvContent.join('\n'));
    } catch (error) {
        console.error('Error exporting metadata:', error);
        res.status(500).json({ error: 'Failed to export metadata' });
    }
});

// Import metadata
app.post('/api/metadata/import', express.text({ type: 'text/csv' }), async (req, res) => {
    try {
        const csvContent = req.body;
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        const metadata = [];
        const startIndex = lines[0].startsWith('type,series,filename,title,season,episode,customTitle') ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const [type, series, filename, title, season, episode, customTitle] = lines[i].split(',');
            if (filename && title) {
                metadata.push({
                    type: type || 'movie',
                    series: series || '',
                    filename,
                    title,
                    season: season || 1,
                    episode: episode || 1,
                    customTitle: customTitle || title
                });
            }
        }

        await writeMetadata(metadata);
        res.json({ success: true, imported: metadata.length });
    } catch (error) {
        console.error('Error importing metadata:', error);
        res.status(500).json({ error: 'Failed to import metadata' });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Video Player server running on http://localhost:${PORT}`);
    console.log(`Movies: ${MOVIES_DIR}`);
    console.log(`Series: ${SERIES_DIR}`);
});