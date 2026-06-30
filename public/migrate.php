<?php
// SCRIPT DE MIGRACIÓN TEMPORAL — eliminar tras ejecutar
// Accede a: https://tudominio.com/migrate.php (solo desde IP de admin)

$env = file_exists(__DIR__ . '/../.env') ? parse_ini_file(__DIR__ . '/../.env') : [];
$host = $env['DB_HOST'] ?? 'fdb1031.125mb.com';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? '4694716_4694716';
$pass = $env['DB_PASSWORD'] ?? 'P@ssw0rd';
$name = $env['DB_NAME'] ?? '4694716_4694716';

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    // Verificar si ya existe la columna
    $stmt = $pdo->query("SHOW COLUMNS FROM roulette_options LIKE 'gives_ticket_rarity_id'");
    if ($stmt->fetch()) {
        echo '<p style="color:green">✅ La columna <b>gives_ticket_rarity_id</b> ya existe. No es necesaria la migración.</p>';
    } else {
        $pdo->exec('ALTER TABLE roulette_options ADD COLUMN gives_ticket_rarity_id TINYINT UNSIGNED DEFAULT NULL');
        echo '<p style="color:green">✅ Columna <b>gives_ticket_rarity_id</b> añadida correctamente a <b>roulette_options</b>.</p>';
    }
    echo '<p style="color:orange">⚠️ Recuerda eliminar este archivo migrate.php del servidor.</p>';
} catch (Exception $e) {
    echo '<p style="color:red">❌ Error: ' . htmlspecialchars($e->getMessage()) . '</p>';
}
?>
