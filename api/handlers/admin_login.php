<?php
$body = read_body();
$password = $body['password'] ?? '';

if ($password !== $GLOBALS['config']['admin_password']) {
    json_response(['error' => 'Invalid password'], 401);
}

$token = bin2hex(random_bytes(24));
$tokens = read_json_file(TOKENS_FILE, []);
$tokens[$token] = time() + TOKEN_TTL_SECONDS;
write_json_file(TOKENS_FILE, $tokens);

json_response(['token' => $token]);
