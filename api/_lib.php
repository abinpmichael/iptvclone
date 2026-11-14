<?php
header('Content-Type: application/json');

define('DATA_DIR', __DIR__ . '/../data');
// Data files are .php files that start with a guard line, so a direct request
// for one answers 404 instead of handing out its contents (admin tokens,
// viewer IPs, settings) even on servers that ignore .htaccess.
define('DATA_GUARD', "<?php http_response_code(404); exit; ?>
");
define('DISABLED_FILE', DATA_DIR . '/disabled.php');
define('VIEWERS_FILE', DATA_DIR . '/viewers.php');
define('TOKENS_FILE', DATA_DIR . '/tokens.php');
define('LANG_CACHE_FILE', DATA_DIR . '/languages_cache.php');
define('CINEMA_CACHE_FILE', DATA_DIR . '/cinema_cache.php');
define('SETTINGS_FILE', DATA_DIR . '/settings.php');
define('HEARTBEAT_TIMEOUT_MS', 15000);
define('TOKEN_TTL_SECONDS', 24 * 60 * 60);

if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

$GLOBALS['config'] = require __DIR__ . '/../config.php';

function json_response($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function read_body() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function read_json_file($path, $default) {
    if (!file_exists($path)) {
        // One-time migration of the disabled-channel list from the old .json file.
        $legacy = DATA_DIR . '/disabled.json';
        if ($path === DISABLED_FILE && file_exists($legacy)) $path = $legacy;
        else return $default;
    }
    $fh = fopen($path, 'r');
    if (!$fh) return $default;
    flock($fh, LOCK_SH);
    $content = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    if (strncmp($content, DATA_GUARD, strlen(DATA_GUARD)) === 0) {
        $content = substr($content, strlen(DATA_GUARD));
    }
    $data = json_decode($content, true);
    return $data === null ? $default : $data;
}

function write_json_file($path, $data) {
    $fh = fopen($path, 'c');
    if (!$fh) return false;
    flock($fh, LOCK_EX);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, DATA_GUARD . json_encode($data, JSON_PRETTY_PRINT));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return true;
}

function now_ms() {
    return (int) round(microtime(true) * 1000);
}

function bearer_token() {
    $auth = '';
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach ($headers as $k => $v) {
            if (strtolower($k) === 'authorization') $auth = $v;
        }
    }
    if (!$auth && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
        return trim($m[1]);
    }
    return null;
}

function require_admin() {
    $token = bearer_token();
    $tokens = read_json_file(TOKENS_FILE, []);
    $now = time();
    $tokens = array_filter($tokens, fn($exp) => $exp > $now);
    // Tokens are stored hashed, so reading the file never yields a usable one.
    if (!$token || !isset($tokens[hash('sha256', $token)])) {
        json_response(['error' => 'Unauthorized'], 401);
    }
}

function client_ip() {
    return $_SERVER['REMOTE_ADDR'] ?? '';
}

function prune_viewers(&$viewers) {
    $now = now_ms();
    $changed = false;
    foreach ($viewers as $id => $v) {
        if ($now - $v['lastSeen'] > HEARTBEAT_TIMEOUT_MS) {
            unset($viewers[$id]);
            $changed = true;
        }
    }
    return $changed;
}

function fetch_url($url, $headers = []) {
    $context = stream_context_create([
        'http' => ['timeout' => 25, 'header' => implode("

", $headers)],
        'https' => ['timeout' => 25, 'header' => implode("

", $headers)],
    ]);
    $raw = @file_get_contents($url, false, $context);
    if ($raw === false && function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 25);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        if ($headers) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $raw = curl_exec($ch);
        curl_close($ch);
    }
    return $raw === false ? null : $raw;
}

function load_settings() {
    return read_json_file(SETTINGS_FILE, []);
}

// Settings saved from the admin panel win over config.local.php / env vars.
function effective_tmdb() {
    $s = load_settings();
    $cfg = $GLOBALS['config'];
    return [
        'key' => !empty($s['tmdb_api_key']) ? $s['tmdb_api_key'] : ($cfg['tmdb_api_key'] ?? ''),
        'region' => !empty($s['tmdb_region']) ? $s['tmdb_region'] : ($cfg['tmdb_region'] ?? 'US'),
        'from_admin' => !empty($s['tmdb_api_key']),
    ];
}

function tmdb_base() {
    return getenv('TMDB_API_BASE') ?: 'https://api.themoviedb.org/3';
}

function tmdb_get($key, $path, $params = []) {
    $headers = [];
    // A v4 "read access token" is a long JWT; a v3 key is a short hex string.
    if (strlen($key) > 60) $headers[] = 'Authorization: Bearer ' . $key;
    else $params['api_key'] = $key;
    $raw = fetch_url(tmdb_base() . $path . '?' . http_build_query($params), $headers);
    if ($raw === null) return null;
    $data = json_decode($raw, true);
    return is_array($data) && !isset($data['status_code']) ? $data : null;
}
