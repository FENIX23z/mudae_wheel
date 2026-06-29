<?php
$path = __DIR__ . '/public/index.html';
if (!is_file($path)) {
    http_response_code(404);
    echo 'No se encontró la página principal.';
    exit;
}

$html = file_get_contents($path);
$html = str_replace('/css/', '/public/css/', $html);
$html = str_replace('/js/', '/public/js/', $html);

echo $html;
?>
