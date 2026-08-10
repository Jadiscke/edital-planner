import type { Pool } from "pg";

export async function assertRuntimeDatabaseRole(pool: Pool): Promise<void> {
  const result = await pool.query<{ role: string; can_create: boolean; elevated: boolean; owns_schema: boolean; owns_relations: boolean; dangerous_privileges: boolean; inherits_prohibited_role: boolean }>(
    `SELECT current_user AS role,
      has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
      (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls) AS elevated,
      EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'public' AND pg_get_userbyid(n.nspowner) = current_user) AS owns_schema,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m') AND pg_get_userbyid(c.relowner)=current_user) AS owns_relations
      ,EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
        (has_table_privilege(current_user,c.oid,'TRUNCATE') OR has_table_privilege(current_user,c.oid,'REFERENCES') OR has_table_privilege(current_user,c.oid,'TRIGGER'))) AS dangerous_privileges
      ,EXISTS (SELECT 1 FROM pg_roles inherited WHERE inherited.rolname <> current_user AND pg_has_role(current_user,inherited.oid,'MEMBER') AND
        (inherited.rolsuper OR inherited.rolcreatedb OR inherited.rolcreaterole OR inherited.rolreplication OR inherited.rolbypassrls OR
         EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND n.nspowner=inherited.oid) OR
         EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=inherited.oid))) AS inherits_prohibited_role
     FROM pg_roles r WHERE r.rolname = current_user`,
  );
  const role = result.rows[0];
  if (!role || role.can_create || role.elevated || role.owns_schema || role.owns_relations || role.dangerous_privileges || role.inherits_prohibited_role) {
    throw new Error(`Runtime database role ${role?.role ?? "unknown"} must be non-elevated, non-owning, have no DDL-capable memberships, and only safe DML privileges`);
  }
}
