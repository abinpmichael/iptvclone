<?php
require_admin();
$body = read_body();
$url = $body['url'] ?? null;
if (!$url) json_response(['error' => 'Missing url'], 400);

$disabled = read_json_file(DISABLED_FILE, []);
if (!in_array($url, $disabled, true)) {
    $disabled[] = $url;
    write_json_file(DISABLED_FILE, $disabled);
}

$viewers = read_json_file(VIEWERS_FILE, []);
$changed = false;
foreach ($viewers as $id => $v) {
    if ($v['channelUrl'] === $url) {
        unset($viewers[$id]);
        $changed = true;
    }
}
if ($changed) write_json_file(VIEWERS_FILE, $viewers);

json_response(['ok' => true]);
