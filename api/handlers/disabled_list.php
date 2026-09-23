<?php
$disabled = read_json_file(DISABLED_FILE, []);
json_response(['disabled' => array_values($disabled)]);
