<?php
$body = read_body();
$viewerId = $body['viewerId'] ?? null;
$channelUrl = $body['channelUrl'] ?? null;
$channelName = $body['channelName'] ?? '';

if (!$viewerId || !$channelUrl) {
    json_response(['error' => 'Missing viewerId or channelUrl'], 400);
}

$disabled = read_json_file(DISABLED_FILE, []);
$allowed = !in_array($channelUrl, $disabled, true);

$viewers = read_json_file(VIEWERS_FILE, []);
prune_viewers($viewers);

if ($allowed) {
    $existing = $viewers[$viewerId] ?? null;
    $joinedAt = ($existing && $existing['channelUrl'] === $channelUrl)
        ? $existing['joinedAt']
        : now_ms();
    $viewers[$viewerId] = [
        'channelUrl' => $channelUrl,
        'channelName' => $channelName,
        'ip' => client_ip(),
        'joinedAt' => $joinedAt,
        'lastSeen' => now_ms(),
    ];
} else {
    unset($viewers[$viewerId]);
}

write_json_file(VIEWERS_FILE, $viewers);
json_response(['allowed' => $allowed]);
