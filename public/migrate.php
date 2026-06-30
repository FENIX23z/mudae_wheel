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

    $stmt = $pdo->query("SHOW COLUMNS FROM roulette_options LIKE 'gives_ticket_rarity_id'");
    if ($stmt->fetch()) {
        echo '<p style="color:green">✅ La columna <b>gives_ticket_rarity_id</b> ya existe. No es necesaria la migración.</p>';
    } else {
        $pdo->exec('ALTER TABLE roulette_options ADD COLUMN gives_ticket_rarity_id TINYINT UNSIGNED DEFAULT NULL');
        echo '<p style="color:green">✅ Columna <b>gives_ticket_rarity_id</b> añadida correctamente a <b>roulette_options</b>.</p>';
    }

    $stmt = $pdo->query("SHOW COLUMNS FROM roulettes LIKE 'spin_mode'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE roulettes ADD COLUMN spin_mode VARCHAR(20) NOT NULL DEFAULT 'normal'");
        echo '<p style="color:green">✅ Columna <b>spin_mode</b> añadida a <b>roulettes</b>.</p>';
    }

    $stmt = $pdo->query("SHOW COLUMNS FROM roulettes LIKE 'free_spin_cooldown_seconds'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE roulettes ADD COLUMN free_spin_cooldown_seconds INT UNSIGNED NOT NULL DEFAULT 0");
        echo '<p style="color:green">✅ Columna <b>free_spin_cooldown_seconds</b> añadida a <b>roulettes</b>.</p>';
    }

    $stmt = $pdo->query("SHOW TABLES LIKE 'roulette_free_spin_state'");
    if (!$stmt->fetch()) {
        $pdo->exec("CREATE TABLE roulette_free_spin_state (user_id INT UNSIGNED NOT NULL, roulette_id VARCHAR(20) NOT NULL, last_used_at DATETIME DEFAULT NULL, PRIMARY KEY (user_id, roulette_id), KEY idx_rfs_roulette (roulette_id), CONSTRAINT fk_rfs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, CONSTRAINT fk_rfs_roulette FOREIGN KEY (roulette_id) REFERENCES roulettes(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        echo '<p style="color:green">✅ Tabla <b>roulette_free_spin_state</b> creada.</p>';
    }
    echo '<p style="color:green">✅ Soporte para giros gratis con cooldown añadido.</p>';
    echo '<p style="color:orange">⚠️ Recuerda eliminar este archivo migrate.php del servidor.</p>';
} catch (Exception $e) {
    echo '<p style="color:red">❌ Error: ' . htmlspecialchars($e->getMessage()) . '</p>';
}
?>
