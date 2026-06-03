-- Vista completa para GET /tickets/history (sin enriquecimiento GLPI).
-- Ejecutar como admin en la BD soporte. Ver docs/VISTA-HISTORIAL-MYSQL.md.

DROP VIEW IF EXISTS v_asistia_ticket_history;

CREATE VIEW v_asistia_ticket_history AS
SELECT
  t.id AS ticket_id,
  t.entities_id,
  t.is_deleted,
  t.name AS subject,
  t.content AS description_raw,
  CASE t.type
    WHEN 1 THEN 'incident'
    WHEN 2 THEN 'request'
    ELSE 'incident'
  END AS type,
  t.type AS type_glpi,
  CASE t.status
    WHEN 1 THEN 'new'
    WHEN 2 THEN 'assigned'
    WHEN 3 THEN 'planned'
    WHEN 4 THEN 'waiting'
    WHEN 5 THEN 'solved'
    WHEN 6 THEN 'closed'
    ELSE 'new'
  END AS status,
  t.status AS status_glpi,
  CASE t.urgency
    WHEN 1 THEN 'very_low'
    WHEN 2 THEN 'low'
    WHEN 3 THEN 'medium'
    WHEN 4 THEN 'high'
    WHEN 5 THEN 'very_high'
    ELSE 'medium'
  END AS urgency,
  t.urgency AS urgency_glpi,
  t.itilcategories_id AS category_id,
  cat.completename AS category_name,
  cat.name AS category_name_short,
  t.locations_id AS location_id,
  loc.completename AS location_name,
  loc.name AS location_name_short,
  t.date AS created_at,
  t.date_mod AS updated_at,
  req.users_id AS requester_id,
  CASE
    WHEN NULLIF(TRIM(CONCAT(
      COALESCE(NULLIF(TRIM(ru.firstname), ''), ''),
      CASE
        WHEN NULLIF(TRIM(ru.firstname), '') IS NOT NULL
         AND NULLIF(TRIM(ru.realname), '') IS NOT NULL
        THEN ' '
        ELSE ''
      END,
      COALESCE(NULLIF(TRIM(ru.realname), ''), '')
    )), '') IS NOT NULL
    THEN TRIM(CONCAT(
      COALESCE(NULLIF(TRIM(ru.firstname), ''), ''),
      CASE
        WHEN NULLIF(TRIM(ru.firstname), '') IS NOT NULL
         AND NULLIF(TRIM(ru.realname), '') IS NOT NULL
        THEN ' '
        ELSE ''
      END,
      COALESCE(NULLIF(TRIM(ru.realname), ''), '')
    ))
    ELSE ru.name
  END AS requester_name,
  req_mail.email AS requester_email,
  tech.users_id AS technician_id,
  CASE
    WHEN NULLIF(TRIM(CONCAT(
      COALESCE(NULLIF(TRIM(tu.firstname), ''), ''),
      CASE
        WHEN NULLIF(TRIM(tu.firstname), '') IS NOT NULL
         AND NULLIF(TRIM(tu.realname), '') IS NOT NULL
        THEN ' '
        ELSE ''
      END,
      COALESCE(NULLIF(TRIM(tu.realname), ''), '')
    )), '') IS NOT NULL
    THEN TRIM(CONCAT(
      COALESCE(NULLIF(TRIM(tu.firstname), ''), ''),
      CASE
        WHEN NULLIF(TRIM(tu.firstname), '') IS NOT NULL
         AND NULLIF(TRIM(tu.realname), '') IS NOT NULL
        THEN ' '
        ELSE ''
      END,
      COALESCE(NULLIF(TRIM(tu.realname), ''), '')
    ))
    ELSE tu.name
  END AS technician_name,
  tech_mail.email AS technician_email
FROM glpi_tickets t
LEFT JOIN glpi_tickets_users req
  ON req.tickets_id = t.id
 AND req.type = 1
 AND req.id = (
   SELECT MIN(tu_min.id)
   FROM glpi_tickets_users tu_min
   WHERE tu_min.tickets_id = t.id
     AND tu_min.type = 1
 )
LEFT JOIN glpi_users ru
  ON ru.id = req.users_id
 AND ru.is_deleted = 0
LEFT JOIN (
  SELECT e.users_id, e.email
  FROM glpi_useremails e
  INNER JOIN (
    SELECT users_id, MIN(id) AS pick_id
    FROM glpi_useremails
    WHERE is_default = 1
    GROUP BY users_id
  ) def ON def.pick_id = e.id
) req_mail ON req_mail.users_id = req.users_id
LEFT JOIN glpi_tickets_users tech
  ON tech.tickets_id = t.id
 AND tech.type = 2
 AND tech.id = (
   SELECT MIN(tu_min.id)
   FROM glpi_tickets_users tu_min
   WHERE tu_min.tickets_id = t.id
     AND tu_min.type = 2
 )
LEFT JOIN glpi_users tu
  ON tu.id = tech.users_id
 AND tu.is_deleted = 0
LEFT JOIN (
  SELECT e.users_id, e.email
  FROM glpi_useremails e
  INNER JOIN (
    SELECT users_id, MIN(id) AS pick_id
    FROM glpi_useremails
    WHERE is_default = 1
    GROUP BY users_id
  ) def ON def.pick_id = e.id
) tech_mail ON tech_mail.users_id = tech.users_id
LEFT JOIN glpi_itilcategories cat
  ON cat.id = t.itilcategories_id
LEFT JOIN glpi_locations loc
  ON loc.id = t.locations_id
WHERE t.is_deleted = 0;
