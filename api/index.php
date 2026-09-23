<?php
require __DIR__ . '/_lib.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^.*/api#', '', $path);
$path = rtrim($path, '/');
if ($path === '') $path = '/';

$routes = [
    'POST /admin/login' => 'admin_login',
    'POST /admin/logout' => 'admin_logout',
    'POST /heartbeat' => 'heartbeat',
    'POST /leave' => 'leave',
    'GET /disabled' => 'disabled_list',
    'GET /admin/viewers' => 'admin_viewers',
    'POST /admin/disable' => 'admin_disable',
    'POST /admin/enable' => 'admin_enable',
    'GET /languages' => 'languages',
];

$key = "$method $path";
if (!isset($routes[$key])) {
    json_response(['error' => 'Not found'], 404);
}

require __DIR__ . '/handlers/' . $routes[$key] . '.php';
