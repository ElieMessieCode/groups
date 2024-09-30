-- Migration 0001_init.sql: Schéma initial de la base de données groups
-- Moteur InnoDB, Encodage utf8mb4_unicode_ci

CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(191) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT uq_users_email UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sessions_user_id (user_id),
    INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_classes_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_classes_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    class_id BIGINT NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    tag VARCHAR(40) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT uq_class_student UNIQUE (class_id, full_name),
    INDEX idx_students_class (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS constraints (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    class_id BIGINT NOT NULL,
    student_a BIGINT NOT NULL,
    student_b BIGINT NOT NULL,
    kind ENUM('apart', 'together') NOT NULL,
    CONSTRAINT fk_constraints_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT fk_constraints_student_a FOREIGN KEY (student_a) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_constraints_student_b FOREIGN KEY (student_b) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT chk_student_order CHECK (student_a < student_b),
    CONSTRAINT uq_class_pair UNIQUE (class_id, student_a, student_b),
    INDEX idx_constraints_class (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS draws (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    class_id BIGINT NOT NULL,
    seed INT UNSIGNED NOT NULL,
    mode ENUM('group_count', 'group_size') NOT NULL,
    param TINYINT UNSIGNED NOT NULL,
    options JSON NOT NULL,
    roster_snapshot JSON NOT NULL,
    score INT NOT NULL,
    candidate_index INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_draws_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    INDEX idx_draws_class_created (class_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS draw_groups (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    draw_id BIGINT NOT NULL,
    position TINYINT UNSIGNED NOT NULL,
    name VARCHAR(40) NOT NULL,
    CONSTRAINT fk_draw_groups_draw FOREIGN KEY (draw_id) REFERENCES draws(id) ON DELETE CASCADE,
    INDEX idx_draw_groups_draw (draw_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS draw_members (
    group_id BIGINT NOT NULL,
    student_id BIGINT NOT NULL,
    PRIMARY KEY (group_id, student_id),
    CONSTRAINT fk_draw_members_group FOREIGN KEY (group_id) REFERENCES draw_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_draw_members_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    INDEX idx_draw_members_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
