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

    $stmt = $pdo->query("SHOW COLUMNS FROM roulette_options LIKE 'gives_card_id'");
    if ($stmt->fetch()) {
        echo '<p style="color:green">✅ La columna <b>gives_card_id</b> ya existe. No es necesaria la migración.</p>';
    } else {
        $pdo->exec('ALTER TABLE roulette_options ADD COLUMN gives_card_id INT UNSIGNED DEFAULT NULL');
        echo '<p style="color:green">✅ Columna <b>gives_card_id</b> añadida correctamente a <b>roulette_options</b>.</p>';
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
    $stmt = $pdo->query("SHOW COLUMNS FROM roulettes LIKE 'allow_ticket_spin'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE roulettes ADD COLUMN allow_ticket_spin TINYINT(1) NOT NULL DEFAULT 1");
        echo '<p style="color:green">✅ Columna <b>allow_ticket_spin</b> añadida a <b>roulettes</b>.</p>';
    }

    // Tarot cards / card inventory
    $stmt = $pdo->query("SHOW TABLES LIKE 'tarot_cards'");
    if (!$stmt->fetch()) {
        $pdo->exec("CREATE TABLE tarot_cards (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(120) NOT NULL,
            description TEXT,
            image_url VARCHAR(512),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        echo '<p style="color:green">✅ Tabla <b>tarot_cards</b> creada.</p>';
    }

    $stmt = $pdo->query("SHOW TABLES LIKE 'user_cards'");
    if (!$stmt->fetch()) {
        $pdo->exec("CREATE TABLE user_cards (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id INT UNSIGNED NOT NULL,
            card_id INT UNSIGNED NOT NULL,
            qty INT UNSIGNED NOT NULL DEFAULT 0,
            expires_at DATETIME DEFAULT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_user_card (user_id, card_id),
            KEY idx_uc_user (user_id),
            CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_uc_card FOREIGN KEY (card_id) REFERENCES tarot_cards(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        echo '<p style="color:green">✅ Tabla <b>user_cards</b> creada.</p>';
    }

    $stmt = $pdo->query("SHOW TABLES LIKE 'tarot_card_usage'");
    if (!$stmt->fetch()) {
        $pdo->exec("CREATE TABLE tarot_card_usage (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id INT UNSIGNED NOT NULL,
            card_id INT UNSIGNED NOT NULL,
            question TEXT NOT NULL,
            used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_tcu_user (user_id),
            CONSTRAINT fk_tcu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_tcu_card FOREIGN KEY (card_id) REFERENCES tarot_cards(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        echo '<p style="color:green">✅ Tabla <b>tarot_card_usage</b> creada.</p>';
    }

    $stmt = $pdo->query("SHOW TABLES LIKE 'card_audit_log'");
    if (!$stmt->fetch()) {
        $pdo->exec("CREATE TABLE card_audit_log (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            action ENUM('award','use','revoke','admin_change') NOT NULL,
            user_id INT UNSIGNED NOT NULL,
            card_id INT UNSIGNED NOT NULL,
            actor_id INT UNSIGNED DEFAULT NULL,
            details TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_cal_user (user_id),
            KEY idx_cal_card (card_id),
            KEY idx_cal_actor (actor_id),
            CONSTRAINT fk_cal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_cal_card FOREIGN KEY (card_id) REFERENCES tarot_cards(id) ON DELETE CASCADE,
            CONSTRAINT fk_cal_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        echo '<p style="color:green">✅ Tabla <b>card_audit_log</b> creada.</p>';
    }

    $stmt = $pdo->query('SELECT COUNT(*) AS cnt FROM tarot_cards');
    $row = $stmt->fetch();
    if (!$row || (int)$row['cnt'] === 0) {
        $pdo->exec("INSERT INTO tarot_cards (name, description, image_url) VALUES
            ('El Loco', 'Un viaje nuevo y lleno de posibilidades.', ''),
            ('El Mago', 'Poder personal, recursos y acción enfocada.', ''),
            ('La Sacerdotisa', 'Intuición, secretos y sabiduría interior.', ''),
            ('La Emperatriz', 'Abundancia, creatividad y crecimiento.', ''),
            ('El Emperador', 'Orden, liderazgo y autoridad.', ''),
            ('El Hierofante', 'Tradición, guía espiritual y aprendizaje.', ''),
            ('Los Enamorados', 'Decisiones, conexión y armonía.', ''),
            ('El Carro', 'Voluntad, dirección y triunfo.', ''),
            ('La Fuerza', 'Coraje, paciencia y autocontrol.', ''),
            ('El Ermitaño', 'Reflexión, búsqueda interna y sabiduría.', ''),
            ('La Rueda de la Fortuna', 'Cambio, destino y ciclos.', ''),
            ('La Justicia', 'Equilibrio, verdad y consecuencias.', ''),
            ('El Colgado', 'Perspectiva, sacrificio y pausa necesaria.', ''),
            ('La Muerte', 'Transformación, finales y renacimiento.', ''),
            ('La Templanza', 'Moderación, alineación y sanación.', ''),
            ('El Diablo', 'Ataduras, tentaciones y sombras interiores.', ''),
            ('La Torre', 'Ruptura, revelación y cambio repentino.', ''),
            ('La Estrella', 'Esperanza, inspiración y claridad espiritual.', ''),
            ('La Luna', 'Sueños, intuición y misterio profundo.', ''),
            ('El Sol', 'Éxito, alegría y vitalidad.', ''),
            ('El Juicio', 'Renacimiento, decisión y responsabilidad.', ''),
            ('El Mundo', 'Cumplimiento, logro y conclusión total.','')");
        echo '<p style="color:green">✅ Cartas de tarot iniciales insertadas.</p>';
    }
    $pdo->exec('INSERT INTO app_settings (k, v) VALUES ("craft_cost", "9") ON DUPLICATE KEY UPDATE v=VALUES(v)');

    echo '<p style="color:green">✅ Soporte para giros gratis con cooldown añadido.</p>';
    echo '<p style="color:green">✅ Soporte para inventario de cartas añadido.</p>';
    echo '<p style="color:orange">⚠️ Recuerda eliminar este archivo migrate.php del servidor.</p>';
} catch (Exception $e) {
    echo '<p style="color:red">❌ Error: ' . htmlspecialchars($e->getMessage()) . '</p>';
}
?>
