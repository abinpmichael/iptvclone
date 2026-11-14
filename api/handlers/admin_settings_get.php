<?php
require_admin();

// Never return the key itself, only whether one is set and its last 4 characters.
$t = effective_tmdb();
json_response([
    'tmdbKeySet' => $t['key'] !== '',
    'tmdbKeyHint' => $t['key'] !== '' ? '••••' . substr($t['key'], -4) : '',
    'tmdbKeySource' => $t['key'] === '' ? '' : ($t['from_admin'] ? 'admin panel' : 'server config'),
    'tmdbRegion' => $t['region'],
]);
