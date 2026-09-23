<?php
$body = read_body();
$viewerId = $body['viewerId'] ?? null;

if ($viewerId) {
    $viewers = read_json_file(VIEWERS_FILE, []);
    unset($viewers[$viewerId]);
    write_json_file(VIEWERS_FILE, $viewers);
}

json_response(['ok' => true]);
