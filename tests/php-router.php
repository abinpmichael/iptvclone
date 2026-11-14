<?php
// Router for `php -S` that mimics the .htaccess behaviour (the built-in server ignores .htaccess):
//  - all /api/* -> api/index.php
//  - data/.htaccess denies direct access to anything in data/ except .php files,
//    which are left alone on purpose so their own 404 guard line is what gets tested.
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('#^(.*)/api/#', $uri, $m)) {
    require $_SERVER['DOCUMENT_ROOT'] . $m[1] . '/api/index.php';
    return true;
}
if (preg_match('#/data/#', $uri) && !preg_match('#\.php$#', $uri)) {
    http_response_code(403);
    return true;
}
return false;
