<?php
require_admin();

$token = bearer_token();
$tokens = read_json_file(TOKENS_FILE, []);
unset($tokens[$token]);
write_json_file(TOKENS_FILE, $tokens);

json_response(['ok' => true]);
