<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, x-token');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$env = file_exists(__DIR__ . '/../.env') ? parse_ini_file(__DIR__ . '/../.env') : [];
$host = $env['DB_HOST'] ?? getenv('DB_HOST') ?? 'fdb1031.125mb.com';
$port = $env['DB_PORT'] ?? getenv('DB_PORT') ?? '3306';
$user = $env['DB_USER'] ?? getenv('DB_USER') ?? '4694716_4694716';
$pass = $env['DB_PASSWORD'] ?? getenv('DB_PASSWORD') ?? 'P@ssw0rd';
$name = $env['DB_NAME'] ?? getenv('DB_NAME') ?? '4694716_4694716';

$pdo = new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/api/?#', '', $path);
$path = trim($path, '/');
$segments = array_values(array_filter(explode('/', $path), 'strlen'));
$first = $segments[0] ?? '';

function jsonOut($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function sha256Hex($s) { return hash('sha256', $s); }
function authUser($pdo) {
    $token = $_SERVER['HTTP_X_TOKEN'] ?? '';
    if (!$token) return null;
    $stmt = $pdo->prepare('SELECT id, username, role FROM users WHERE SHA2(CONCAT(id, username, "mudae_secret"), 256)=? LIMIT 1');
    $stmt->execute([$token]);
    return $stmt->fetch() ?: null;
}
function requireAuth($pdo) {
    $user = authUser($pdo);
    if (!$user) jsonOut(['error' => 'Sin sesión'], 401);
    return $user;
}
function requireAdmin($pdo) {
    $user = requireAuth($pdo);
    if (($user['role'] ?? '') !== 'admin') jsonOut(['error' => 'Solo admins'], 403);
    return $user;
}
function readJson() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function getSetting($pdo, $key, $default = null) {
    $stmt = $pdo->prepare('SELECT v FROM app_settings WHERE k=? LIMIT 1');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    return $row ? $row['v'] : $default;
}

function getCraftCost($pdo, $fromRarityId) {
    $key = "craft_cost_{$fromRarityId}";
    $value = getSetting($pdo, $key, null);
    if ($value !== null && $value !== '') {
        return max(1, (int)$value);
    }
    return max(1, (int)getSetting($pdo, 'craft_cost', 9));
}

function isCraftEnabled($pdo, $fromRarityId) {
    $key = "craft_enabled_{$fromRarityId}";
    $value = strtolower((string)getSetting($pdo, $key, '1'));
    return in_array($value, ['1', 'true', 'yes'], true);
}

// Detecta si la columna gives_ticket_rarity_id existe (con caché en static)
function hasGivesTicketCol($pdo) {
    static $checked = null;
    if ($checked === null) {
        $stmt = $pdo->query("SHOW COLUMNS FROM roulette_options LIKE 'gives_ticket_rarity_id'");
        $checked = (bool)$stmt->fetch();
    }
    return $checked;
}
function hasGivesCardCol($pdo) {
    static $checked = null;
    if ($checked === null) {
        $stmt = $pdo->query("SHOW COLUMNS FROM roulette_options LIKE 'gives_card_id'");
        $checked = (bool)$stmt->fetch();
    }
    return $checked;
}

try {
    switch ($first) {
        case 'register':
            if ($method !== 'POST') jsonOut(['error' => 'Método no permitido'], 405);
            $data = readJson();
            $username = trim($data['username'] ?? '');
            $password = (string)($data['password'] ?? '');
            if (!$username || !$password) jsonOut(['error' => 'Datos incompletos'], 400);
            if (strlen($username) < 3) jsonOut(['error' => 'Usuario demasiado corto (mín 3)'], 400);
            if (strlen($password) < 4) jsonOut(['error' => 'Contraseña demasiado corta (mín 4)'], 400);
            $stmt = $pdo->prepare('SELECT id FROM users WHERE username=? LIMIT 1');
            $stmt->execute([$username]);
            if ($stmt->fetch()) jsonOut(['error' => 'Nombre de usuario ya existe'], 409);
            $stmt = $pdo->prepare('INSERT INTO users (username, password, role) VALUES (?, ?, "user")');
            $stmt->execute([$username, sha256Hex($password)]);
            $user = ['id' => (int)$pdo->lastInsertId(), 'username' => $username, 'role' => 'user'];
            jsonOut(['ok' => true, 'token' => sha256Hex($user['id'] . $user['username'] . 'mudae_secret'), 'user' => $user]);
            break;

        case 'login':
            if ($method !== 'POST') jsonOut(['error' => 'Método no permitido'], 405);
            $data = readJson();
            $stmt = $pdo->prepare('SELECT id, username, role FROM users WHERE username=? AND password=? LIMIT 1');
            $stmt->execute([trim($data['username'] ?? ''), sha256Hex((string)($data['password'] ?? ''))]);
            $user = $stmt->fetch();
            if (!$user) jsonOut(['error' => 'Credenciales incorrectas'], 401);
            jsonOut(['ok' => true, 'token' => sha256Hex($user['id'] . $user['username'] . 'mudae_secret'), 'user' => ['id' => (int)$user['id'], 'username' => $user['username'], 'role' => $user['role']]]);
            break;

        case 'me':
            if ($method === 'GET') {
                $user = requireAuth($pdo);
                jsonOut(['user' => $user]);
            } elseif ($method === 'PUT' && ($segments[1] ?? '') === 'password') {
                $user = requireAuth($pdo);
                $data = readJson();
                $old = (string)($data['oldPassword'] ?? '');
                $new = (string)($data['newPassword'] ?? '');
                if (strlen($new) < 4) jsonOut(['error' => 'Contraseña demasiado corta'], 400);
                $stmt = $pdo->prepare('SELECT id FROM users WHERE id=? AND password=? LIMIT 1');
                $stmt->execute([$user['id'], sha256Hex($old)]);
                if (!$stmt->fetch()) jsonOut(['error' => 'Contraseña actual incorrecta'], 401);
                $pdo->prepare('UPDATE users SET password=? WHERE id=?')->execute([sha256Hex($new), $user['id']]);
                jsonOut(['ok' => true]);
            } else {
                jsonOut(['error' => 'Método no permitido'], 405);
            }
            break;

        case 'users':
            if ($method === 'GET' && count($segments) === 1) {
                requireAdmin($pdo);
                $rows = $pdo->query('SELECT id, username, role, created_at FROM users ORDER BY id')->fetchAll();
                jsonOut($rows);
            } elseif ($method === 'GET' && count($segments) === 3 && $segments[2] === 'stats') {
                if ($segments[1] === 'me') {
                    $current = requireAuth($pdo);
                    $targetId = $current['id'];
                } else {
                    requireAdmin($pdo);
                    $targetId = (int)$segments[1];
                }
                $stmt = $pdo->prepare('SELECT sl.created_at, r.id AS roulette_id, r.name AS roulette_name, o.name AS option_name, o.description AS option_desc, sl.fortune_result FROM spin_log sl LEFT JOIN roulettes r ON r.id=sl.roulette_id LEFT JOIN roulette_options o ON o.id=sl.option_id WHERE sl.user_id=? ORDER BY sl.created_at DESC LIMIT 10');
                $stmt->execute([$targetId]);
                $spinHistory = $stmt->fetchAll();

                $stmt = $pdo->prepare('SELECT uc.card_id, c.name, c.description, c.image_url, uc.qty, uc.expires_at FROM user_cards uc JOIN tarot_cards c ON c.id=uc.card_id WHERE uc.user_id=?');
                $stmt->execute([$targetId]);
                $cardInventory = $stmt->fetchAll();
                foreach ($cardInventory as &$card) { $card['expired'] = $card['expires_at'] && strtotime($card['expires_at']) < time(); }

                $stmt = $pdo->prepare('SELECT cu.used_at, c.id AS card_id, c.name AS card_name, cu.question FROM tarot_card_usage cu JOIN tarot_cards c ON c.id=cu.card_id WHERE cu.user_id=? ORDER BY cu.used_at DESC LIMIT 10');
                $stmt->execute([$targetId]);
                $cardUsage = $stmt->fetchAll();

                $cardDefs = $pdo->query('SELECT id, name, description, image_url FROM tarot_cards ORDER BY id')->fetchAll();
                jsonOut(['spin_history' => $spinHistory, 'card_inventory' => $cardInventory, 'card_usage' => $cardUsage, 'card_definitions' => $cardDefs]);
            } elseif ($method === 'PUT' && count($segments) === 3 && ($segments[2] ?? '') === 'role') {
                requireAdmin($pdo);
                $data = readJson();
                $id = (int)($segments[1] ?? 0);
                $role = $data['role'] ?? '';
                if (!in_array($role, ['admin', 'user'], true)) jsonOut(['error' => 'Rol inválido'], 400);
                $pdo->prepare('UPDATE users SET role=? WHERE id=?')->execute([$role, $id]);
                jsonOut(['ok' => true]);
            } elseif ($method === 'DELETE' && count($segments) === 2) {
                $current = requireAdmin($pdo);
                $id = (int)($segments[1] ?? 0);
                if ($id === (int)$current['id']) jsonOut(['error' => 'No puedes eliminarte a ti mismo'], 400);
                $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$id]);
                jsonOut(['ok' => true]);
            } else {
                jsonOut(['error' => 'Método no permitido'], 405);
            }
            break;

        case 'tickets':
            $user = requireAuth($pdo);
            if ($method === 'GET' && count($segments) === 1) {
                $rows = $pdo->prepare('SELECT r.id AS rarity_id, r.name, r.color, r.`order`, COALESCE(t.qty,0) AS qty FROM rarities r LEFT JOIN user_tickets t ON t.user_id=? AND t.rarity_id=r.id ORDER BY r.`order`');
                $rows->execute([$user['id']]);
                jsonOut($rows->fetchAll());
            } elseif ($method === 'GET' && count($segments) === 2 && is_numeric($segments[1])) {
                requireAdmin($pdo);
                $rows = $pdo->prepare('SELECT r.id AS rarity_id, r.name, r.color, r.`order`, COALESCE(t.qty,0) AS qty FROM rarities r LEFT JOIN user_tickets t ON t.user_id=? AND t.rarity_id=r.id ORDER BY r.`order`');
                $rows->execute([(int)$segments[1]]);
                jsonOut($rows->fetchAll());
            } elseif ($method === 'PUT' && count($segments) === 2 && is_numeric($segments[1])) {
                requireAdmin($pdo);
                $data = readJson();
                $uid = (int)$segments[1];
                $rarityId = (int)($data['rarity_id'] ?? 0);
                $delta = (int)($data['delta'] ?? 0);
                $pdo->prepare('INSERT INTO user_tickets (user_id, rarity_id, qty) VALUES (?, ?, GREATEST(0, ?)) ON DUPLICATE KEY UPDATE qty = GREATEST(0, qty + ?)')->execute([$uid, $rarityId, max(0, $delta), $delta]);
                $stmt = $pdo->prepare('SELECT qty FROM user_tickets WHERE user_id=? AND rarity_id=?');
                $stmt->execute([$uid, $rarityId]);
                $row = $stmt->fetch();
                jsonOut(['ok' => true, 'qty' => (int)($row['qty'] ?? 0)]);
            } elseif ($method === 'POST' && count($segments) === 2 && $segments[1] === 'craft') {
                $data = readJson();
                $fromId = (int)($data['from_rarity_id'] ?? 0);
                if ($fromId < 1 || $fromId > 5) jsonOut(['error' => 'No se puede craftear desde esa rareza'], 400);
                if (!isCraftEnabled($pdo, $fromId)) jsonOut(['error' => 'El crafteo desde esa rareza está deshabilitado'], 400);
                $toId = $fromId + 1;
                $craftCost = getCraftCost($pdo, $fromId);
                $pdo->beginTransaction();
                try {
                    $stmt = $pdo->prepare('SELECT qty FROM user_tickets WHERE user_id=? AND rarity_id=? FOR UPDATE');
                    $stmt->execute([$user['id'], $fromId]);
                    $row = $stmt->fetch();
                    $qty = (int)($row['qty'] ?? 0);
                    if ($qty < $craftCost) { $pdo->rollBack(); jsonOut(['error' => "Necesitas $craftCost tickets. Tienes $qty."], 400); }
                    $pdo->prepare('UPDATE user_tickets SET qty=qty-? WHERE user_id=? AND rarity_id=?')->execute([$craftCost, $user['id'], $fromId]);
                    $pdo->prepare('INSERT INTO user_tickets (user_id, rarity_id, qty) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE qty=qty+1')->execute([$user['id'], $toId]);
                    $pdo->commit();
                    jsonOut(['ok' => true]);
                } catch (Throwable $e) { $pdo->rollBack(); jsonOut(['error' => $e->getMessage()], 500); }
            } elseif ($method === 'POST' && count($segments) === 2 && $segments[1] === 'spend') {
                $data = readJson();
                $rarityId = (int)($data['rarity_id'] ?? 0);
                $pdo->beginTransaction();
                try {
                    $stmt = $pdo->prepare('SELECT qty FROM user_tickets WHERE user_id=? AND rarity_id=? FOR UPDATE');
                    $stmt->execute([$user['id'], $rarityId]);
                    $row = $stmt->fetch();
                    if (!$row || (int)$row['qty'] < 1) { $pdo->rollBack(); jsonOut(['error' => 'No tienes tickets de esa rareza'], 400); }
                    $pdo->prepare('UPDATE user_tickets SET qty=qty-1 WHERE user_id=? AND rarity_id=?')->execute([$user['id'], $rarityId]);
                    $pdo->commit();
                    jsonOut(['ok' => true]);
                } catch (Throwable $e) { $pdo->rollBack(); jsonOut(['error' => $e->getMessage()], 500); }
            } elseif ($method === 'POST' && count($segments) === 2 && $segments[1] === 'award') {
                $data = readJson();
                $rarityId = (int)($data['rarity_id'] ?? 0);
                if ($rarityId < 1 || $rarityId > 6) jsonOut(['error' => 'Rareza inválida'], 400);
                $pdo->prepare('INSERT INTO user_tickets (user_id, rarity_id, qty) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE qty=qty+1')->execute([$user['id'], $rarityId]);
                $stmt = $pdo->prepare('SELECT qty FROM user_tickets WHERE user_id=? AND rarity_id=?');
                $stmt->execute([$user['id'], $rarityId]);
                $row = $stmt->fetch();
                jsonOut(['ok' => true, 'qty' => (int)($row['qty'] ?? 1)]);
            } else {
                jsonOut(['error' => 'Método no permitido. Método: ' . $method . ', Ruta: ' . $path . ', Segmentos: ' . json_encode($segments)], 405);
            }
            break;

        case 'cards':
            $user = requireAuth($pdo);
            if ($method === 'GET' && count($segments) === 1) {
                $stmt = $pdo->prepare('SELECT uc.card_id, c.name, c.description, c.image_url, uc.qty, uc.expires_at FROM user_cards uc JOIN tarot_cards c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.qty > 0');
                $stmt->execute([$user['id']]);
                $rows = $stmt->fetchAll();
                foreach ($rows as &$row) { $row['expired'] = $row['expires_at'] && strtotime($row['expires_at']) < time(); }
                jsonOut($rows);
            } elseif ($method === 'GET' && count($segments) === 2 && $segments[1] === 'defs') {
                $rows = $pdo->query('SELECT id, name, description, image_url FROM tarot_cards ORDER BY id')->fetchAll();
                jsonOut($rows);
            } elseif ($method === 'GET' && count($segments) === 2 && $segments[1] === 'logs') {
                requireAdmin($pdo);
                $stmt = $pdo->query('SELECT a.id, a.action, a.details, a.created_at, c.id AS card_id, c.name AS card_name, u.id AS user_id, u.username AS target_username, actor.username AS actor_username FROM card_audit_log a JOIN tarot_cards c ON c.id=a.card_id JOIN users u ON u.id=a.user_id LEFT JOIN users actor ON actor.id=a.actor_id ORDER BY a.created_at DESC LIMIT 50');
                jsonOut($stmt->fetchAll());
            } elseif ($method === 'POST' && count($segments) === 1) {
                requireAdmin($pdo);
                $data = readJson();
                $name = trim($data['name'] ?? '');
                if (!$name) jsonOut(['error' => 'Nombre de carta requerido'], 400);
                $stmt = $pdo->prepare('INSERT INTO tarot_cards (name, description, image_url) VALUES (?, ?, ?)');
                $stmt->execute([$name, trim($data['description'] ?? ''), trim($data['image_url'] ?? '')]);
                jsonOut(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
            } elseif ($method === 'PUT' && count($segments) === 2 && is_numeric($segments[1])) {
                requireAdmin($pdo);
                $cardId = (int)$segments[1];
                $data = readJson();
                $name = trim($data['name'] ?? '');
                if (!$name) jsonOut(['error' => 'Nombre de carta requerido'], 400);
                $pdo->prepare('UPDATE tarot_cards SET name=?, description=?, image_url=? WHERE id=?')->execute([$name, trim($data['description'] ?? ''), trim($data['image_url'] ?? ''), $cardId]);
                jsonOut(['ok' => true]);
            } elseif ($method === 'DELETE' && count($segments) === 2 && is_numeric($segments[1])) {
                requireAdmin($pdo);
                $cardId = (int)$segments[1];
                $pdo->prepare('DELETE FROM tarot_cards WHERE id=?')->execute([$cardId]);
                jsonOut(['ok' => true]);
            } elseif ($method === 'GET' && count($segments) === 2 && is_numeric($segments[1])) {
                requireAdmin($pdo);
                $targetId = (int)$segments[1];
                $stmt = $pdo->prepare('SELECT uc.card_id, c.name, c.description, c.image_url, uc.qty, uc.expires_at FROM user_cards uc JOIN tarot_cards c ON c.id=uc.card_id WHERE uc.user_id=?');
                $stmt->execute([$targetId]);
                $rows = $stmt->fetchAll();
                foreach ($rows as &$row) { $row['expired'] = $row['expires_at'] && strtotime($row['expires_at']) < time(); }
                jsonOut($rows);
            } elseif ($method === 'POST' && count($segments) === 2 && $segments[1] === 'use') {
                $data = readJson();
                $cardId = (int)($data['card_id'] ?? 0);
                $question = trim($data['question'] ?? '');
                if (!$cardId || !$question) jsonOut(['error' => 'Carta y pregunta son requeridas'], 400);
                $stmt = $pdo->prepare('SELECT qty, expires_at FROM user_cards WHERE user_id=? AND card_id=? LIMIT 1');
                $stmt->execute([$user['id'], $cardId]);
                $row = $stmt->fetch();
                if (!$row || (int)$row['qty'] < 1) jsonOut(['error' => 'No tienes esa carta'], 400);
                if ($row['expires_at'] && strtotime($row['expires_at']) < time()) jsonOut(['error' => 'La carta ha expirado'], 400);
                $pdo->beginTransaction();
                try {
                    $pdo->prepare('UPDATE user_cards SET qty=0 WHERE user_id=? AND card_id=?')->execute([$user['id'], $cardId]);
                    $pdo->prepare('INSERT INTO tarot_card_usage (user_id, card_id, question) VALUES (?, ?, ?)')->execute([$user['id'], $cardId, $question]);
                    $pdo->prepare('INSERT INTO card_audit_log (`action`,`user_id`,`card_id`,`actor_id`,`details`) VALUES ("use", ?, ?, ?, ?)')->execute([$user['id'], $cardId, $user['id'], $question]);
                    $pdo->commit();
                    jsonOut(['ok' => true]);
                } catch (Throwable $e) { $pdo->rollBack(); jsonOut(['error' => $e->getMessage()], 500); }
            } elseif ($method === 'POST' && count($segments) === 2 && $segments[1] === 'award') {
                $user = requireAuth($pdo);
                $data = readJson();
                $cardId = (int)($data['card_id'] ?? 0);
                if (!$cardId) jsonOut(['error' => 'Faltan datos'], 400);
                $targetId = $user['id'];
                $actorId = $user['id'];
                if (($user['role'] ?? '') === 'admin' && !empty($data['user_id'])) {
                    $targetId = (int)$data['user_id'];
                }
                $stmt = $pdo->prepare('SELECT qty, expires_at FROM user_cards WHERE user_id=? AND card_id=? LIMIT 1');
                $stmt->execute([$targetId, $cardId]);
                $row = $stmt->fetch();
                $expires = date('Y-m-d H:i:s', strtotime('+7 days'));
                if ($row) {
                    if ((int)$row['qty'] > 0 && (!$row['expires_at'] || strtotime($row['expires_at']) > time())) {
                        jsonOut(['error' => 'El usuario ya tiene esa carta activa'], 400);
                    }
                    $pdo->prepare('UPDATE user_cards SET qty=1, expires_at=?, updated_at=NOW() WHERE user_id=? AND card_id=?')->execute([$expires, $targetId, $cardId]);
                } else {
                    $pdo->prepare('INSERT INTO user_cards (user_id, card_id, qty, expires_at) VALUES (?, ?, 1, ?)')->execute([$targetId, $cardId, $expires]);
                }
                $pdo->prepare('INSERT INTO card_audit_log (`action`,`user_id`,`card_id`,`actor_id`,`details`) VALUES ("award", ?, ?, ?, ?)')->execute([$targetId, $cardId, $actorId, ($actorId === $targetId ? 'Sistema' : 'Admin entregó carta')]);
                jsonOut(['ok' => true, 'expires_at' => $expires]);
            } else {
                jsonOut(['error' => 'Método no permitido'], 405);
            }
            break;

        case 'roulettes':
            if ($method === 'GET' && count($segments) === 1) {
                $roulettes = $pdo->query('SELECT r.*, ra.name AS rarity_name, ra.color AS rarity_color FROM roulettes r JOIN rarities ra ON ra.id=r.rarity_id WHERE r.is_active=1 ORDER BY r.sort_order, r.created_at')->fetchAll();
                $options = $pdo->query('SELECT * FROM roulette_options ORDER BY sort_order')->fetchAll();
                $users = $pdo->query('SELECT id, username FROM users ORDER BY id')->fetchAll();
                $result = [];
                foreach ($roulettes as $r) {
                    $opts = [];
                    if ((string)($r['type'] ?? '') === 'users') {
                        foreach ($users as $u) {
                            $opts[] = ['id' => 'user-' . $u['id'], 'name' => $u['username'], 'desc' => 'Usuario #' . $u['id'], 'img' => '', 'prob' => 1.0, 'childRouletteId' => '', 'givesTicketRarityId' => null];
                        }
                    } else {
                        foreach ($options as $o) {
                            if ((string)$o['roulette_id'] === (string)$r['id']) {
                                $giveTicket = hasGivesTicketCol($pdo) && isset($o['gives_ticket_rarity_id']) ? ((int)$o['gives_ticket_rarity_id'] ?: null) : null;
                                $giveCard = hasGivesCardCol($pdo) && isset($o['gives_card_id']) ? ((int)$o['gives_card_id'] ?: null) : null;
                                $opts[] = [
                                    'id' => $o['id'],
                                    'name' => $o['name'] ?: '',
                                    'desc' => $o['description'] ?: '',
                                    'img' => $o['image_url'] ?: '',
                                    'prob' => (float)$o['probability'],
                                    'childRouletteId' => $o['child_roulette_id'] ?: '',
                                    'givesTicketRarityId' => $giveTicket,
                                    'givesCardId' => $giveCard,
                                ];
                            }
                        }
                    }
                    $result[] = ['id' => $r['id'], 'name' => $r['name'], 'desc' => $r['description'] ?: '', 'img' => $r['image_url'] ?: '', 'type' => $r['type'], 'rarity_id' => (int)$r['rarity_id'], 'rarity_name' => $r['rarity_name'], 'rarity_color' => $r['rarity_color'], 'adaptSize' => (bool)$r['adapt_size'], 'spin_mode' => $r['spin_mode'] ?? 'normal', 'free_spin_cooldown_seconds' => (int)($r['free_spin_cooldown_seconds'] ?? 0), 'allow_ticket_spin' => isset($r['allow_ticket_spin']) ? (bool)$r['allow_ticket_spin'] : true, 'options' => $opts];
                }
                jsonOut($result);
            } elseif ($method === 'POST' && count($segments) === 1) {
                requireAdmin($pdo);
                $data = readJson();
                $rid = $data['id'] ?: 'r' . bin2hex(random_bytes(4));
                $pdo->beginTransaction();
                try {
                    $pdo->prepare('INSERT INTO roulettes (id, name, description, image_url, type, rarity_id, adapt_size, spin_mode, free_spin_cooldown_seconds, allow_ticket_spin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([$rid, $data['name'] ?? '', $data['desc'] ?? '', $data['img'] ?? '', $data['type'] ?? 'normal', (int)($data['rarity_id'] ?? 1), !empty($data['adaptSize']) ? 1 : 0, $data['spin_mode'] ?? 'normal', (int)($data['free_spin_cooldown_seconds'] ?? 0), isset($data['allow_ticket_spin']) && $data['allow_ticket_spin'] === false ? 0 : 1]);
                    foreach (($data['options'] ?? []) as $i => $opt) {
                        $oid = $opt['id'] ?: 'o' . bin2hex(random_bytes(4));
                        if (hasGivesTicketCol($pdo) || hasGivesCardCol($pdo)) {
                            $giveRarity = hasGivesTicketCol($pdo) && !empty($opt['givesTicketRarityId']) ? (int)$opt['givesTicketRarityId'] : null;
                            $giveCard = hasGivesCardCol($pdo) && !empty($opt['givesCardId']) ? (int)$opt['givesCardId'] : null;
                            $pdo->prepare('INSERT INTO roulette_options (id, roulette_id, name, description, image_url, probability, child_roulette_id, gives_ticket_rarity_id, gives_card_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([$oid, $rid, $opt['name'] ?? '', $opt['desc'] ?? '', $opt['img'] ?? '', (float)($opt['prob'] ?? 0), $opt['childRouletteId'] ?: null, $giveRarity, $giveCard, $i]);
                        } else {
                            $pdo->prepare('INSERT INTO roulette_options (id, roulette_id, name, description, image_url, probability, child_roulette_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([$oid, $rid, $opt['name'] ?? '', $opt['desc'] ?? '', $opt['img'] ?? '', (float)($opt['prob'] ?? 0), $opt['childRouletteId'] ?: null, $i]);
                        }
                    }
                    $pdo->commit();
                    jsonOut(['ok' => true, 'id' => $rid]);
                } catch (Throwable $e) { $pdo->rollBack(); jsonOut(['error' => $e->getMessage()], 500); }
            } elseif ($method === 'PUT' && count($segments) === 2) {
                requireAdmin($pdo);
                $data = readJson();
                $rid = $segments[1];
                $pdo->beginTransaction();
                try {
                    $pdo->prepare('UPDATE roulettes SET name=?, description=?, image_url=?, type=?, rarity_id=?, adapt_size=?, spin_mode=?, free_spin_cooldown_seconds=?, allow_ticket_spin=? WHERE id=?')->execute([$data['name'] ?? '', $data['desc'] ?? '', $data['img'] ?? '', $data['type'] ?? 'normal', (int)($data['rarity_id'] ?? 1), !empty($data['adaptSize']) ? 1 : 0, $data['spin_mode'] ?? 'normal', (int)($data['free_spin_cooldown_seconds'] ?? 0), isset($data['allow_ticket_spin']) && $data['allow_ticket_spin'] === false ? 0 : 1, $rid]);
                    $pdo->prepare('DELETE FROM roulette_options WHERE roulette_id=?')->execute([$rid]);
                    foreach (($data['options'] ?? []) as $i => $opt) {
                        $oid = $opt['id'] ?: 'o' . bin2hex(random_bytes(4));
                        if (hasGivesTicketCol($pdo) || hasGivesCardCol($pdo)) {
                            $giveRarity = hasGivesTicketCol($pdo) && !empty($opt['givesTicketRarityId']) ? (int)$opt['givesTicketRarityId'] : null;
                            $giveCard = hasGivesCardCol($pdo) && !empty($opt['givesCardId']) ? (int)$opt['givesCardId'] : null;
                            $pdo->prepare('INSERT INTO roulette_options (id, roulette_id, name, description, image_url, probability, child_roulette_id, gives_ticket_rarity_id, gives_card_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([$oid, $rid, $opt['name'] ?? '', $opt['desc'] ?? '', $opt['img'] ?? '', (float)($opt['prob'] ?? 0), $opt['childRouletteId'] ?: null, $giveRarity, $giveCard, $i]);
                        } else {
                            $pdo->prepare('INSERT INTO roulette_options (id, roulette_id, name, description, image_url, probability, child_roulette_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([$oid, $rid, $opt['name'] ?? '', $opt['desc'] ?? '', $opt['img'] ?? '', (float)($opt['prob'] ?? 0), $opt['childRouletteId'] ?: null, $i]);
                        }
                    }
                    $pdo->commit();
                    jsonOut(['ok' => true]);
                } catch (Throwable $e) { $pdo->rollBack(); jsonOut(['error' => $e->getMessage()], 500); }
            } elseif ($method === 'DELETE' && count($segments) === 2) {
                requireAdmin($pdo);
                $rid = $segments[1];
                $pdo->prepare('UPDATE roulette_options SET child_roulette_id=NULL WHERE child_roulette_id=?')->execute([$rid]);
                $pdo->prepare('DELETE FROM roulettes WHERE id=?')->execute([$rid]);
                jsonOut(['ok' => true]);
            } else {
                jsonOut(['error' => 'Método no permitido'], 405);
            }
            break;

        case 'roulette':
            $user = requireAuth($pdo);
            if ($method === 'GET' && count($segments) === 3 && $segments[1] === 'free-spin-status') {
                $rouletteId = $segments[2];
                $stmt = $pdo->prepare('SELECT id, spin_mode, free_spin_cooldown_seconds FROM roulettes WHERE id=? LIMIT 1');
                $stmt->execute([$rouletteId]);
                $roulette = $stmt->fetch();
                if (!$roulette || ($roulette['spin_mode'] ?? 'normal') !== 'free') {
                    jsonOut(['enabled' => false, 'remaining_seconds' => 0]);
                }
                $cooldown = (int)($roulette['free_spin_cooldown_seconds'] ?? 0);
                $stmt = $pdo->prepare('SELECT last_used_at FROM roulette_free_spin_state WHERE user_id=? AND roulette_id=? LIMIT 1');
                $stmt->execute([$user['id'], $rouletteId]);
                $state = $stmt->fetch();
                if (!$state || !$state['last_used_at']) {
                    jsonOut(['enabled' => true, 'remaining_seconds' => 0]);
                }
                $stmt = $pdo->prepare('SELECT TIMESTAMPDIFF(SECOND, ?, NOW()) AS diff');
                $stmt->execute([$state['last_used_at']]);
                $diff = (int)($stmt->fetch()['diff'] ?? 0);
                $remaining = max(0, $cooldown - $diff);
                jsonOut(['enabled' => $remaining <= 0, 'remaining_seconds' => $remaining]);
            } elseif ($method === 'POST' && count($segments) === 2 && $segments[1] === 'free-spin') {
                $data = readJson();
                $rouletteId = $data['roulette_id'] ?? '';
                $stmt = $pdo->prepare('SELECT id, spin_mode, free_spin_cooldown_seconds FROM roulettes WHERE id=? LIMIT 1');
                $stmt->execute([$rouletteId]);
                $roulette = $stmt->fetch();
                if (!$roulette || ($roulette['spin_mode'] ?? 'normal') !== 'free') {
                    jsonOut(['error' => 'Esta ruleta no tiene giro gratis'], 400);
                }
                $cooldown = (int)($roulette['free_spin_cooldown_seconds'] ?? 0);
                $stmt = $pdo->prepare('SELECT last_used_at FROM roulette_free_spin_state WHERE user_id=? AND roulette_id=? LIMIT 1');
                $stmt->execute([$user['id'], $rouletteId]);
                $state = $stmt->fetch();
                if ($state && $state['last_used_at']) {
                    $stmt = $pdo->prepare('SELECT TIMESTAMPDIFF(SECOND, ?, NOW()) AS diff');
                    $stmt->execute([$state['last_used_at']]);
                    $diff = (int)($stmt->fetch()['diff'] ?? 0);
                    if ($diff < $cooldown) {
                        jsonOut(['error' => 'Cooldown activo', 'remaining_seconds' => max(0, $cooldown - $diff)], 400);
                    }
                }
                $pdo->prepare('INSERT INTO roulette_free_spin_state (user_id, roulette_id, last_used_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE last_used_at=NOW()')->execute([$user['id'], $rouletteId]);
                jsonOut(['ok' => true]);
            } else {
                jsonOut(['error' => 'Método no permitido'], 405);
            }
            break;

        case 'playlist':
            if ($method === 'GET' && count($segments) === 1) {
                $rows = $pdo->query('SELECT id, title, youtube_url FROM playlist_tracks ORDER BY sort_order, id')->fetchAll();
                jsonOut($rows);
            } elseif ($method === 'POST' && count($segments) === 1) {
                requireAdmin($pdo);
                $data = readJson();
                $pdo->prepare('INSERT INTO playlist_tracks (title, youtube_url) VALUES (?, ?)')->execute([$data['title'] ?? '', $data['youtube_url'] ?? '']);
                jsonOut(['ok' => true]);
            } elseif ($method === 'DELETE' && count($segments) === 2) {
                requireAdmin($pdo);
                $id = (int)$segments[1];
                $pdo->prepare('DELETE FROM playlist_tracks WHERE id=?')->execute([$id]);
                jsonOut(['ok' => true]);
            } else {
                jsonOut(['error' => 'Método no permitido'], 405);
            }
            break;

        case 'settings':
            if ($method === 'GET') {
                $allowedKeys = ['info_page', 'craft_cost'];
                for ($i = 1; $i <= 5; $i++) {
                    $allowedKeys[] = "craft_cost_{$i}";
                    $allowedKeys[] = "craft_enabled_{$i}";
                }
                $placeholders = implode(',', array_fill(0, count($allowedKeys), '?'));
                $stmt = $pdo->prepare("SELECT k, v FROM app_settings WHERE k IN ($placeholders)");
                $stmt->execute($allowedKeys);
                $rows = $stmt->fetchAll();
                $result = ['info_page' => '', 'craft_cost' => '9'];
                foreach ($rows as $row) {
                    $result[$row['k']] = $row['v'];
                }
                jsonOut($result);
            } elseif ($method === 'PUT') {
                requireAdmin($pdo);
                $data = readJson();
                $allowedKeys = ['info_page'];
                for ($i = 1; $i <= 5; $i++) {
                    $allowedKeys[] = "craft_cost_{$i}";
                    $allowedKeys[] = "craft_enabled_{$i}";
                }
                $allowedKeys[] = 'craft_cost';

                foreach ($data as $key => $value) {
                    if (!in_array($key, $allowedKeys, true)) continue;
                    if (strpos($key, 'craft_cost') === 0) {
                        $value = max(1, (int)$value);
                    }
                    $pdo->prepare('INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v=VALUES(v)')->execute([$key, (string)$value]);
                }
                jsonOut(['ok' => true]);
            } else {
                jsonOut(['error' => 'Método no permitido'], 405);
            }
            break;

        case 'spin-log':
            if ($method !== 'POST') jsonOut(['error' => 'Método no permitido'], 405);
            $user = authUser($pdo);
            $data = readJson();
            $pdo->prepare('INSERT INTO spin_log (user_id, roulette_id, option_id, fortune_result) VALUES (?, ?, ?, ?)')->execute([$user['id'] ?? null, $data['roulette_id'] ?? '', $data['option_id'] ?? null, $data['fortune_result'] ?? null]);
            jsonOut(['ok' => true]);
            break;

        default:
            if ($method === 'GET' && $path === '') {
                header('Location: /');
                exit;
            }
            jsonOut(['error' => 'Ruta no encontrada'], 404);
    }
} catch (Throwable $e) {
    jsonOut(['error' => $e->getMessage()], 500);
}
?>
