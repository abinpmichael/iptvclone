<?php
require_admin();

$viewers = read_json_file(VIEWERS_FILE, []);
if (prune_viewers($viewers)) {
    write_json_file(VIEWERS_FILE, $viewers);
}

$list = [];
foreach ($viewers as $id => $v) {
    $list[] = array_merge(['viewerId' => $id], $v);
}
usort($list, fn($a, $b) => $b['lastSeen'] <=> $a['lastSeen']);

json_response(['viewers' => $list, 'count' => count($list)]);
