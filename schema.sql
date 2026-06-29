-- ============================================================
--  MUDAE WHEEL OF FATE — Schema MySQL COMPLETO v3
--  Base de datos: 4694716_4694716
--  Host: fdb1031.125mb.com  Puerto: 3306
-- ============================================================
SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;

-- ── Usuarios ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `username`   VARCHAR(50)     NOT NULL UNIQUE,
  `password`   VARCHAR(255)    NOT NULL,
  `role`       ENUM('admin','user') NOT NULL DEFAULT 'user',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin inicial: marcosplpp / P@ssw0rd  (password en SHA-256 simple)
-- NOTA: en producción usar bcrypt. Para 125mb usamos SHA2 de MySQL.
INSERT IGNORE INTO `users` (`username`, `password`, `role`) VALUES
  ('marcosplpp', SHA2('P@ssw0rd', 256), 'admin');

-- ── Configuración global ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `app_settings` (
  `k`    VARCHAR(80) NOT NULL,
  `v`    TEXT,
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `app_settings` (`k`,`v`) VALUES
  ('shuffle','0'),
  ('loop','1'),
  ('volume','50'),
  ('info_page','<h2>Bienvenido</h2><p>Esta es la sección de información. El admin puede editar este contenido.</p>');

-- ── Rarezas (catálogo) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `rarities` (
  `id`    TINYINT UNSIGNED NOT NULL,
  `name`  VARCHAR(30)      NOT NULL,
  `color` VARCHAR(12)      NOT NULL,
  `order` TINYINT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `rarities` (`id`,`name`,`color`,`order`) VALUES
  (1,'Común',     '#9a9a9a', 1),
  (2,'Inusual',   '#4caf50', 2),
  (3,'Raro',      '#2196f3', 3),
  (4,'Épico',     '#9c27b0', 4),
  (5,'Legendario','#ffc107', 5),
  (6,'Mítico',    '#e53935', 6);

-- ── Tickets de usuario ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user_tickets` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED    NOT NULL,
  `rarity_id`  TINYINT UNSIGNED NOT NULL,
  `qty`        INT             NOT NULL DEFAULT 0,
  `updated_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_rarity` (`user_id`,`rarity_id`),
  KEY `idx_ut_user` (`user_id`),
  CONSTRAINT `fk_ut_user`   FOREIGN KEY (`user_id`)   REFERENCES `users`(`id`)    ON DELETE CASCADE,
  CONSTRAINT `fk_ut_rarity` FOREIGN KEY (`rarity_id`) REFERENCES `rarities`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Ruletas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `roulettes` (
  `id`          VARCHAR(20)  NOT NULL,
  `name`        VARCHAR(120) NOT NULL,
  `description` TEXT,
  `image_url`   VARCHAR(512),
  `type`        ENUM('normal','fortune') NOT NULL DEFAULT 'normal',
  `rarity_id`   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `adapt_size`  TINYINT(1)   NOT NULL DEFAULT 0,
  `sort_order`  SMALLINT     NOT NULL DEFAULT 0,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_r_rarity` FOREIGN KEY (`rarity_id`) REFERENCES `rarities`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Opciones de ruleta ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `roulette_options` (
  `id`                VARCHAR(20)    NOT NULL,
  `roulette_id`       VARCHAR(20)    NOT NULL,
  `name`              VARCHAR(120),
  `description`       TEXT,
  `image_url`         VARCHAR(512),
  `probability`       DECIMAL(8,4)   NOT NULL DEFAULT 0,
  `child_roulette_id` VARCHAR(20)    DEFAULT NULL,
  `sort_order`        SMALLINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_ro_roulette` (`roulette_id`),
  CONSTRAINT `fk_ro_roulette` FOREIGN KEY (`roulette_id`) REFERENCES `roulettes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ro_child`    FOREIGN KEY (`child_roulette_id`) REFERENCES `roulettes`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Playlist ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `playlist_tracks` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`       VARCHAR(200),
  `youtube_url` VARCHAR(512) NOT NULL,
  `sort_order`  SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Log de giros ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `spin_log` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        INT UNSIGNED    DEFAULT NULL,
  `roulette_id`    VARCHAR(20)     NOT NULL,
  `option_id`      VARCHAR(20)     DEFAULT NULL,
  `fortune_result` SMALLINT        DEFAULT NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sl_user` (`user_id`),
  KEY `idx_sl_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Datos de ejemplo ─────────────────────────────────────────
INSERT IGNORE INTO `roulettes` (`id`,`name`,`description`,`type`,`rarity_id`,`sort_order`) VALUES
  ('r1','Buff o Carta',       'Elige tu destino: buff o carta', 'normal',  5, 0),
  ('r2','Selección de Buff',  'Descubre qué buff recibirás',    'normal',  4, 1),
  ('r3','Selección de Carta', '¿Qué carta revelará el destino?','normal',  3, 2),
  ('r4','Ruleta de la Fortuna','Número aleatorio de PJ',        'fortune', 6, 3);

INSERT IGNORE INTO `roulette_options`
  (`id`,`roulette_id`,`name`,`description`,`probability`,`child_roulette_id`,`sort_order`) VALUES
  ('o1','r1','Buff Especial',    'Recibes un buff poderoso', 50,'r2',0),
  ('o2','r1','Carta del Destino','El mazo revela tu carta',  50,'r3',1),
  ('o3','r2','Buff de Ataque',   '+50% ATK durante 1h',     40,NULL,0),
  ('o4','r2','Buff de Defensa',  '+50% DEF durante 1h',     35,NULL,1),
  ('o5','r2','Buff Legendario',  'Stats dobladas',           25,NULL,2),
  ('o6','r3','Carta Común',      'Una carta del montón',     60,NULL,0),
  ('o7','r3','Carta Épica',      'Una carta de gran poder',  30,'r4',1),
  ('o8','r3','Carta Mítica',     'Única en su clase',        10,NULL,2);

SET foreign_key_checks = 1;

-- ── Vista cómoda de tickets por usuario ──────────────────────
CREATE OR REPLACE VIEW `v_user_tickets` AS
SELECT
  u.id   AS user_id,
  u.username,
  r.id   AS rarity_id,
  r.name AS rarity_name,
  r.color,
  COALESCE(t.qty, 0) AS qty
FROM users u
CROSS JOIN rarities r
LEFT JOIN user_tickets t ON t.user_id=u.id AND t.rarity_id=r.id;
