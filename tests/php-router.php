<?php
// Router for `php -S` that mimics the .htaccess rewrite (all /api/* -> api/index.php).
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('#^(.*)/api/#', $uri, $m)) {
    require $_SERVER['DOCUMENT_ROOT'] . $m[1] . '/api/index.php';
    return true;
}
return false;
