<?php
require_admin();
$body = read_body();
$url = $body['url'] ?? null;
if (!$url) json_response(['error' => 'Missing url'], 400);

$disabled = read_json_file(DISABLED_FILE, []);
$disabled = array_values(array_filter($disabled, fn($u) => $u !== $url));
write_json_file(DISABLED_FILE, $disabled);

json_response(['ok' => true]);
