<?php
header('Content-Type: application/json');

define('DATA_DIR', __DIR__ . '/../data');
define('DISABLED_FILE', DATA_DIR . '/disabled.json');
define('VIEWERS_FILE', DATA_DIR . '/viewers.json');
define('TOKENS_FILE', DATA_DIR . '/admin_tokens.json');
define('LANG_CACHE_FILE', DATA_DIR . '/languages_cache.json');
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
    if (!file_exists($path)) return $default;
    $fh = fopen($path, 'r');
    if (!$fh) return $default;
    flock($fh, LOCK_SH);
    $content = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    $data = json_decode($content, true);
    return $data === null ? $default : $data;
}

function write_json_file($path, $data) {
    $fh = fopen($path, 'c');
    if (!$fh) return false;
    flock($fh, LOCK_EX);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data, JSON_PRETTY_PRINT));
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
    if (!$token || !isset($tokens[$token])) {
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
