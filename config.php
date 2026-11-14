<?php
// Change this before deploying, or set an ADMIN_PASSWORD environment
// variable in your hosting control panel if it supports one.
return [
    'admin_password' => getenv('ADMIN_PASSWORD') ?: 'admin123',

    // Optional: powers the Video Club "Now in cinemas" tab (posters + trailers).
    // Get a free key at https://www.themoviedb.org/settings/api and paste it
    // here, or set a TMDB_API_KEY environment variable. Leave empty to disable.
    'tmdb_api_key' => getenv('TMDB_API_KEY') ?: '',
    'tmdb_region' => getenv('TMDB_REGION') ?: 'US',
];
