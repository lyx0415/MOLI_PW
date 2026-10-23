CREATE TABLE IF NOT EXISTS moli_service_details (
 service_id VARCHAR(36) PRIMARY KEY,
 category VARCHAR(30) NOT NULL,
 city VARCHAR(50) NOT NULL DEFAULT '',
 venue VARCHAR(200) NOT NULL DEFAULT '',
 fee_note VARCHAR(500) NOT NULL DEFAULT '',
 review_status VARCHAR(20) NOT NULL,
 review_reason VARCHAR(500) NOT NULL DEFAULT '',
 requested_active INTEGER NOT NULL DEFAULT 1,
 revision VARCHAR(36) NOT NULL,
 updated_at VARCHAR(30) NOT NULL,
 FOREIGN KEY (service_id) REFERENCES moli_services(id)
);
CREATE INDEX idx_service_details_discovery ON moli_service_details(category,city,review_status);
CREATE TABLE IF NOT EXISTS moli_order_experiences (
 order_id VARCHAR(36) PRIMARY KEY,
 snapshot_json TEXT NOT NULL,
 FOREIGN KEY (order_id) REFERENCES moli_orders(id)
);
