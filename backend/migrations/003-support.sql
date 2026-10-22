CREATE TABLE IF NOT EXISTS moli_ticket_messages (
 id VARCHAR(64) PRIMARY KEY, ticket_id VARCHAR(64) NOT NULL, user_id VARCHAR(64),
 author_role VARCHAR(20) NOT NULL, content TEXT NOT NULL, created_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(ticket_id) REFERENCES moli_tickets(id), FOREIGN KEY(user_id) REFERENCES moli_users(id)
);
INSERT INTO moli_ticket_messages (id,ticket_id,user_id,author_role,content,created_at)
 SELECT t.id,t.id,NULL,'admin',t.reply,t.updated_at FROM moli_tickets t
 WHERE t.reply IS NOT NULL AND t.reply<>''
 AND NOT EXISTS (SELECT 1 FROM moli_ticket_messages m WHERE m.id=t.id);
CREATE INDEX moli_ticket_messages_ticket ON moli_ticket_messages(ticket_id,created_at);
CREATE INDEX moli_tickets_user_updated ON moli_tickets(user_id,updated_at);
CREATE INDEX moli_tickets_status_updated ON moli_tickets(status,updated_at);
CREATE INDEX moli_payouts_provider_state ON moli_payouts(provider_id,state);
