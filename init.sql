-- =============================================
-- 茉莉陪玩官网 — 数据库初始化脚本
-- =============================================

-- 创建数据库（字符集 utf8mb4）
CREATE DATABASE IF NOT EXISTS peiwang_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE peiwang_db;

-- -----------------------------------------
-- 表1：申请表（applications）
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS applications (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT  COMMENT '自增主键',
  name         VARCHAR(50)     NOT NULL                 COMMENT '申请人姓名',
  phone        VARCHAR(20)     NOT NULL                 COMMENT '联系方式',
  gender       VARCHAR(10)     NOT NULL DEFAULT ''      COMMENT '性别',
  city         VARCHAR(100)    NOT NULL DEFAULT ''      COMMENT '常居地址',
  service_type VARCHAR(30)     NOT NULL DEFAULT '游戏陪玩' COMMENT '服务类别',
  game_type    VARCHAR(50)     NOT NULL DEFAULT ''      COMMENT '擅长游戏',
  `rank`     VARCHAR(50)     NOT NULL                 COMMENT '段位',
  intro      TEXT                                    COMMENT '自我介绍',
  status     TINYINT         NOT NULL DEFAULT 0       COMMENT '审核状态：0=待审核, 1=已通过, 2=已拒绝',
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------
-- 表2：陪玩信息表（players）
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT  COMMENT '自增主键',
  name         VARCHAR(50)     NOT NULL                 COMMENT '陪玩人员姓名',
  gender       VARCHAR(10)     NOT NULL DEFAULT ''      COMMENT '性别',
  city         VARCHAR(100)    NOT NULL DEFAULT ''      COMMENT '常居地址',
  service_type VARCHAR(30)     NOT NULL DEFAULT '游戏陪玩' COMMENT '服务类别',
  game_type    VARCHAR(50)     NOT NULL DEFAULT ''      COMMENT '擅长游戏',
  `rank`     VARCHAR(50)     NOT NULL                 COMMENT '段位',
  intro      TEXT                                    COMMENT '自我介绍',
  hired_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入职时间',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
