<?php
// Change this before deploying, or set an ADMIN_PASSWORD environment
// variable in your hosting control panel if it supports one.
return [
    'admin_password' => getenv('ADMIN_PASSWORD') ?: 'admin123',
];
