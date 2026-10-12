CREATE TABLE IF NOT EXISTS moli_users (
 id VARCHAR(64) PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, name VARCHAR(50) NOT NULL,
 password_hash VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'customer',
 state VARCHAR(20) NOT NULL DEFAULT 'active', email_verified INT NOT NULL DEFAULT 0,
 terms_version VARCHAR(20) NOT NULL, created_at VARCHAR(30) NOT NULL
);
CREATE TABLE IF NOT EXISTS moli_sessions (
 token_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, csrf VARCHAR(64) NOT NULL,
 expires_at VARCHAR(30) NOT NULL, created_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES moli_users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS moli_challenges (
 id VARCHAR(64) PRIMARY KEY, email VARCHAR(254) NOT NULL, purpose VARCHAR(20) NOT NULL,
 code_hash VARCHAR(255) NOT NULL, attempts INT NOT NULL DEFAULT 0, used INT NOT NULL DEFAULT 0,
 expires_at VARCHAR(30) NOT NULL, created_at VARCHAR(30) NOT NULL
);
CREATE TABLE IF NOT EXISTS moli_applications (
 id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL UNIQUE, data_json TEXT NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending', reason VARCHAR(500) NOT NULL DEFAULT '',
 reviewed_by VARCHAR(64), reviewed_at VARCHAR(30), created_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES moli_users(id)
);
CREATE TABLE IF NOT EXISTS moli_providers (
 id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL UNIQUE, nickname VARCHAR(50) NOT NULL,
 bio TEXT NOT NULL, city VARCHAR(50) NOT NULL DEFAULT '', theme VARCHAR(20) NOT NULL DEFAULT 'sage',
 tags_json TEXT NOT NULL, accepting INT NOT NULL DEFAULT 1, status VARCHAR(20) NOT NULL DEFAULT 'active',
 verified_at VARCHAR(30) NOT NULL, created_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES moli_users(id)
);
CREATE TABLE IF NOT EXISTS moli_services (
 id VARCHAR(64) PRIMARY KEY, provider_id VARCHAR(64) NOT NULL, game VARCHAR(50) NOT NULL,
 title VARCHAR(80) NOT NULL, skill VARCHAR(60) NOT NULL, rate_cents INT NOT NULL CHECK(rate_cents >= 100),
 description TEXT NOT NULL, active INT NOT NULL DEFAULT 1, created_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(provider_id) REFERENCES moli_providers(id)
);
CREATE TABLE IF NOT EXISTS moli_availability (
 id VARCHAR(64) PRIMARY KEY, provider_id VARCHAR(64) NOT NULL, weekday INT NOT NULL,
 start_minute INT NOT NULL, end_minute INT NOT NULL,
 FOREIGN KEY(provider_id) REFERENCES moli_providers(id)
);
CREATE TABLE IF NOT EXISTS moli_orders (
 id VARCHAR(64) PRIMARY KEY, order_no VARCHAR(64) NOT NULL UNIQUE,
 customer_id VARCHAR(64) NOT NULL, provider_id VARCHAR(64) NOT NULL, service_id VARCHAR(64) NOT NULL,
 title VARCHAR(120) NOT NULL, rate_cents INT NOT NULL, duration_minutes INT NOT NULL,
 start_at VARCHAR(30) NOT NULL, end_at VARCHAR(30) NOT NULL,
 contact VARCHAR(120) NOT NULL, note VARCHAR(500) NOT NULL DEFAULT '',
 amount_cents INT NOT NULL CHECK(amount_cents > 0), commission_cents INT NOT NULL, income_cents INT NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'awaiting_payment', payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
 payment_channel VARCHAR(20), payment_mode VARCHAR(20), gateway_trade_no VARCHAR(100) UNIQUE, expires_at VARCHAR(30) NOT NULL,
 refund_status VARCHAR(30) NOT NULL DEFAULT 'none', refund_no VARCHAR(64) UNIQUE, refund_reason VARCHAR(500) NOT NULL DEFAULT '', refund_previous_status VARCHAR(30),
 paid_at VARCHAR(30), completed_at VARCHAR(30), created_at VARCHAR(30) NOT NULL, updated_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(customer_id) REFERENCES moli_users(id), FOREIGN KEY(provider_id) REFERENCES moli_providers(id),
 FOREIGN KEY(service_id) REFERENCES moli_services(id)
);
CREATE TABLE IF NOT EXISTS moli_reviews (
 id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL UNIQUE, customer_id VARCHAR(64) NOT NULL,
 provider_id VARCHAR(64) NOT NULL, rating INT NOT NULL CHECK(rating BETWEEN 1 AND 5),
 content VARCHAR(500) NOT NULL, hidden INT NOT NULL DEFAULT 0, created_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(order_id) REFERENCES moli_orders(id), FOREIGN KEY(customer_id) REFERENCES moli_users(id),
 FOREIGN KEY(provider_id) REFERENCES moli_providers(id)
);
CREATE TABLE IF NOT EXISTS moli_favorites (
 user_id VARCHAR(64) NOT NULL, provider_id VARCHAR(64) NOT NULL, created_at VARCHAR(30) NOT NULL,
 PRIMARY KEY(user_id,provider_id), FOREIGN KEY(user_id) REFERENCES moli_users(id), FOREIGN KEY(provider_id) REFERENCES moli_providers(id)
);
CREATE TABLE IF NOT EXISTS moli_messages (
 id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL,
 content VARCHAR(1000) NOT NULL, created_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(order_id) REFERENCES moli_orders(id), FOREIGN KEY(user_id) REFERENCES moli_users(id)
);
CREATE TABLE IF NOT EXISTS moli_tickets (
 id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, order_id VARCHAR(64),
 subject VARCHAR(120) NOT NULL, content TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'open',
 reply TEXT, created_at VARCHAR(30) NOT NULL, updated_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES moli_users(id), FOREIGN KEY(order_id) REFERENCES moli_orders(id)
);
CREATE TABLE IF NOT EXISTS moli_announcements (
 id VARCHAR(64) PRIMARY KEY, title VARCHAR(120) NOT NULL, content TEXT NOT NULL,
 active INT NOT NULL DEFAULT 1, created_at VARCHAR(30) NOT NULL
);
CREATE TABLE IF NOT EXISTS moli_audit (
 id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), action VARCHAR(80) NOT NULL,
 target_id VARCHAR(64) NOT NULL, detail VARCHAR(1000) NOT NULL DEFAULT '', created_at VARCHAR(30) NOT NULL
);
CREATE TABLE IF NOT EXISTS moli_payouts (
 id VARCHAR(64) PRIMARY KEY, provider_id VARCHAR(64) NOT NULL, amount_cents INT NOT NULL,
 state VARCHAR(20) NOT NULL DEFAULT 'requested', reference VARCHAR(120), created_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(provider_id) REFERENCES moli_providers(id)
);
