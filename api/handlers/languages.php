<?php
const LANG_REFRESH_SECONDS = 24 * 60 * 60;

const B_TO_T_CODE = [
    'alb' => 'sqi', 'arm' => 'hye', 'baq' => 'eus', 'bur' => 'mya',
    'chi' => 'zho', 'cze' => 'ces', 'dut' => 'nld', 'fre' => 'fra',
    'geo' => 'kat', 'ger' => 'deu', 'gre' => 'ell', 'ice' => 'isl',
    'mac' => 'mkd', 'mao' => 'mri', 'may' => 'msa', 'per' => 'fas',
    'rum' => 'ron', 'slo' => 'slk', 'tib' => 'bod', 'wel' => 'cym',
];

function fetch_url($url) {
    $context = stream_context_create(['http' => ['timeout' => 25], 'https' => ['timeout' => 25]]);
    $raw = @file_get_contents($url, false, $context);
    if ($raw === false && function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 25);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        $raw = curl_exec($ch);
        curl_close($ch);
    }
    return $raw === false ? null : $raw;
}

function fetch_language_data() {
    $feedsRaw = fetch_url('https://iptv-org.github.io/api/feeds.json');
    $langsRaw = fetch_url('https://iptv-org.github.io/api/languages.json');
    if ($feedsRaw === null || $langsRaw === null) return null;

    $feeds = json_decode($feedsRaw, true);
    $langs = json_decode($langsRaw, true);
    if (!is_array($feeds) || !is_array($langs)) return null;

    $nameByCode = [];
    foreach ($langs as $l) {
        if (isset($l['code'], $l['name'])) $nameByCode[$l['code']] = $l['name'];
    }

    $channels = [];
    $usedCodes = [];
    foreach ($feeds as $feed) {
        if (empty($feed['channel']) || empty($feed['languages']) || !is_array($feed['languages'])) continue;
        foreach ($feed['languages'] as $raw) {
            $code = B_TO_T_CODE[$raw] ?? $raw;
            if (!isset($channels[$feed['channel']])) $channels[$feed['channel']] = [];
            if (!in_array($code, $channels[$feed['channel']], true)) {
                $channels[$feed['channel']][] = $code;
            }
            $usedCodes[$code] = true;
        }
    }

    $names = [];
    foreach (array_keys($usedCodes) as $code) {
        $names[$code] = $nameByCode[$code] ?? $code;
    }

    return ['names' => $names, 'channels' => $channels];
}

$cache = read_json_file(LANG_CACHE_FILE, null);
$now = time();
$isStale = !$cache || !isset($cache['fetchedAt']) || ($now - $cache['fetchedAt']) > LANG_REFRESH_SECONDS;

if ($isStale) {
    $fresh = fetch_language_data();
    if ($fresh) {
        $fresh['fetchedAt'] = $now;
        write_json_file(LANG_CACHE_FILE, $fresh);
        $cache = $fresh;
    }
}

if (!$cache) {
    json_response(['names' => new stdClass(), 'channels' => new stdClass()]);
}

json_response(['names' => $cache['names'], 'channels' => $cache['channels']]);
