<?php
const CINEMA_CACHE_FILE = DATA_DIR . '/cinema_cache.json';
const CINEMA_CACHE_SECONDS = 6 * 60 * 60;

$key = $GLOBALS['config']['tmdb_api_key'] ?? '';
$region = $GLOBALS['config']['tmdb_region'] ?? 'US';
if ($key === '') json_response(['configured' => false]);

$base = getenv('TMDB_API_BASE') ?: 'https://api.themoviedb.org/3';

function tmdb_get($base, $key, $path, $params) {
    $headers = [];
    // A v4 "read access token" is a long JWT; a v3 key is a short hex string.
    if (strlen($key) > 60) $headers[] = 'Authorization: Bearer ' . $key;
    else $params['api_key'] = $key;
    $raw = fetch_url($base . $path . '?' . http_build_query($params), $headers);
    if ($raw === null) return null;
    $data = json_decode($raw, true);
    return is_array($data) && !isset($data['status_code']) ? $data : null;
}

if (isset($_GET['id'])) {
    if (!preg_match('/^\d+$/', $_GET['id'])) json_response(['error' => 'Bad id'], 400);
    $id = $_GET['id'];

    $cache = read_json_file(CINEMA_CACHE_FILE, []);
    if (isset($cache['trailers'][$id])) json_response($cache['trailers'][$id]);

    $data = tmdb_get($base, $key, "/movie/$id/videos", ['language' => 'en-US']);
    if ($data === null) json_response(['configured' => true, 'error' => "Couldn't reach TMDB right now."], 502);

    $yt = array_values(array_filter($data['results'] ?? [], fn($v) => ($v['site'] ?? '') === 'YouTube'));
    $pick = null;
    foreach ([['Trailer', true], ['Trailer', null], ['Teaser', null]] as [$type, $official]) {
        foreach ($yt as $v) {
            if (($v['type'] ?? '') === $type && ($official === null || !empty($v['official']))) { $pick = $v; break 2; }
        }
    }
    $result = $pick ? ['key' => $pick['key'], 'name' => $pick['name'] ?? ''] : ['key' => null];

    $cache = read_json_file(CINEMA_CACHE_FILE, []);
    $cache['trailers'][$id] = $result;
    write_json_file(CINEMA_CACHE_FILE, $cache);
    json_response($result);
}

// lang === '': what is playing in the configured region right now.
// lang === 'ml' etc.: recent worldwide releases whose original language matches,
// newest first (so e.g. new Malayalam films show even if not showing locally).
$lang = $_GET['lang'] ?? '';
if ($lang !== '' && !preg_match('/^[a-z]{2}$/', $lang)) json_response(['error' => 'Bad language'], 400);

$cache = read_json_file(CINEMA_CACHE_FILE, []);
$entry = $cache['lists'][$lang] ?? null;
if ($entry && !empty($entry['movies']) && time() - $entry['fetchedAt'] < CINEMA_CACHE_SECONDS && ($entry['region'] ?? '') === $region) {
    json_response(['configured' => true, 'region' => $region, 'lang' => $lang, 'movies' => $entry['movies']]);
}

$movies = [];
foreach ([1, 2] as $page) {
    if ($lang !== '') {
        $data = tmdb_get($base, $key, '/discover/movie', [
            'with_original_language' => $lang,
            'sort_by' => 'primary_release_date.desc',
            'primary_release_date.gte' => date('Y-m-d', strtotime('-150 days')),
            'primary_release_date.lte' => date('Y-m-d', strtotime('+21 days')),
            'include_adult' => 'false',
            'language' => 'en-US',
            'page' => $page,
        ]);
    } else {
        $data = tmdb_get($base, $key, '/movie/now_playing', ['region' => $region, 'language' => 'en-US', 'page' => $page]);
    }
    if ($data === null) {
        if ($entry && !empty($entry['movies'])) json_response(['configured' => true, 'region' => $region, 'lang' => $lang, 'movies' => $entry['movies']]);
        json_response(['configured' => true, 'error' => "Couldn't reach TMDB right now."], 502);
    }
    foreach ($data['results'] ?? [] as $m) {
        $movies[] = [
            'id' => $m['id'],
            'title' => $m['title'] ?? '',
            'poster' => !empty($m['poster_path']) ? 'https://image.tmdb.org/t/p/w342' . $m['poster_path'] : '',
            'release' => $m['release_date'] ?? '',
            'overview' => $m['overview'] ?? '',
            'rating' => !empty($m['vote_average']) ? round($m['vote_average'], 1) : 0,
        ];
    }
}

$cache = read_json_file(CINEMA_CACHE_FILE, []);
$cache['lists'][$lang] = ['movies' => $movies, 'region' => $region, 'fetchedAt' => time()];
write_json_file(CINEMA_CACHE_FILE, $cache);
json_response(['configured' => true, 'region' => $region, 'lang' => $lang, 'movies' => $movies]);
