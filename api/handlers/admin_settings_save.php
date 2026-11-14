<?php
require_admin();
$body = read_body();
$settings = load_settings();
$verified = null;

if (array_key_exists('tmdb_api_key', $body)) {
    $k = trim((string) $body['tmdb_api_key']);
    if ($k !== '') {
        if (!preg_match('/^[A-Za-z0-9._\-]{16,2000}$/', $k)) {
            json_response(['error' => 'That does not look like a TMDB key (letters, numbers, dots and dashes only).'], 400);
        }
        if (tmdb_get($k, '/configuration') === null) {
            json_response(['error' => 'TMDB rejected this key (or could not be reached). Check it and try again.'], 400);
        }
        $verified = true;
    }
    $settings['tmdb_api_key'] = $k; // an empty string clears the admin-panel key
}

if (isset($body['tmdb_region'])) {
    $r = strtoupper(trim((string) $body['tmdb_region']));
    if (!preg_match('/^[A-Z]{2}$/', $r)) json_response(['error' => 'Region must be a 2-letter country code, e.g. CA.'], 400);
    $settings['tmdb_region'] = $r;
}

write_json_file(SETTINGS_FILE, $settings);
if (file_exists(CINEMA_CACHE_FILE)) @unlink(CINEMA_CACHE_FILE); // so a new key/region takes effect now

json_response(['ok' => true, 'verified' => $verified]);
