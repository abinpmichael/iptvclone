<?php
// Default settings. Do NOT put your real password or API key in this file:
// it gets overwritten whenever you upload a new version of the app.
// Put your own values in config.local.php (copy config.local.php.example) —
// that file is never part of the download, so updates won't touch it.
$config = [
    'admin_password' => getenv('ADMIN_PASSWORD') ?: 'admin123',
    'tmdb_api_key' => getenv('TMDB_API_KEY') ?: '',
    'tmdb_region' => getenv('TMDB_REGION') ?: 'US',
];

if (is_file(__DIR__ . '/config.local.php')) {
    $config = array_merge($config, require __DIR__ . '/config.local.php');
}

return $config;
