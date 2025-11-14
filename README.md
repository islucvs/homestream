# HomeStream

## First Steps
Download HomeStream files

## Setting up your medias

### For movies

Put your .mp4 movies inside the /videos/movies folder

### For TV Series

Put your .mp4 movies inside the /videos/series/Name_of_your_series/Season1 folder

## Setup environment
> [!IMPORTANT]
> First you must have node.js installed on your machine

Go to the Homestream folder, run 

`npm install express csv-parser csv-writer`

And then run

`node server.js`

The application is set to run on port 80, you can change it on the `server.js` file. 

## File Structure
`data`
    ├── metadata.csv
    └── MOVIE_TITLES_METADATA.txt
local_video_player.html
package.json
package-lock.json
`public`
    ├── example.html
    ├── index.html
    ├── movies.html
    └── series.html
README.md
server.js
`videos`
    ├── `movies`
    │   ├── MOVIE 1 (EXAMPLE).txt
    │   ├── MOVIE 2 (EXAMPLE).txt
    └── `series`
        ├── `test`
        │   └── temporada 1
        │       └── S01E01 (EXAMPLE).txt
        └── `test2`
            ├── temporada 1
            │   └── S01E01 (EXAMPLE).txt
            └── temporada 2
                └── S01E02 (EXAMPLE).txt